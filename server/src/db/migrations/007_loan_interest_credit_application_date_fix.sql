CREATE OR REPLACE FUNCTION validate_loan_interest_credit_application()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  source_entry_type VARCHAR(16);
  source_disposition VARCHAR(16);
  source_effective_date DATE;
  original_entry_type VARCHAR(16);
  original_adjustment_id UUID;
  original_installment_id UUID;
  original_repayment_id UUID;
  original_component VARCHAR(16);
  original_amount NUMERIC(15, 2);
  original_effective_date DATE;
  repayment_type VARCHAR(16);
  repayment_date DATE;
  repayment_reverses_id UUID;
  installment_principal_due NUMERIC(15, 2);
  installment_interest_due NUMERIC(15, 2);
  paid_principal NUMERIC(15, 2);
  paid_interest NUMERIC(15, 2);
  credited_principal NUMERIC(15, 2);
  credited_interest NUMERIC(15, 2);
  remaining_component NUMERIC(15, 2);
BEGIN
  -- Serialize application and adjustment-reversal writes per loan. This gives
  -- all competing operations a consistent lock order before locking the source
  -- adjustment and target installment.
  PERFORM 1
    FROM debt_records d
   WHERE d.id = NEW.debt_id AND d.user_id = NEW.user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Credit application loan is missing or belongs to another user'
      USING ERRCODE = '23514';
  END IF;

  SELECT a.entry_type, a.disposition, a.effective_date
    INTO source_entry_type, source_disposition, source_effective_date
    FROM loan_interest_adjustments a
   WHERE a.id = NEW.adjustment_id AND a.user_id = NEW.user_id AND a.debt_id = NEW.debt_id
   FOR UPDATE;
  IF NOT FOUND OR source_entry_type <> 'credit' OR source_disposition <> 'loan_credit' THEN
    RAISE EXCEPTION 'A credit application must reference an unreversed loan-credit adjustment'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.effective_date < source_effective_date THEN
    RAISE EXCEPTION 'Credit application date cannot precede its source adjustment date'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.repayment_id IS NOT NULL THEN
    SELECT r.entry_type, r.repayment_date, r.reverses_repayment_id
      INTO repayment_type, repayment_date, repayment_reverses_id
      FROM debt_repayments r
     WHERE r.id = NEW.repayment_id AND r.user_id = NEW.user_id AND r.debt_id = NEW.debt_id;
    IF NOT FOUND
       OR (NEW.entry_type = 'application' AND repayment_type <> 'payment')
       OR (NEW.entry_type = 'reversal' AND repayment_type <> 'reversal')
       OR repayment_date IS DISTINCT FROM NEW.effective_date THEN
      RAISE EXCEPTION 'Credit application repayment reference has the wrong owner or entry type'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.entry_type = 'reversal' THEN
    SELECT ca.entry_type, ca.adjustment_id, ca.installment_id, ca.repayment_id,
           ca.applied_component, ca.amount, ca.effective_date
      INTO original_entry_type, original_adjustment_id, original_installment_id,
           original_repayment_id, original_component, original_amount, original_effective_date
      FROM loan_interest_credit_applications ca
     WHERE ca.id = NEW.reverses_application_id
       AND ca.user_id = NEW.user_id AND ca.debt_id = NEW.debt_id
     FOR KEY SHARE;
    IF NOT FOUND OR original_entry_type <> 'application'
       OR original_adjustment_id IS DISTINCT FROM NEW.adjustment_id
       OR original_installment_id IS DISTINCT FROM NEW.installment_id
       OR original_component IS DISTINCT FROM NEW.applied_component
       OR original_amount IS DISTINCT FROM NEW.amount THEN
      RAISE EXCEPTION 'Credit-application reversal must exactly match its original application'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.effective_date < original_effective_date THEN
      RAISE EXCEPTION 'Credit-application reversal date cannot precede its original application date'
        USING ERRCODE = '23514';
    END IF;
    IF original_repayment_id IS NOT NULL AND (
      NEW.repayment_id IS NULL OR repayment_reverses_id IS DISTINCT FROM original_repayment_id
    ) THEN
      RAISE EXCEPTION 'Credit-application reversal must reference the reversal of its original repayment'
        USING ERRCODE = '23514';
    END IF;
    IF original_repayment_id IS NULL AND NEW.repayment_id IS NOT NULL THEN
      RAISE EXCEPTION 'Credit-application reversal cannot attach to an unrelated repayment'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.entry_type = 'application' THEN
    SELECT i.principal_due, i.interest_due
      INTO installment_principal_due, installment_interest_due
      FROM loan_installments i
     WHERE i.id = NEW.installment_id
       AND i.user_id = NEW.user_id AND i.debt_id = NEW.debt_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Credit application installment is missing or belongs to another loan'
        USING ERRCODE = '23514';
    END IF;

    SELECT COALESCE(SUM(CASE WHEN r.entry_type = 'payment'
                             THEN a.principal_allocated
                             ELSE -a.principal_allocated END), 0),
           COALESCE(SUM(CASE WHEN r.entry_type = 'payment'
                             THEN a.interest_allocated
                             ELSE -a.interest_allocated END), 0)
      INTO paid_principal, paid_interest
      FROM loan_payment_allocations a
      JOIN debt_repayments r
        ON r.id = a.repayment_id AND r.user_id = a.user_id AND r.debt_id = a.debt_id
     WHERE a.user_id = NEW.user_id AND a.debt_id = NEW.debt_id
       AND a.installment_id = NEW.installment_id;

    SELECT COALESCE(SUM(CASE WHEN ca.entry_type = 'application'
                             AND ca.applied_component = 'principal' THEN ca.amount
                             WHEN ca.entry_type = 'reversal'
                             AND ca.applied_component = 'principal' THEN -ca.amount
                             ELSE 0 END), 0),
           COALESCE(SUM(CASE WHEN ca.entry_type = 'application'
                             AND ca.applied_component = 'interest' THEN ca.amount
                             WHEN ca.entry_type = 'reversal'
                             AND ca.applied_component = 'interest' THEN -ca.amount
                             ELSE 0 END), 0)
      INTO credited_principal, credited_interest
      FROM loan_interest_credit_applications ca
     WHERE ca.user_id = NEW.user_id AND ca.debt_id = NEW.debt_id
       AND ca.installment_id = NEW.installment_id;

    IF NEW.applied_component = 'principal' THEN
      remaining_component := installment_principal_due - paid_principal - credited_principal;
    ELSE
      remaining_component := installment_interest_due - paid_interest - credited_interest;
    END IF;
    IF remaining_component < 0 OR NEW.amount > remaining_component THEN
      RAISE EXCEPTION 'Credit application exceeds the installment remaining % obligation', NEW.applied_component
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
