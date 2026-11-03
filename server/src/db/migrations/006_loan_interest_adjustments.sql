-- FinTrack Migration 006: auditable flat-interest credits and cash refunds.
-- Additive extension: migrations 001-005 remain unchanged.

-- Records excess flat-rate interest removed at early settlement. A cash_refund
-- must have one linked, loan-generated accounting transaction. A loan_credit
-- has no cash transaction and is consumed through loan_interest_credit_applications.
CREATE TABLE loan_interest_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  debt_id UUID NOT NULL,
  repayment_id UUID NOT NULL,
  entry_type VARCHAR(16) NOT NULL,
  reverses_adjustment_id UUID,
  adjustment_type VARCHAR(32) NOT NULL DEFAULT 'flat_unearned_interest',
  disposition VARCHAR(16) NOT NULL,
  amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  effective_date DATE NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_loan_interest_adjustment_entry
    CHECK (
      (entry_type = 'credit' AND reverses_adjustment_id IS NULL)
      OR (entry_type = 'reversal' AND reverses_adjustment_id IS NOT NULL)
    ),
  CONSTRAINT chk_loan_interest_adjustment_type
    CHECK (adjustment_type = 'flat_unearned_interest'),
  CONSTRAINT chk_loan_interest_adjustment_disposition
    CHECK (disposition IN ('cash_refund', 'loan_credit')),
  CONSTRAINT uq_loan_interest_adjustments_user_debt_id
    UNIQUE (user_id, debt_id, id),
  CONSTRAINT uq_loan_interest_adjustments_repayment
    UNIQUE (user_id, debt_id, repayment_id),
  CONSTRAINT fk_loan_interest_adjustments_debt_owner
    FOREIGN KEY (user_id, debt_id)
    REFERENCES debt_records(user_id, id)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT fk_loan_interest_adjustments_repayment_owner
    FOREIGN KEY (user_id, debt_id, repayment_id)
    REFERENCES debt_repayments(user_id, debt_id, id)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT fk_loan_interest_adjustments_reversal_owner
    FOREIGN KEY (user_id, debt_id, reverses_adjustment_id)
    REFERENCES loan_interest_adjustments(user_id, debt_id, id)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE UNIQUE INDEX uq_loan_interest_adjustments_single_reversal
  ON loan_interest_adjustments(reverses_adjustment_id)
  WHERE entry_type = 'reversal';

CREATE INDEX idx_loan_interest_adjustments_user_debt_date
  ON loan_interest_adjustments(user_id, debt_id, effective_date DESC);

-- Non-cash credit usage is an append-only ledger. Applications can be reversed
-- by appending an equal reversal row; the source credit amount is never edited.
CREATE TABLE loan_interest_credit_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  debt_id UUID NOT NULL,
  adjustment_id UUID NOT NULL,
  installment_id UUID NOT NULL,
  repayment_id UUID,
  entry_type VARCHAR(16) NOT NULL,
  reverses_application_id UUID,
  applied_component VARCHAR(16) NOT NULL,
  amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  effective_date DATE NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_loan_interest_credit_application_entry
    CHECK (
      (entry_type = 'application' AND reverses_application_id IS NULL)
      OR (entry_type = 'reversal' AND reverses_application_id IS NOT NULL)
    ),
  CONSTRAINT chk_loan_interest_credit_application_component
    CHECK (applied_component IN ('principal', 'interest')),
  CONSTRAINT uq_loan_interest_credit_applications_user_debt_id
    UNIQUE (user_id, debt_id, id),
  CONSTRAINT fk_loan_interest_credit_application_adjustment_owner
    FOREIGN KEY (user_id, debt_id, adjustment_id)
    REFERENCES loan_interest_adjustments(user_id, debt_id, id)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT fk_loan_interest_credit_application_installment_owner
    FOREIGN KEY (user_id, debt_id, installment_id)
    REFERENCES loan_installments(user_id, debt_id, id)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT fk_loan_interest_credit_application_repayment_owner
    FOREIGN KEY (user_id, debt_id, repayment_id)
    REFERENCES debt_repayments(user_id, debt_id, id)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT fk_loan_interest_credit_application_reversal_owner
    FOREIGN KEY (user_id, debt_id, reverses_application_id)
    REFERENCES loan_interest_credit_applications(user_id, debt_id, id)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE UNIQUE INDEX uq_loan_interest_credit_application_single_reversal
  ON loan_interest_credit_applications(reverses_application_id)
  WHERE entry_type = 'reversal';

