-- FinTrack Database Migration 004: Loan management schema
-- Adds loan terms, versioned schedules, installment allocations, and
-- transaction links while retaining the existing debt tables and behavior.

-- Composite unique keys let loan-related foreign keys enforce ownership.
ALTER TABLE accounts
  ADD CONSTRAINT uq_accounts_user_id_id UNIQUE (user_id, id);

ALTER TABLE transactions
  ADD CONSTRAINT uq_transactions_user_id_id UNIQUE (user_id, id);

-- Defaults preserve all existing/manual transaction behavior. Loan services
-- explicitly mark their internally created cash entries before linking them.
ALTER TABLE transactions
  ADD COLUMN is_loan_generated BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE people
  ADD CONSTRAINT uq_people_user_id_id UNIQUE (user_id, id);

ALTER TABLE debt_records
  ADD CONSTRAINT uq_debt_records_user_id_id UNIQUE (user_id, id);

-- Extend the existing debt record into the loan agreement record.
ALTER TABLE debt_records
  ADD COLUMN start_date DATE,
  ADD COLUMN currency VARCHAR(3),
  ADD COLUMN interest_method VARCHAR(16) NOT NULL DEFAULT 'none',
  ADD COLUMN annual_rate_pct NUMERIC(9, 6) NOT NULL DEFAULT 0,
  ADD COLUMN repayment_mode VARCHAR(16) NOT NULL DEFAULT 'one_time',
  ADD COLUMN allocation_policy VARCHAR(40) NOT NULL DEFAULT 'oldest_due_interest_first',
  ADD COLUMN current_schedule_version INTEGER NOT NULL DEFAULT 1,
  -- Existing debt rows predate transaction linking; new loans must link a disbursement.
  ADD COLUMN is_legacy_unlinked BOOLEAN NOT NULL DEFAULT TRUE;

-- Backfill safely for any legacy debt records that exist at deployment time.
UPDATE debt_records d
SET start_date = COALESCE(d.start_date, d.created_at::date, CURRENT_DATE),
    currency = UPPER(COALESCE(
      d.currency,
      (SELECT a.currency FROM accounts a WHERE a.id = d.account_id AND a.user_id = d.user_id),
      (SELECT u.currency FROM users u WHERE u.id = d.user_id),
      'USD'
    ));

UPDATE debt_records
SET start_date = COALESCE(start_date, created_at::date, CURRENT_DATE),
    currency = COALESCE(currency, 'USD')
WHERE start_date IS NULL OR currency IS NULL;