CREATE INDEX idx_loan_interest_credit_applications_source
  ON loan_interest_credit_applications(user_id, debt_id, adjustment_id, effective_date);

CREATE INDEX idx_loan_interest_credit_applications_installment
  ON loan_interest_credit_applications(user_id, debt_id, installment_id);

-- Extend the existing immutable transaction-link ledger with an explicit
-- adjustment relationship. Existing link rows keep adjustment_id NULL.
ALTER TABLE loan_transaction_links
  ADD COLUMN adjustment_id UUID;

ALTER TABLE loan_transaction_links
  DROP CONSTRAINT chk_loan_transaction_link_component,
  ADD CONSTRAINT chk_loan_transaction_link_component
    CHECK (
      (component = 'disbursement_principal'
        AND repayment_id IS NULL AND adjustment_id IS NULL)
      OR (component IN ('repayment_principal', 'repayment_interest')
        AND repayment_id IS NOT NULL AND adjustment_id IS NULL)
      OR (component = 'interest_adjustment'
        AND repayment_id IS NULL AND adjustment_id IS NOT NULL)
    ),
  ADD CONSTRAINT fk_loan_transaction_link_adjustment_owner
    FOREIGN KEY (user_id, debt_id, adjustment_id)
    REFERENCES loan_interest_adjustments(user_id, debt_id, id)
    DEFERRABLE INITIALLY DEFERRED;

CREATE UNIQUE INDEX uq_loan_transaction_link_adjustment
  ON loan_transaction_links(adjustment_id)
  WHERE component = 'interest_adjustment';

-- Validate a refund/reversal's accounting row against its loan adjustment.
CREATE OR REPLACE FUNCTION assert_loan_interest_adjustment_transaction(
  p_link_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  adjustment_entry_type VARCHAR(16);
  adjustment_disposition VARCHAR(16);
  adjustment_amount NUMERIC(15, 2);
  adjustment_date DATE;
  adjustment_repayment_id UUID;
  loan_type VARCHAR(20);
  loan_interest_method VARCHAR(16);
  loan_is_legacy_unlinked BOOLEAN;
  loan_account_id UUID;
  loan_currency VARCHAR(3);
  repayment_type VARCHAR(16);
  repayment_date DATE;
  repayment_account_id UUID;
  repayment_legacy_unallocated BOOLEAN;
  repayment_reverses_id UUID;
  tx_type VARCHAR(20);
  tx_amount NUMERIC(15, 2);
  tx_date DATE;
  tx_account_id UUID;
  tx_to_account_id UUID;
  tx_is_loan_generated BOOLEAN;
  link_amount NUMERIC(15, 2);
  selected_account_currency VARCHAR(3);
  expected_tx_type VARCHAR(20);
BEGIN
  SELECT a.entry_type, a.disposition, a.amount, a.effective_date,
         a.repayment_id, d.type, d.interest_method, d.account_id,
         d.currency, r.entry_type, r.repayment_date, r.account_id,
         r.is_legacy_unallocated, r.reverses_repayment_id, t.type, t.amount, t.date, t.account_id,
         t.to_account_id, t.is_loan_generated, l.amount
    INTO adjustment_entry_type, adjustment_disposition, adjustment_amount,
         adjustment_date, adjustment_repayment_id, loan_type,
         loan_interest_method, loan_account_id, loan_currency,
         repayment_type, repayment_date, repayment_account_id,
         repayment_legacy_unallocated, repayment_reverses_id, tx_type, tx_amount, tx_date, tx_account_id,
         tx_to_account_id, tx_is_loan_generated, link_amount
    FROM loan_transaction_links l
    JOIN loan_interest_adjustments a
      ON a.id = l.adjustment_id AND a.user_id = l.user_id AND a.debt_id = l.debt_id
    JOIN debt_records d ON d.id = l.debt_id AND d.user_id = l.user_id
    JOIN debt_repayments r
      ON r.id = a.repayment_id AND r.user_id = a.user_id AND r.debt_id = a.debt_id
    JOIN transactions t ON t.id = l.transaction_id AND t.user_id = l.user_id
   WHERE l.id = p_link_id AND l.component = 'interest_adjustment';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Interest-adjustment transaction link % is incomplete or has mismatched ownership', p_link_id
      USING ERRCODE = '23514';
  END IF;

  IF adjustment_disposition <> 'cash_refund'
     OR loan_interest_method <> 'flat'
     OR loan_account_id IS NULL
     OR adjustment_amount IS DISTINCT FROM link_amount
     OR adjustment_amount IS DISTINCT FROM tx_amount
     OR adjustment_date IS DISTINCT FROM repayment_date
     OR adjustment_date IS DISTINCT FROM tx_date
     OR repayment_account_id IS DISTINCT FROM loan_account_id
     OR repayment_legacy_unallocated IS DISTINCT FROM FALSE
     OR tx_is_loan_generated IS DISTINCT FROM TRUE
     OR tx_account_id IS DISTINCT FROM loan_account_id
     OR tx_to_account_id IS NOT NULL THEN
    RAISE EXCEPTION 'Interest-adjustment transaction link % does not match its loan, repayment, amount, date, or account', p_link_id
      USING ERRCODE = '23514';
  END IF;

  IF (adjustment_entry_type = 'credit' AND repayment_type <> 'payment')
     OR (adjustment_entry_type = 'reversal' AND repayment_type <> 'reversal') THEN
    RAISE EXCEPTION 'Interest-adjustment link % must match its payment or reversal entry', p_link_id
      USING ERRCODE = '23514';
  END IF;

  IF adjustment_entry_type = 'credit' THEN
    expected_tx_type := CASE loan_type
      WHEN 'lent' THEN 'expense'
      WHEN 'borrowed' THEN 'income'
      ELSE NULL
    END;
  ELSE
    expected_tx_type := CASE loan_type
      WHEN 'lent' THEN 'income'
      WHEN 'borrowed' THEN 'expense'
      ELSE NULL
    END;
  END IF;

  IF expected_tx_type IS NULL OR tx_type <> expected_tx_type THEN
    RAISE EXCEPTION 'Interest-adjustment transaction link % has the wrong accounting type for the loan direction', p_link_id
      USING ERRCODE = '23514';
  END IF;

  SELECT UPPER(a.currency)
    INTO selected_account_currency
    FROM accounts a
   WHERE a.id = loan_account_id AND a.user_id = (
     SELECT l.user_id FROM loan_transaction_links l WHERE l.id = p_link_id
   )
   FOR SHARE;

  IF NOT FOUND OR selected_account_currency IS DISTINCT FROM loan_currency THEN
    RAISE EXCEPTION 'Interest-adjustment account currency does not match the loan currency'
      USING ERRCODE = '23514';
  END IF;

  IF adjustment_entry_type = 'reversal'
     AND repayment_reverses_id IS DISTINCT FROM (
       SELECT original_adjustment.repayment_id
         FROM loan_interest_adjustments reversal_adjustment
         JOIN loan_interest_adjustments original_adjustment
           ON original_adjustment.id = reversal_adjustment.reverses_adjustment_id
          AND original_adjustment.user_id = reversal_adjustment.user_id
          AND original_adjustment.debt_id = reversal_adjustment.debt_id
        WHERE reversal_adjustment.repayment_id = adjustment_repayment_id
          AND reversal_adjustment.entry_type = 'reversal'
     ) THEN
    RAISE EXCEPTION 'Interest-adjustment reversal transaction link % does not reverse its original repayment', p_link_id
      USING ERRCODE = '23514';
  END IF;
END;
$$;

-- Replace the migration-004 validator only to dispatch the new component;
-- existing disbursement and repayment checks are retained verbatim in behavior.
CREATE OR REPLACE FUNCTION assert_loan_transaction_link_integrity(
  p_link_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  link_row loan_transaction_links%ROWTYPE;
  loan_type VARCHAR(20);
  loan_amount NUMERIC(15, 2);
  loan_start_date DATE;
  loan_account_id UUID;
  loan_currency VARCHAR(3);
  selected_account_currency VARCHAR(3);
  payment_type VARCHAR(16);
  payment_date DATE;
  payment_account_id UUID;
  tx_type VARCHAR(20);
  tx_amount NUMERIC(15, 2);
  tx_date DATE;
  tx_account_id UUID;
  tx_to_account_id UUID;
  tx_is_loan_generated BOOLEAN;
  expected_component_amount NUMERIC(15, 2);
BEGIN
  SELECT * INTO link_row
    FROM loan_transaction_links
   WHERE id = p_link_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF link_row.component = 'interest_adjustment' THEN
    PERFORM assert_loan_interest_adjustment_transaction(p_link_id);
    RETURN;
  END IF;

  SELECT d.type, d.amount, d.start_date, d.account_id, d.currency
    INTO loan_type, loan_amount, loan_start_date, loan_account_id, loan_currency
    FROM debt_records d
   WHERE d.id = link_row.debt_id AND d.user_id = link_row.user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan transaction link % refers to a missing or different owner loan', p_link_id
      USING ERRCODE = '23514';
  END IF;
  IF loan_account_id IS NULL THEN
    RAISE EXCEPTION 'Loan % must have a selected account before creating linked transactions', link_row.debt_id
      USING ERRCODE = '23514';
  END IF;

  SELECT UPPER(a.currency) INTO selected_account_currency
    FROM accounts a
   WHERE a.id = loan_account_id AND a.user_id = link_row.user_id
   FOR SHARE;
  IF NOT FOUND OR selected_account_currency IS DISTINCT FROM loan_currency THEN
    RAISE EXCEPTION 'Loan % currency must match the selected account currency', link_row.debt_id
      USING ERRCODE = '23514';
  END IF;

  SELECT t.type, t.amount, t.date, t.account_id, t.to_account_id, t.is_loan_generated
    INTO tx_type, tx_amount, tx_date, tx_account_id, tx_to_account_id, tx_is_loan_generated
    FROM transactions t
   WHERE t.id = link_row.transaction_id AND t.user_id = link_row.user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan transaction link % refers to a missing or different owner transaction', p_link_id
      USING ERRCODE = '23514';
  END IF;
  IF tx_is_loan_generated IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Loan transaction link % must reference a transaction created by the loan service', p_link_id
      USING ERRCODE = '23514';
  END IF;
  IF tx_amount IS DISTINCT FROM link_row.amount THEN
    RAISE EXCEPTION 'Loan transaction link % amount must equal its transaction amount', p_link_id
      USING ERRCODE = '23514';
  END IF;
  IF (tx_account_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM accounts a WHERE a.id = tx_account_id AND a.user_id = link_row.user_id
      )) OR (tx_to_account_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM accounts a WHERE a.id = tx_to_account_id AND a.user_id = link_row.user_id
      )) THEN
    RAISE EXCEPTION 'Loan-generated transaction % must use accounts owned by the loan owner', link_row.transaction_id
      USING ERRCODE = '23514';
  END IF;

  IF link_row.component = 'disbursement_principal' THEN
    IF link_row.amount IS DISTINCT FROM loan_amount
       OR tx_type <> 'transfer'
       OR tx_date IS DISTINCT FROM loan_start_date
       OR (loan_type = 'lent' AND (tx_account_id IS DISTINCT FROM loan_account_id OR tx_to_account_id IS NOT NULL))
       OR (loan_type = 'borrowed' AND (tx_account_id IS NOT NULL OR tx_to_account_id IS DISTINCT FROM loan_account_id)) THEN
      RAISE EXCEPTION 'Disbursement link % does not match the loan amount, date, direction, or transaction type', p_link_id
        USING ERRCODE = '23514';
    END IF;
    RETURN;
  END IF;

  SELECT r.entry_type, r.repayment_date, r.account_id
    INTO payment_type, payment_date, payment_account_id
    FROM debt_repayments r
   WHERE r.id = link_row.repayment_id
     AND r.user_id = link_row.user_id
     AND r.debt_id = link_row.debt_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan transaction link % refers to a missing or different owner repayment', p_link_id
      USING ERRCODE = '23514';
  END IF;
  IF payment_account_id IS DISTINCT FROM loan_account_id THEN
    RAISE EXCEPTION 'Repayment % account must match the loan selected account', link_row.repayment_id
      USING ERRCODE = '23514';
  END IF;
  IF tx_date IS DISTINCT FROM payment_date THEN
    RAISE EXCEPTION 'Repayment transaction link % date must equal its repayment date', p_link_id
      USING ERRCODE = '23514';
  END IF;

  IF link_row.component = 'repayment_principal' THEN
    SELECT COALESCE(SUM(a.principal_allocated), 0)
      INTO expected_component_amount
      FROM loan_payment_allocations a
     WHERE a.user_id = link_row.user_id AND a.debt_id = link_row.debt_id
       AND a.repayment_id = link_row.repayment_id;
    IF tx_type <> 'transfer'
       OR (loan_type = 'lent' AND payment_type = 'payment'
           AND (tx_account_id IS NOT NULL OR tx_to_account_id IS DISTINCT FROM loan_account_id))
       OR (loan_type = 'borrowed' AND payment_type = 'payment'
           AND (tx_account_id IS DISTINCT FROM loan_account_id OR tx_to_account_id IS NOT NULL))
       OR (loan_type = 'lent' AND payment_type = 'reversal'
           AND (tx_account_id IS DISTINCT FROM loan_account_id OR tx_to_account_id IS NOT NULL))
       OR (loan_type = 'borrowed' AND payment_type = 'reversal'
           AND (tx_account_id IS NOT NULL OR tx_to_account_id IS DISTINCT FROM loan_account_id)) THEN
      RAISE EXCEPTION 'Principal transaction link % has the wrong transfer direction', p_link_id
        USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT COALESCE(SUM(a.interest_allocated), 0)
      INTO expected_component_amount
      FROM loan_payment_allocations a
     WHERE a.user_id = link_row.user_id AND a.debt_id = link_row.debt_id
       AND a.repayment_id = link_row.repayment_id;
    IF tx_account_id IS DISTINCT FROM loan_account_id OR tx_to_account_id IS NOT NULL
       OR (loan_type = 'lent' AND payment_type = 'payment' AND tx_type <> 'income')
       OR (loan_type = 'borrowed' AND payment_type = 'payment' AND tx_type <> 'expense')
       OR (loan_type = 'lent' AND payment_type = 'reversal' AND tx_type <> 'expense')
       OR (loan_type = 'borrowed' AND payment_type = 'reversal' AND tx_type <> 'income') THEN
      RAISE EXCEPTION 'Interest transaction link % has the wrong income/expense type or account direction', p_link_id
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF expected_component_amount IS DISTINCT FROM link_row.amount THEN
    RAISE EXCEPTION 'Loan transaction link % amount must equal its allocated component', p_link_id
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION validate_loan_interest_adjustment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  loan_interest_method VARCHAR(16);
  loan_is_legacy_unlinked BOOLEAN;
  loan_account_id UUID;
  repayment_type VARCHAR(16);
  repayment_date DATE;
  repayment_account_id UUID;
  repayment_legacy_unallocated BOOLEAN;
  repayment_reverses_id UUID;
  source_entry_type VARCHAR(16);
  source_disposition VARCHAR(16);
  source_amount NUMERIC(15, 2);
  source_repayment_id UUID;
  active_credit_applications NUMERIC(15, 2);