ALTER TABLE debt_records
  ALTER COLUMN start_date SET DEFAULT CURRENT_DATE,
  ALTER COLUMN start_date SET NOT NULL,
  ALTER COLUMN currency SET NOT NULL,
  ALTER COLUMN is_legacy_unlinked SET DEFAULT FALSE,
  ADD CONSTRAINT chk_debt_records_currency_code
    CHECK (currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT chk_debt_records_interest_terms
    CHECK (
      (interest_method = 'none' AND annual_rate_pct = 0)
      OR (interest_method IN ('simple', 'flat') AND annual_rate_pct > 0)
    ),
  ADD CONSTRAINT chk_debt_records_repayment_mode
    CHECK (repayment_mode IN ('one_time', 'installments')),
  ADD CONSTRAINT chk_debt_records_allocation_policy
    CHECK (allocation_policy = 'oldest_due_interest_first'),
  ADD CONSTRAINT chk_debt_records_schedule_version
    CHECK (current_schedule_version > 0),
  ADD CONSTRAINT fk_debt_records_person_owner
    FOREIGN KEY (user_id, person_id)
    REFERENCES people(user_id, id)
    ON DELETE CASCADE,
  ADD CONSTRAINT fk_debt_records_account_owner
    FOREIGN KEY (user_id, account_id)
    REFERENCES accounts(user_id, id)
    DEFERRABLE INITIALLY DEFERRED;

-- Keep a loan's denomination aligned with its selected account even before
-- transaction links exist (including for legacy, unlinked records).
CREATE OR REPLACE FUNCTION enforce_debt_account_currency()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  selected_account_currency VARCHAR(3);
BEGIN
  IF NEW.account_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT UPPER(a.currency)
  INTO selected_account_currency
  FROM accounts a
  WHERE a.id = NEW.account_id
    AND a.user_id = NEW.user_id
  FOR SHARE;

  IF NOT FOUND OR selected_account_currency IS DISTINCT FROM NEW.currency THEN
    RAISE EXCEPTION 'Loan currency must match the selected account currency'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_debt_account_currency
BEFORE INSERT OR UPDATE OF account_id, currency, user_id ON debt_records
FOR EACH ROW
EXECUTE FUNCTION enforce_debt_account_currency();

-- Add owner and reversal/idempotency support to existing repayments.
ALTER TABLE debt_repayments
  ADD COLUMN user_id UUID,
  ADD COLUMN entry_type VARCHAR(16) NOT NULL DEFAULT 'payment',
  ADD COLUMN reverses_repayment_id UUID,
  ADD COLUMN idempotency_key UUID,
  -- Existing amount-only repayments need an explicit allocation backfill later.
  ADD COLUMN is_legacy_unallocated BOOLEAN NOT NULL DEFAULT TRUE;

-- Backfill repayment ownership before making the column mandatory.
UPDATE debt_repayments r
SET user_id = d.user_id
FROM debt_records d
WHERE d.id = r.debt_id
  AND r.user_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM debt_repayments WHERE user_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot backfill debt_repayments.user_id: a repayment has no parent debt record';
  END IF;
END;
$$;

ALTER TABLE debt_repayments
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN is_legacy_unallocated SET DEFAULT FALSE,
  ADD CONSTRAINT uq_debt_repayments_user_debt_id
    UNIQUE (user_id, debt_id, id),
  ADD CONSTRAINT chk_debt_repayments_entry_type
    CHECK (
      (entry_type = 'payment' AND reverses_repayment_id IS NULL)
      OR (entry_type = 'reversal' AND reverses_repayment_id IS NOT NULL)
    ),
  ADD CONSTRAINT fk_debt_repayments_user
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE,
  ADD CONSTRAINT fk_debt_repayments_debt_owner
    FOREIGN KEY (user_id, debt_id)
    REFERENCES debt_records(user_id, id)
    DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT fk_debt_repayments_reversal_owner
    FOREIGN KEY (user_id, debt_id, reverses_repayment_id)
    REFERENCES debt_repayments(user_id, debt_id, id)
    DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT fk_debt_repayments_account_owner
    FOREIGN KEY (user_id, account_id)
    REFERENCES accounts(user_id, id)
    DEFERRABLE INITIALLY DEFERRED;

-- Documented replacement: the original inline debt_id FK used ON DELETE
-- CASCADE, which could erase repayment history when a debt record was deleted.
-- Deferred NO ACTION preserves user-wide cascades (both tables cascade from
-- users) while rejecting deletion of a loan that still has repayment records.
ALTER TABLE debt_repayments
  DROP CONSTRAINT debt_repayments_debt_id_fkey;

ALTER TABLE debt_repayments
  ADD CONSTRAINT fk_debt_repayments_debt_record
    FOREIGN KEY (debt_id)
    REFERENCES debt_records(id)
    DEFERRABLE INITIALLY DEFERRED;

CREATE UNIQUE INDEX uq_debt_repayments_idempotency
  ON debt_repayments(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX uq_debt_repayments_single_reversal
  ON debt_repayments(reverses_repayment_id)
  WHERE entry_type = 'reversal';

CREATE INDEX idx_debt_repayments_user_loan_date
  ON debt_repayments(user_id, debt_id, repayment_date DESC);

CREATE OR REPLACE FUNCTION validate_debt_repayment_reversal()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  original_type VARCHAR(16);
  original_amount NUMERIC(15, 2);
BEGIN
  IF TG_OP = 'UPDATE'
     AND EXISTS (
       SELECT 1 FROM debt_repayments r
       WHERE r.reverses_repayment_id = OLD.id
     ) THEN
    RAISE EXCEPTION 'A repayment with a recorded reversal cannot be modified'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.entry_type = 'reversal' THEN
    IF NEW.reverses_repayment_id IS NULL
       OR NEW.reverses_repayment_id = NEW.id THEN
      RAISE EXCEPTION 'A reversal must reference a different original payment'
        USING ERRCODE = '23514';
    END IF;

    SELECT r.entry_type, r.amount
    INTO original_type, original_amount
    FROM debt_repayments r
    WHERE r.id = NEW.reverses_repayment_id
      AND r.user_id = NEW.user_id
      AND r.debt_id = NEW.debt_id;

    IF NOT FOUND OR original_type <> 'payment' THEN
      RAISE EXCEPTION 'A reversal must reference an original payment from the same user and loan'
        USING ERRCODE = '23514';
    END IF;

    -- Reversals are full-payment reversals; corrections are recorded as a
    -- reversal followed by a replacement payment, never by editing history.
    IF NEW.amount IS DISTINCT FROM original_amount THEN
      RAISE EXCEPTION 'A reversal amount must equal the original payment amount'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_debt_repayment_reversal
BEFORE INSERT OR UPDATE ON debt_repayments
FOR EACH ROW
EXECUTE FUNCTION validate_debt_repayment_reversal();

CREATE OR REPLACE FUNCTION preserve_debt_repayment_history()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only the explicit legacy-allocation marker may be changed during a
  -- controlled backfill. Payment facts are corrected by appended reversals.
  IF ROW(
       NEW.id, NEW.user_id, NEW.debt_id, NEW.amount, NEW.repayment_date,
       NEW.account_id, NEW.note, NEW.entry_type, NEW.reverses_repayment_id,
       NEW.idempotency_key, NEW.created_at
     ) IS DISTINCT FROM ROW(
       OLD.id, OLD.user_id, OLD.debt_id, OLD.amount, OLD.repayment_date,
       OLD.account_id, OLD.note, OLD.entry_type, OLD.reverses_repayment_id,
       OLD.idempotency_key, OLD.created_at
     ) THEN
    RAISE EXCEPTION 'Repayment history is immutable; record a reversal and replacement instead'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_preserve_debt_repayment_history
BEFORE UPDATE ON debt_repayments
FOR EACH ROW
EXECUTE FUNCTION preserve_debt_repayment_history();

CREATE OR REPLACE FUNCTION prevent_posted_debt_repayment_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- User deletion reaches child rows through PostgreSQL's referential-action
  -- triggers. Permit those cascades, but reject direct repayment deletion.
  IF pg_trigger_depth() <= 1 THEN
    RAISE EXCEPTION 'Posted repayment history cannot be deleted; record a reversal instead'
      USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_prevent_posted_debt_repayment_delete
BEFORE DELETE ON debt_repayments
FOR EACH ROW
EXECUTE FUNCTION prevent_posted_debt_repayment_delete();

-- One schedule version represents a complete planned repayment schedule.
CREATE TABLE loan_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  debt_id UUID NOT NULL,
  version_no INTEGER NOT NULL CHECK (version_no > 0),
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT uq_loan_schedules_user_debt_version
    UNIQUE (user_id, debt_id, version_no),
  CONSTRAINT uq_loan_schedules_user_debt_id
    UNIQUE (user_id, debt_id, id),
  CONSTRAINT chk_loan_schedules_created_by_owner
    CHECK (created_by IS NULL OR created_by = user_id),
  CONSTRAINT fk_loan_schedules_debt_owner
    FOREIGN KEY (user_id, debt_id)
    REFERENCES debt_records(user_id, id)
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX uq_loan_schedules_one_current
  ON loan_schedules(debt_id)
  WHERE is_current;

CREATE INDEX idx_loan_schedules_user_loan
  ON loan_schedules(user_id, debt_id, version_no DESC);

CREATE OR REPLACE FUNCTION preserve_loan_schedule_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.debt_id IS DISTINCT FROM OLD.debt_id
     OR NEW.version_no IS DISTINCT FROM OLD.version_no THEN
    RAISE EXCEPTION 'Loan schedule identity and version are immutable; create a new schedule version'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_preserve_loan_schedule_identity
BEFORE UPDATE ON loan_schedules
FOR EACH ROW
EXECUTE FUNCTION preserve_loan_schedule_identity();

CREATE OR REPLACE FUNCTION prevent_loan_schedule_version_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Preserve versions during ordinary edits. Cascading parent deletion is
  -- allowed so a user-wide delete can remove that user's complete data set.
  IF pg_trigger_depth() <= 1 THEN
    RAISE EXCEPTION 'Loan schedule versions are historical records and cannot be deleted'
      USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_prevent_loan_schedule_version_delete
BEFORE DELETE ON loan_schedules
FOR EACH ROW
EXECUTE FUNCTION prevent_loan_schedule_version_delete();

-- Give any legacy debt record a matching current schedule header. No historic
-- installment rows are inferred because the old schema did not store a schedule.
INSERT INTO loan_schedules (user_id, debt_id, version_no, is_current, created_at)
SELECT user_id, id, current_schedule_version, TRUE, created_at
FROM debt_records;

CREATE OR REPLACE FUNCTION assert_debt_current_schedule_version(p_debt_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  expected_version INTEGER;
  actual_version INTEGER;
  current_count BIGINT;
BEGIN
  -- Serialize concurrent schedule edits for this loan.
  SELECT current_schedule_version
  INTO expected_version
  FROM debt_records
  WHERE id = p_debt_id
  FOR UPDATE;

  -- The parent may have been removed as part of a user deletion cascade.
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COUNT(*), MAX(version_no)
  INTO current_count, actual_version
  FROM loan_schedules
  WHERE debt_id = p_debt_id AND is_current;

  IF current_count <> 1 OR actual_version IS DISTINCT FROM expected_version THEN
    RAISE EXCEPTION 'Loan % must have exactly one current schedule matching current_schedule_version %',
      p_debt_id, expected_version
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION check_debt_current_schedule_version_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'debt_records' THEN
    PERFORM assert_debt_current_schedule_version(NEW.id);
  ELSIF TG_OP = 'INSERT' THEN
    PERFORM assert_debt_current_schedule_version(NEW.debt_id);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM assert_debt_current_schedule_version(OLD.debt_id);
  ELSE
    PERFORM assert_debt_current_schedule_version(OLD.debt_id);
    IF NEW.debt_id IS DISTINCT FROM OLD.debt_id THEN
      PERFORM assert_debt_current_schedule_version(NEW.debt_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ct_debt_records_current_schedule_version
AFTER INSERT OR UPDATE ON debt_records
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_debt_current_schedule_version_trigger();

CREATE CONSTRAINT TRIGGER ct_loan_schedules_current_version
AFTER INSERT OR UPDATE OR DELETE ON loan_schedules
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_debt_current_schedule_version_trigger();

-- Installment status and amounts remaining are derived from allocations.
CREATE TABLE loan_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  debt_id UUID NOT NULL,
  schedule_id UUID NOT NULL,
  installment_number INTEGER NOT NULL CHECK (installment_number > 0),
  due_date DATE NOT NULL,
  principal_due NUMERIC(15, 2) NOT NULL CHECK (principal_due >= 0),
  interest_due NUMERIC(15, 2) NOT NULL CHECK (interest_due >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_loan_installment_amount_positive
    CHECK (principal_due + interest_due > 0),
  CONSTRAINT uq_loan_installments_schedule_number
    UNIQUE (user_id, debt_id, schedule_id, installment_number),
  CONSTRAINT uq_loan_installments_user_debt_id
    UNIQUE (user_id, debt_id, id),
  CONSTRAINT fk_loan_installments_schedule_owner
    FOREIGN KEY (user_id, debt_id, schedule_id)
    REFERENCES loan_schedules(user_id, debt_id, id)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX idx_loan_installments_loan_due
  ON loan_installments(user_id, debt_id, due_date);

CREATE INDEX idx_loan_installments_schedule_due
  ON loan_installments(schedule_id, due_date);

-- A payment may be applied partially to one or more installments.
CREATE TABLE loan_payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  debt_id UUID NOT NULL,
  repayment_id UUID NOT NULL,
  installment_id UUID NOT NULL,
  principal_allocated NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (principal_allocated >= 0),
  interest_allocated NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (interest_allocated >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_loan_allocation_amount_positive
    CHECK (principal_allocated + interest_allocated > 0),
  CONSTRAINT uq_loan_payment_allocation_installment
    UNIQUE (repayment_id, installment_id),
  CONSTRAINT fk_loan_allocation_repayment_owner
    FOREIGN KEY (user_id, debt_id, repayment_id)
    REFERENCES debt_repayments(user_id, debt_id, id)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT fk_loan_allocation_installment_owner
    FOREIGN KEY (user_id, debt_id, installment_id)
    REFERENCES loan_installments(user_id, debt_id, id)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX idx_loan_payment_allocations_installment
  ON loan_payment_allocations(user_id, debt_id, installment_id);

CREATE OR REPLACE FUNCTION prevent_posted_loan_allocation_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM debt_repayments r
    WHERE r.id = OLD.repayment_id
      AND r.user_id = OLD.user_id
      AND r.debt_id = OLD.debt_id
      AND NOT r.is_legacy_unallocated
  ) OR EXISTS (
    SELECT 1
    FROM debt_repayments r
    WHERE r.id = NEW.repayment_id
      AND r.user_id = NEW.user_id
      AND r.debt_id = NEW.debt_id
      AND NOT r.is_legacy_unallocated
  ) THEN
    RAISE EXCEPTION 'Posted payment allocations are immutable; reverse and replace the payment instead'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_posted_loan_allocation_update
BEFORE UPDATE ON loan_payment_allocations
FOR EACH ROW
EXECUTE FUNCTION prevent_posted_loan_allocation_update();

CREATE OR REPLACE FUNCTION prevent_loan_payment_allocation_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Allocations are part of immutable payment history. Permit FK-driven
  -- cascades (notably deleting a user), but not direct or coordinated DML.
  IF pg_trigger_depth() <= 1 THEN
    RAISE EXCEPTION 'Loan payment allocations cannot be deleted; reverse the payment instead'
      USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_prevent_loan_payment_allocation_delete
BEFORE DELETE ON loan_payment_allocations
FOR EACH ROW
EXECUTE FUNCTION prevent_loan_payment_allocation_delete();

CREATE OR REPLACE FUNCTION preserve_allocated_loan_schedule_installments()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Allow FK-driven cleanup when the owning user is deleted. Direct changes
  -- still pass through the allocation-history check below.
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM loan_installments i
    JOIN loan_payment_allocations a
      ON a.installment_id = i.id
     AND a.user_id = i.user_id
     AND a.debt_id = i.debt_id
    WHERE i.schedule_id = OLD.schedule_id
      AND i.user_id = OLD.user_id
      AND i.debt_id = OLD.debt_id
  ) THEN
    RAISE EXCEPTION 'A schedule version with allocated payments is immutable; create a new version'
      USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_preserve_allocated_loan_schedule_installments
BEFORE UPDATE OR DELETE ON loan_installments
FOR EACH ROW
EXECUTE FUNCTION preserve_allocated_loan_schedule_installments();

CREATE OR REPLACE FUNCTION assert_debt_repayment_allocations(
  p_user_id UUID,
  p_debt_id UUID,
  p_repayment_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  repayment_amount NUMERIC(15, 2);
  repayment_type VARCHAR(16);
  legacy_unallocated BOOLEAN;
  original_repayment_id UUID;
  allocated_total NUMERIC(15, 2);
  allocated_principal NUMERIC(15, 2);
  allocated_interest NUMERIC(15, 2);
  original_principal NUMERIC(15, 2);
  original_interest NUMERIC(15, 2);
BEGIN
  SELECT amount, entry_type, reverses_repayment_id, is_legacy_unallocated
  INTO repayment_amount, repayment_type, original_repayment_id, legacy_unallocated
  FROM debt_repayments
  WHERE id = p_repayment_id
    AND user_id = p_user_id
    AND debt_id = p_debt_id;

  -- A deleted repayment is checked by its foreign keys; it has no remaining
  -- allocation total to validate.
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Preserve amount-only historic repayments; newly inserted payments use
  -- the default FALSE and must have complete principal/interest allocations.
  IF legacy_unallocated THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(principal_allocated + interest_allocated), 0),
         COALESCE(SUM(principal_allocated), 0),
         COALESCE(SUM(interest_allocated), 0)
  INTO allocated_total, allocated_principal, allocated_interest
  FROM loan_payment_allocations
  WHERE repayment_id = p_repayment_id
    AND user_id = p_user_id
    AND debt_id = p_debt_id;

  IF allocated_total IS DISTINCT FROM repayment_amount THEN
    RAISE EXCEPTION 'Repayment % must be fully allocated: payment %, allocations %',
      p_repayment_id, repayment_amount, allocated_total
      USING ERRCODE = '23514';
  END IF;

  IF repayment_type = 'reversal' THEN
    SELECT COALESCE(SUM(a.principal_allocated), 0),
           COALESCE(SUM(a.interest_allocated), 0)
    INTO original_principal, original_interest
    FROM loan_payment_allocations a
    WHERE a.repayment_id = original_repayment_id
      AND a.user_id = p_user_id
      AND a.debt_id = p_debt_id;

    IF allocated_principal IS DISTINCT FROM original_principal
       OR allocated_interest IS DISTINCT FROM original_interest THEN
      RAISE EXCEPTION 'Reversal % must reverse the original principal and interest allocations exactly',
        p_repayment_id
        USING ERRCODE = '23514';
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION check_debt_repayment_allocations_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'debt_repayments' THEN
    IF TG_OP <> 'INSERT' THEN
      PERFORM assert_debt_repayment_allocations(OLD.user_id, OLD.debt_id, OLD.id);
    END IF;
    IF TG_OP <> 'DELETE' THEN
      PERFORM assert_debt_repayment_allocations(NEW.user_id, NEW.debt_id, NEW.id);
    END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN
      PERFORM assert_debt_repayment_allocations(OLD.user_id, OLD.debt_id, OLD.repayment_id);
    END IF;
    IF TG_OP <> 'DELETE' THEN
      PERFORM assert_debt_repayment_allocations(NEW.user_id, NEW.debt_id, NEW.repayment_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ct_debt_repayments_allocation_total
AFTER INSERT OR UPDATE OR DELETE ON debt_repayments
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_debt_repayment_allocations_trigger();

CREATE CONSTRAINT TRIGGER ct_loan_payment_allocations_total
AFTER INSERT OR UPDATE OR DELETE ON loan_payment_allocations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_debt_repayment_allocations_trigger();

-- Links every cash component to exactly one transaction. Principal uses a
-- one-sided transfer row; interest uses income (lender) or expense (borrower).
CREATE TABLE loan_transaction_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  debt_id UUID NOT NULL,
  repayment_id UUID,
  transaction_id UUID NOT NULL,
  component VARCHAR(32) NOT NULL,
  amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_loan_transaction_link_component
    CHECK (
      (component = 'disbursement_principal' AND repayment_id IS NULL)
      OR (component IN ('repayment_principal', 'repayment_interest') AND repayment_id IS NOT NULL)
    ),
  CONSTRAINT uq_loan_transaction_link_transaction UNIQUE (transaction_id),
  CONSTRAINT fk_loan_transaction_link_loan_owner
    FOREIGN KEY (user_id, debt_id)
    REFERENCES debt_records(user_id, id)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT fk_loan_transaction_link_repayment_owner
    FOREIGN KEY (user_id, debt_id, repayment_id)
    REFERENCES debt_repayments(user_id, debt_id, id)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT fk_loan_transaction_link_transaction_owner
    FOREIGN KEY (user_id, transaction_id)
    REFERENCES transactions(user_id, id)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE UNIQUE INDEX uq_loan_transaction_link_disbursement
  ON loan_transaction_links(debt_id)
  WHERE component = 'disbursement_principal';

CREATE UNIQUE INDEX uq_loan_transaction_link_repayment_component
  ON loan_transaction_links(repayment_id, component)
  WHERE repayment_id IS NOT NULL;

CREATE INDEX idx_loan_transaction_links_user_loan
  ON loan_transaction_links(user_id, debt_id, repayment_id);

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

  SELECT d.type, d.amount, d.start_date, d.account_id, d.currency
  INTO loan_type, loan_amount, loan_start_date, loan_account_id, loan_currency
  FROM debt_records d
  WHERE d.id = link_row.debt_id
    AND d.user_id = link_row.user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan transaction link % refers to a missing or different owner loan', p_link_id
      USING ERRCODE = '23514';
  END IF;

  IF loan_account_id IS NULL THEN
    RAISE EXCEPTION 'Loan % must have a selected account before creating linked transactions', link_row.debt_id
      USING ERRCODE = '23514';
  END IF;

  SELECT UPPER(a.currency)
  INTO selected_account_currency
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
  WHERE t.id = link_row.transaction_id
    AND t.user_id = link_row.user_id;

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
    WHERE a.user_id = link_row.user_id
      AND a.debt_id = link_row.debt_id
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
    WHERE a.user_id = link_row.user_id
      AND a.debt_id = link_row.debt_id
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

CREATE OR REPLACE FUNCTION assert_loan_generated_transaction_link(
  p_user_id UUID,
  p_transaction_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  is_generated BOOLEAN;
  linked_row_id UUID;
BEGIN
  SELECT is_loan_generated
  INTO is_generated
  FROM transactions
  WHERE id = p_transaction_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT id
  INTO linked_row_id
  FROM loan_transaction_links
  WHERE transaction_id = p_transaction_id
    AND user_id = p_user_id;

  IF is_generated AND NOT FOUND THEN
    RAISE EXCEPTION 'Loan-generated transaction % must have exactly one loan transaction link', p_transaction_id
      USING ERRCODE = '23514';
  ELSIF NOT is_generated AND FOUND THEN
    RAISE EXCEPTION 'A manual transaction cannot be linked as a loan-generated transaction'
      USING ERRCODE = '23514';
  END IF;

  IF is_generated THEN
    PERFORM assert_loan_transaction_link_integrity(linked_row_id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION check_loan_generated_transaction_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM assert_loan_generated_transaction_link(OLD.user_id, OLD.id);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM assert_loan_generated_transaction_link(NEW.user_id, NEW.id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ct_loan_generated_transaction_link
AFTER INSERT OR UPDATE ON transactions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_loan_generated_transaction_trigger();

CREATE OR REPLACE FUNCTION prevent_loan_generated_flag_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_loan_generated IS DISTINCT FROM OLD.is_loan_generated THEN
    RAISE EXCEPTION 'Transaction origin is immutable after creation'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_loan_generated_flag_update
BEFORE UPDATE ON transactions
FOR EACH ROW
EXECUTE FUNCTION prevent_loan_generated_flag_update();

CREATE OR REPLACE FUNCTION assert_loan_repayment_transaction_components(
  p_user_id UUID,
  p_debt_id UUID,
  p_repayment_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  legacy_unallocated BOOLEAN;
  allocated_principal NUMERIC(15, 2);
  allocated_interest NUMERIC(15, 2);
  linked_principal NUMERIC(15, 2);
  linked_interest NUMERIC(15, 2);
BEGIN
  SELECT is_legacy_unallocated
  INTO legacy_unallocated
  FROM debt_repayments
  WHERE id = p_repayment_id
    AND user_id = p_user_id
    AND debt_id = p_debt_id;

  IF NOT FOUND OR legacy_unallocated THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(principal_allocated), 0),
         COALESCE(SUM(interest_allocated), 0)
  INTO allocated_principal, allocated_interest
  FROM loan_payment_allocations
  WHERE repayment_id = p_repayment_id
    AND user_id = p_user_id
    AND debt_id = p_debt_id;

  SELECT COALESCE(SUM(amount) FILTER (WHERE component = 'repayment_principal'), 0),
         COALESCE(SUM(amount) FILTER (WHERE component = 'repayment_interest'), 0)
  INTO linked_principal, linked_interest
  FROM loan_transaction_links
  WHERE repayment_id = p_repayment_id
    AND user_id = p_user_id
    AND debt_id = p_debt_id;

  IF linked_principal IS DISTINCT FROM allocated_principal
     OR linked_interest IS DISTINCT FROM allocated_interest THEN
    RAISE EXCEPTION 'Repayment % must have linked transactions matching its principal and interest allocations',
      p_repayment_id
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION assert_loan_disbursement_transaction(
  p_user_id UUID,
  p_debt_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  is_legacy BOOLEAN;
  principal_amount NUMERIC(15, 2);
  linked_count BIGINT;
  linked_amount NUMERIC(15, 2);
BEGIN
  SELECT d.is_legacy_unlinked, d.amount
  INTO is_legacy, principal_amount
  FROM debt_records d
  WHERE d.id = p_debt_id AND d.user_id = p_user_id;

  IF NOT FOUND OR is_legacy THEN
    RETURN;
  END IF;

  SELECT COUNT(*), COALESCE(SUM(l.amount), 0)
  INTO linked_count, linked_amount
  FROM loan_transaction_links l
  WHERE l.user_id = p_user_id
    AND l.debt_id = p_debt_id
    AND l.component = 'disbursement_principal';

  IF linked_count <> 1 OR linked_amount IS DISTINCT FROM principal_amount THEN
    RAISE EXCEPTION 'Loan % must have exactly one linked disbursement transaction for the principal amount',
      p_debt_id
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION check_loan_event_link_completeness_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  linked_row_id UUID;
BEGIN
  IF TG_TABLE_NAME = 'debt_records' THEN
    PERFORM assert_loan_disbursement_transaction(NEW.user_id, NEW.id);
    FOR linked_row_id IN
      SELECT l.id
      FROM loan_transaction_links l
      WHERE l.user_id = NEW.user_id AND l.debt_id = NEW.id
    LOOP
      PERFORM assert_loan_transaction_link_integrity(linked_row_id);
    END LOOP;
  ELSIF TG_TABLE_NAME = 'debt_repayments' THEN
    IF TG_OP <> 'INSERT' THEN
      PERFORM assert_loan_repayment_transaction_components(OLD.user_id, OLD.debt_id, OLD.id);
    END IF;
    IF TG_OP <> 'DELETE' THEN
      PERFORM assert_loan_repayment_transaction_components(NEW.user_id, NEW.debt_id, NEW.id);
    END IF;
  ELSIF TG_TABLE_NAME = 'loan_payment_allocations' THEN
    IF TG_OP <> 'INSERT' THEN
      PERFORM assert_loan_repayment_transaction_components(OLD.user_id, OLD.debt_id, OLD.repayment_id);
    END IF;
    IF TG_OP <> 'DELETE' THEN
      PERFORM assert_loan_repayment_transaction_components(NEW.user_id, NEW.debt_id, NEW.repayment_id);
    END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN
      IF OLD.repayment_id IS NOT NULL THEN
        PERFORM assert_loan_repayment_transaction_components(OLD.user_id, OLD.debt_id, OLD.repayment_id);
      END IF;
      PERFORM assert_loan_disbursement_transaction(OLD.user_id, OLD.debt_id);
    END IF;
    IF TG_OP <> 'DELETE' THEN
      IF NEW.repayment_id IS NOT NULL THEN
        PERFORM assert_loan_repayment_transaction_components(NEW.user_id, NEW.debt_id, NEW.repayment_id);
      END IF;
      PERFORM assert_loan_disbursement_transaction(NEW.user_id, NEW.debt_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ct_debt_records_disbursement_link
AFTER INSERT OR UPDATE ON debt_records
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_loan_event_link_completeness_trigger();

CREATE OR REPLACE FUNCTION prevent_new_legacy_unlinked_loans()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.is_legacy_unlinked THEN
    RAISE EXCEPTION 'Only loans that existed before migration 004 may be marked as legacy-unlinked'
      USING ERRCODE = '23514';
  ELSIF TG_OP = 'UPDATE'
        AND NEW.is_legacy_unlinked
        AND NOT OLD.is_legacy_unlinked THEN
    RAISE EXCEPTION 'Only loans that existed before migration 004 may be marked as legacy-unlinked'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_new_legacy_unlinked_loans
BEFORE INSERT OR UPDATE ON debt_records
FOR EACH ROW
EXECUTE FUNCTION prevent_new_legacy_unlinked_loans();

CREATE CONSTRAINT TRIGGER ct_debt_repayments_transaction_components
AFTER INSERT OR UPDATE OR DELETE ON debt_repayments
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_loan_event_link_completeness_trigger();

CREATE OR REPLACE FUNCTION prevent_new_legacy_unallocated_repayments()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.is_legacy_unallocated THEN
    RAISE EXCEPTION 'Only repayments that existed before migration 004 may be marked as legacy-unallocated'
      USING ERRCODE = '23514';
  ELSIF TG_OP = 'UPDATE'
        AND NEW.is_legacy_unallocated
        AND NOT OLD.is_legacy_unallocated THEN
    RAISE EXCEPTION 'Only repayments that existed before migration 004 may be marked as legacy-unallocated'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_new_legacy_unallocated_repayments
BEFORE INSERT OR UPDATE ON debt_repayments
FOR EACH ROW
EXECUTE FUNCTION prevent_new_legacy_unallocated_repayments();

CREATE CONSTRAINT TRIGGER ct_loan_allocations_transaction_components
AFTER INSERT OR UPDATE OR DELETE ON loan_payment_allocations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_loan_event_link_completeness_trigger();

CREATE CONSTRAINT TRIGGER ct_loan_links_event_completeness
AFTER INSERT OR UPDATE OR DELETE ON loan_transaction_links
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_loan_event_link_completeness_trigger();

CREATE OR REPLACE FUNCTION check_loan_transaction_link_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Loan transaction links are immutable; create a correcting payment instead'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP <> 'INSERT' THEN
    PERFORM assert_loan_transaction_link_integrity(OLD.id);
    PERFORM assert_loan_generated_transaction_link(OLD.user_id, OLD.transaction_id);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM assert_loan_transaction_link_integrity(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ct_loan_transaction_link_integrity
AFTER INSERT OR UPDATE OR DELETE ON loan_transaction_links
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_loan_transaction_link_trigger();

-- Once linked, the transaction's accounting fields cannot be edited. The
-- existing transaction delete is also blocked by the link's deferred FK.
CREATE OR REPLACE FUNCTION prevent_linked_loan_transaction_accounting_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM loan_transaction_links l
    WHERE l.transaction_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'Loan-generated transactions must be corrected through loan repayment history'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_linked_loan_transaction_accounting_update
BEFORE UPDATE OF type, amount, date, account_id, to_account_id ON transactions
FOR EACH ROW
EXECUTE FUNCTION prevent_linked_loan_transaction_accounting_update();

-- Transaction currency is determined by its account in the existing schema.
-- Do not change an account's currency while a loan still relies on it.
CREATE OR REPLACE FUNCTION prevent_currency_change_for_loan_accounts()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF UPPER(NEW.currency) IS DISTINCT FROM UPPER(OLD.currency)
     AND EXISTS (
       SELECT 1
       FROM debt_records d
       WHERE d.account_id = OLD.id
     ) THEN
    RAISE EXCEPTION 'Account currency cannot change while it is selected by a loan'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_currency_change_for_loan_accounts
BEFORE UPDATE OF currency ON accounts
FOR EACH ROW
EXECUTE FUNCTION prevent_currency_change_for_loan_accounts();