BEGIN
  SELECT d.interest_method, d.account_id, d.is_legacy_unlinked
    INTO loan_interest_method, loan_account_id, loan_is_legacy_unlinked
    FROM debt_records d
   WHERE d.id = NEW.debt_id AND d.user_id = NEW.user_id
   FOR UPDATE;
  IF NOT FOUND OR loan_interest_method <> 'flat' OR loan_is_legacy_unlinked THEN
    RAISE EXCEPTION 'Interest adjustments are supported only for flat-rate loans owned by the user'
      USING ERRCODE = '23514';
  END IF;

  SELECT r.entry_type, r.repayment_date, r.account_id, r.is_legacy_unallocated,
         r.reverses_repayment_id
    INTO repayment_type, repayment_date, repayment_account_id,
         repayment_legacy_unallocated, repayment_reverses_id
    FROM debt_repayments r
   WHERE r.id = NEW.repayment_id AND r.user_id = NEW.user_id AND r.debt_id = NEW.debt_id;
  IF NOT FOUND OR repayment_account_id IS DISTINCT FROM loan_account_id
     OR repayment_legacy_unallocated IS DISTINCT FROM FALSE
     OR NEW.effective_date IS DISTINCT FROM repayment_date THEN
    RAISE EXCEPTION 'Interest adjustment must match a repayment on the loan account and date'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.entry_type = 'credit' THEN
    IF repayment_type <> 'payment' THEN
      RAISE EXCEPTION 'An interest credit must be associated with a payment entry'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF repayment_type <> 'reversal' THEN
    RAISE EXCEPTION 'An interest-adjustment reversal must be associated with a repayment reversal'
      USING ERRCODE = '23514';
  END IF;

  SELECT a.entry_type, a.disposition, a.amount, a.repayment_id
    INTO source_entry_type, source_disposition, source_amount, source_repayment_id
    FROM loan_interest_adjustments a
   WHERE a.id = NEW.reverses_adjustment_id
     AND a.user_id = NEW.user_id AND a.debt_id = NEW.debt_id
   FOR UPDATE;
  IF NOT FOUND OR source_entry_type <> 'credit'
     OR NEW.disposition IS DISTINCT FROM source_disposition
     OR NEW.amount IS DISTINCT FROM source_amount
     OR repayment_reverses_id IS DISTINCT FROM source_repayment_id THEN
    RAISE EXCEPTION 'Interest-adjustment reversal must exactly reverse its original adjustment and repayment'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.disposition = 'loan_credit' THEN
    SELECT COALESCE(SUM(
             CASE WHEN ca.entry_type = 'application' THEN ca.amount ELSE -ca.amount END
           ), 0)
      INTO active_credit_applications
      FROM loan_interest_credit_applications ca
     WHERE ca.user_id = NEW.user_id AND ca.debt_id = NEW.debt_id
       AND ca.adjustment_id = NEW.reverses_adjustment_id;
    IF active_credit_applications <> 0 THEN
      RAISE EXCEPTION 'Loan credit cannot be reversed while any of it remains applied; reverse applications first'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_loan_interest_adjustment
BEFORE INSERT ON loan_interest_adjustments
FOR EACH ROW
EXECUTE FUNCTION validate_loan_interest_adjustment();

CREATE OR REPLACE FUNCTION preserve_loan_interest_adjustment_history()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Interest-adjustment history is immutable; append a reversal instead'
      USING ERRCODE = '23514';
  END IF;
  IF pg_trigger_depth() <= 1 THEN
    RAISE EXCEPTION 'Interest-adjustment history cannot be deleted'
      USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_preserve_loan_interest_adjustment_history
BEFORE UPDATE OR DELETE ON loan_interest_adjustments
FOR EACH ROW
EXECUTE FUNCTION preserve_loan_interest_adjustment_history();

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

CREATE TRIGGER trg_validate_loan_interest_credit_application
BEFORE INSERT ON loan_interest_credit_applications
FOR EACH ROW
EXECUTE FUNCTION validate_loan_interest_credit_application();

CREATE OR REPLACE FUNCTION preserve_loan_interest_credit_application_history()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Loan-credit application history is immutable; append a reversal instead'
      USING ERRCODE = '23514';
  END IF;
  IF pg_trigger_depth() <= 1 THEN
    RAISE EXCEPTION 'Loan-credit applications cannot be deleted'
      USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_preserve_loan_interest_credit_application_history
BEFORE UPDATE OR DELETE ON loan_interest_credit_applications
FOR EACH ROW
EXECUTE FUNCTION preserve_loan_interest_credit_application_history();

CREATE OR REPLACE FUNCTION assert_loan_interest_credit_application_total(
  p_user_id UUID,
  p_debt_id UUID,
  p_adjustment_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  source_amount NUMERIC(15, 2);
  source_entry_type VARCHAR(16);
  source_disposition VARCHAR(16);
  reversed_amount NUMERIC(15, 2);
  applied_amount NUMERIC(15, 2);
BEGIN
  SELECT a.amount, a.entry_type, a.disposition
    INTO source_amount, source_entry_type, source_disposition
    FROM loan_interest_adjustments a
   WHERE a.id = p_adjustment_id AND a.user_id = p_user_id AND a.debt_id = p_debt_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF source_entry_type <> 'credit' OR source_disposition <> 'loan_credit' THEN
    RAISE EXCEPTION 'Credit applications may only draw from loan-credit adjustments'
      USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(SUM(a.amount), 0)
    INTO reversed_amount
    FROM loan_interest_adjustments a
   WHERE a.user_id = p_user_id AND a.debt_id = p_debt_id
     AND a.entry_type = 'reversal' AND a.reverses_adjustment_id = p_adjustment_id;
  SELECT COALESCE(SUM(
           CASE WHEN ca.entry_type = 'application' THEN ca.amount ELSE -ca.amount END
         ), 0)
    INTO applied_amount
    FROM loan_interest_credit_applications ca
   WHERE ca.user_id = p_user_id AND ca.debt_id = p_debt_id
     AND ca.adjustment_id = p_adjustment_id;

  IF reversed_amount > source_amount
     OR applied_amount < 0
     OR applied_amount > source_amount - reversed_amount THEN
    RAISE EXCEPTION 'Loan-credit applications exceed the available unreversed credit'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION check_loan_interest_credit_application_total_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM assert_loan_interest_credit_application_total(
      OLD.user_id, OLD.debt_id, OLD.adjustment_id
    );
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM assert_loan_interest_credit_application_total(
      NEW.user_id, NEW.debt_id, NEW.adjustment_id
    );
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ct_loan_interest_credit_application_total
AFTER INSERT OR UPDATE OR DELETE ON loan_interest_credit_applications
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_loan_interest_credit_application_total_trigger();

CREATE OR REPLACE FUNCTION assert_loan_interest_adjustment_integrity(
  p_adjustment_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  adjustment_row loan_interest_adjustments%ROWTYPE;
  source_application_total NUMERIC(15, 2);
  linked_count BIGINT;
  linked_amount NUMERIC(15, 2);
BEGIN
  SELECT * INTO adjustment_row
    FROM loan_interest_adjustments
   WHERE id = p_adjustment_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COUNT(*), COALESCE(SUM(l.amount), 0)
    INTO linked_count, linked_amount
    FROM loan_transaction_links l
   WHERE l.user_id = adjustment_row.user_id
     AND l.debt_id = adjustment_row.debt_id
     AND l.adjustment_id = adjustment_row.id
     AND l.component = 'interest_adjustment';

  IF adjustment_row.disposition = 'cash_refund' THEN
    IF linked_count <> 1 OR linked_amount IS DISTINCT FROM adjustment_row.amount THEN
      RAISE EXCEPTION 'Cash-refund adjustment % must have exactly one matching transaction link', p_adjustment_id
        USING ERRCODE = '23514';
    END IF;
    PERFORM assert_loan_interest_adjustment_transaction(
      (SELECT l.id FROM loan_transaction_links l
        WHERE l.user_id = adjustment_row.user_id
          AND l.debt_id = adjustment_row.debt_id
          AND l.adjustment_id = adjustment_row.id
          AND l.component = 'interest_adjustment')
    );
  ELSE
    IF linked_count <> 0 THEN
      RAISE EXCEPTION 'A loan-credit adjustment must not create a cash transaction'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF adjustment_row.disposition = 'loan_credit' THEN
    PERFORM assert_loan_interest_credit_application_total(
      adjustment_row.user_id, adjustment_row.debt_id,
      CASE WHEN adjustment_row.entry_type = 'credit'
        THEN adjustment_row.id ELSE adjustment_row.reverses_adjustment_id END
    );
  END IF;

  IF adjustment_row.entry_type = 'reversal'
     AND adjustment_row.disposition = 'loan_credit' THEN
    SELECT COALESCE(SUM(
             CASE WHEN ca.entry_type = 'application' THEN ca.amount ELSE -ca.amount END
           ), 0)
      INTO source_application_total
      FROM loan_interest_credit_applications ca
     WHERE ca.user_id = adjustment_row.user_id
       AND ca.debt_id = adjustment_row.debt_id
       AND ca.adjustment_id = adjustment_row.reverses_adjustment_id;
    IF source_application_total <> 0 THEN
      RAISE EXCEPTION 'A loan-credit adjustment cannot be reversed while credit remains applied'
        USING ERRCODE = '23514';
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION check_loan_interest_adjustment_link_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.adjustment_id IS NOT NULL THEN
    PERFORM assert_loan_interest_adjustment_integrity(OLD.adjustment_id);
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.adjustment_id IS NOT NULL THEN
    PERFORM assert_loan_interest_adjustment_integrity(NEW.adjustment_id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ct_loan_interest_adjustment_link_integrity
AFTER INSERT OR UPDATE OR DELETE ON loan_transaction_links
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_loan_interest_adjustment_link_trigger();

CREATE OR REPLACE FUNCTION check_loan_interest_adjustment_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM assert_loan_interest_adjustment_integrity(OLD.id);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM assert_loan_interest_adjustment_integrity(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ct_loan_interest_adjustment_integrity
AFTER INSERT OR UPDATE OR DELETE ON loan_interest_adjustments
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_loan_interest_adjustment_trigger();

-- Repayment allocations and credit applications share installment capacity.
-- Lock in the same debt-then-installment order used by credit applications so
-- concurrent payments cannot race the remaining-obligation check.
CREATE OR REPLACE FUNCTION lock_loan_installment_for_allocation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM 1
    FROM debt_records d
   WHERE d.id = NEW.debt_id AND d.user_id = NEW.user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan allocation loan is missing or belongs to another user'
      USING ERRCODE = '23514';
  END IF;

  PERFORM 1
    FROM loan_installments i
   WHERE i.id = NEW.installment_id
     AND i.user_id = NEW.user_id AND i.debt_id = NEW.debt_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan allocation installment is missing or belongs to another loan'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_lock_loan_installment_for_allocation
BEFORE INSERT ON loan_payment_allocations
FOR EACH ROW
EXECUTE FUNCTION lock_loan_installment_for_allocation();

-- Once any loan-credit application references an installment, keep that
-- schedule row immutable; schedule changes must use a new version.
CREATE OR REPLACE FUNCTION preserve_credit_applied_loan_installment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM loan_interest_credit_applications ca
     WHERE ca.user_id = OLD.user_id
       AND ca.debt_id = OLD.debt_id
       AND ca.installment_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'An installment referenced by loan-credit history is immutable; create a new schedule version'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_preserve_credit_applied_loan_installment
BEFORE UPDATE ON loan_installments
FOR EACH ROW
EXECUTE FUNCTION preserve_credit_applied_loan_installment();
