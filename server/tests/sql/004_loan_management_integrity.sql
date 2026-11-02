-- Loan Management migration 004 database integrity checks.
-- Run only against the disposable fintrack_migration_test database:
--   psql "$env:DATABASE_URL" -X -v ON_ERROR_STOP=1 -f server/tests/sql/004_loan_management_integrity.sql
-- The test transaction is always rolled back on success. On failure, psql
-- exits with ON_ERROR_STOP and PostgreSQL rolls back the open transaction.
\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF CURRENT_DATABASE() <> 'fintrack_migration_test' THEN
    RAISE EXCEPTION 'Refusing to run loan integrity tests against database %', CURRENT_DATABASE()
      USING ERRCODE = 'P0001';
  END IF;

  IF (SELECT COUNT(*) FROM schema_migrations WHERE name IN (
        '001_initial_schema.sql',
        '002_add_other_income_category.sql',
        '003_add_password_hash_to_users.sql',
        '004_loan_management.sql'
      )) <> 4 THEN
    RAISE EXCEPTION 'Expected migrations 001 through 004 to be recorded before running tests'
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE TEMP TABLE _loan_integrity_fixture (
  user_a UUID NOT NULL,
  user_b UUID NOT NULL,
  account_a_usd UUID NOT NULL,
  account_a_eur UUID NOT NULL,
  account_b_eur UUID NOT NULL,
  person_a UUID NOT NULL,
  person_b UUID NOT NULL,
  loan_a UUID NOT NULL,
  schedule_v1 UUID NOT NULL,
  schedule_v2 UUID NOT NULL,
  empty_schedule UUID NOT NULL,
  installment_v1 UUID NOT NULL,
  installment_v2 UUID NOT NULL,
  disbursement_tx UUID NOT NULL,
  payment_a UUID NOT NULL,
  payment_a_principal_tx UUID NOT NULL,
  payment_a_interest_tx UUID NOT NULL,
  reversal_a UUID NOT NULL,
  reversal_a_principal_tx UUID NOT NULL,
  reversal_a_interest_tx UUID NOT NULL,
  payment_zero_interest UUID NOT NULL
) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(
  p_name TEXT,
  p_condition BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_condition IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'FAIL: %', p_name USING ERRCODE = 'P0001';
  END IF;
  RAISE NOTICE 'PASS: %', p_name;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_error(
  p_name TEXT,
  p_expected_state TEXT,
  p_message_fragment TEXT,
  p_statement TEXT,
  p_constraint_name TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  actual_state TEXT;
  actual_message TEXT;
BEGIN
  BEGIN
    IF p_constraint_name IS NOT NULL THEN
      EXECUTE 'SET CONSTRAINTS ALL DEFERRED';
    END IF;
    EXECUTE p_statement;
    IF p_constraint_name IS NOT NULL THEN
      EXECUTE FORMAT('SET CONSTRAINTS %I IMMEDIATE', p_constraint_name);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      actual_state = RETURNED_SQLSTATE,
      actual_message = MESSAGE_TEXT;

    IF actual_state <> p_expected_state THEN
      RAISE EXCEPTION 'FAIL: %, expected SQLSTATE %, got %: %',
        p_name, p_expected_state, actual_state, actual_message
        USING ERRCODE = 'P0001';
    END IF;

    IF p_message_fragment IS NOT NULL
       AND POSITION(p_message_fragment IN actual_message) = 0 THEN
      RAISE EXCEPTION 'FAIL: %, SQLSTATE matched but message did not: %',
        p_name, actual_message
        USING ERRCODE = 'P0001';
    END IF;

    RAISE NOTICE 'PASS: % (SQLSTATE %)', p_name, actual_state;
    RETURN;
  END;

  RAISE EXCEPTION 'FAIL: %, statement unexpectedly succeeded', p_name
    USING ERRCODE = 'P0001';
END;
$$;

INSERT INTO _loan_integrity_fixture
SELECT gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
       gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
       gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
       gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
       gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
       gen_random_uuid();

INSERT INTO users (id, email, name, currency)
SELECT user_a, 'loan-integrity-' || user_a || '@example.invalid', 'Loan Integrity A', 'USD'
FROM _loan_integrity_fixture;

INSERT INTO users (id, email, name, currency)
SELECT user_b, 'loan-integrity-' || user_b || '@example.invalid', 'Loan Integrity B', 'EUR'
FROM _loan_integrity_fixture;

INSERT INTO accounts (id, user_id, name, type, opening_balance, currency)
SELECT account_a_usd, user_a, 'Integrity USD', 'Bank Account', 0, 'USD'
FROM _loan_integrity_fixture;

INSERT INTO accounts (id, user_id, name, type, opening_balance, currency)
SELECT account_a_eur, user_a, 'Integrity EUR', 'Bank Account', 0, 'EUR'
FROM _loan_integrity_fixture;

INSERT INTO accounts (id, user_id, name, type, opening_balance, currency)
SELECT account_b_eur, user_b, 'Other Owner EUR', 'Bank Account', 0, 'EUR'
FROM _loan_integrity_fixture;

INSERT INTO people (id, user_id, name)
SELECT person_a, user_a, 'Integrity Person A'
FROM _loan_integrity_fixture;

INSERT INTO people (id, user_id, name)
SELECT person_b, user_b, 'Integrity Person B'
FROM _loan_integrity_fixture;

-- Valid lending loan and one-sided transfer disbursement.
INSERT INTO debt_records (
  id, user_id, person_id, type, amount, start_date, currency, account_id,
  interest_method, annual_rate_pct, repayment_mode
)
SELECT loan_a, user_a, person_a, 'lent', 100.00, DATE '2026-01-15', 'USD', account_a_usd,
       'simple', 12.000000, 'installments'
FROM _loan_integrity_fixture;

INSERT INTO loan_schedules (id, user_id, debt_id, version_no, is_current)
SELECT schedule_v1, user_a, loan_a, 1, TRUE
FROM _loan_integrity_fixture;

INSERT INTO loan_installments (
  id, user_id, debt_id, schedule_id, installment_number, due_date,
  principal_due, interest_due
)
SELECT installment_v1, user_a, loan_a, schedule_v1, 1, DATE '2026-02-15', 100.00, 20.00
FROM _loan_integrity_fixture;

INSERT INTO transactions (
  id, user_id, title, amount, type, category_name, date, account_id,
  to_account_id, is_loan_generated
)
SELECT disbursement_tx, user_a, 'Integrity loan disbursement', 100.00, 'transfer',
       'Transfer', DATE '2026-01-15', account_a_usd, NULL, TRUE
FROM _loan_integrity_fixture;

INSERT INTO loan_transaction_links (
  user_id, debt_id, transaction_id, component, amount
)
SELECT user_a, loan_a, disbursement_tx, 'disbursement_principal', 100.00
FROM _loan_integrity_fixture;

-- Force the deferred schedule and disbursement checks for the valid fixture.
SET CONSTRAINTS ALL IMMEDIATE;
DO $$ BEGIN RAISE NOTICE 'PASS: valid loan, current schedule, and disbursement link'; END $$;

-- Valid payment: principal and interest are distinct allocations and links.
SET CONSTRAINTS ALL DEFERRED;
INSERT INTO debt_repayments (id, user_id, debt_id, amount, repayment_date, account_id)
SELECT payment_a, user_a, loan_a, 30.00, DATE '2026-02-15', account_a_usd
FROM _loan_integrity_fixture;

INSERT INTO loan_payment_allocations (
  user_id, debt_id, repayment_id, installment_id, principal_allocated, interest_allocated
)
SELECT user_a, loan_a, payment_a, installment_v1, 25.00, 5.00
FROM _loan_integrity_fixture;

INSERT INTO transactions (
  id, user_id, title, amount, type, category_name, date, account_id,
  to_account_id, is_loan_generated
)
SELECT payment_a_principal_tx, user_a, 'Integrity principal received', 25.00, 'transfer',
       'Transfer', DATE '2026-02-15', NULL, account_a_usd, TRUE
FROM _loan_integrity_fixture;

INSERT INTO transactions (
  id, user_id, title, amount, type, category_name, date, account_id,
  to_account_id, is_loan_generated
)
SELECT payment_a_interest_tx, user_a, 'Integrity interest received', 5.00, 'income',
       'Loan interest', DATE '2026-02-15', account_a_usd, NULL, TRUE
FROM _loan_integrity_fixture;

INSERT INTO loan_transaction_links (
  user_id, debt_id, repayment_id, transaction_id, component, amount
)
SELECT user_a, loan_a, payment_a, payment_a_principal_tx, 'repayment_principal', 25.00
FROM _loan_integrity_fixture;

INSERT INTO loan_transaction_links (
  user_id, debt_id, repayment_id, transaction_id, component, amount
)
SELECT user_a, loan_a, payment_a, payment_a_interest_tx, 'repayment_interest', 5.00
FROM _loan_integrity_fixture;

SET CONSTRAINTS ALL IMMEDIATE;
DO $$ BEGIN RAISE NOTICE 'PASS: principal/interest allocation totals and transaction links'; END $$;

-- Valid full reversal keeps the original payment and mirrors its allocations.
SET CONSTRAINTS ALL DEFERRED;
INSERT INTO debt_repayments (
  id, user_id, debt_id, amount, repayment_date, account_id, entry_type,
  reverses_repayment_id
)
SELECT reversal_a, user_a, loan_a, 30.00, DATE '2026-02-16', account_a_usd,
       'reversal', payment_a
FROM _loan_integrity_fixture;

INSERT INTO loan_payment_allocations (
  user_id, debt_id, repayment_id, installment_id, principal_allocated, interest_allocated
)
SELECT user_a, loan_a, reversal_a, installment_v1, 25.00, 5.00
FROM _loan_integrity_fixture;

INSERT INTO transactions (
  id, user_id, title, amount, type, category_name, date, account_id,
  to_account_id, is_loan_generated
)
SELECT reversal_a_principal_tx, user_a, 'Integrity principal reversal', 25.00, 'transfer',
       'Transfer', DATE '2026-02-16', account_a_usd, NULL, TRUE
FROM _loan_integrity_fixture;

INSERT INTO transactions (
  id, user_id, title, amount, type, category_name, date, account_id,
  to_account_id, is_loan_generated
)
SELECT reversal_a_interest_tx, user_a, 'Integrity interest reversal', 5.00, 'expense',
       'Loan interest', DATE '2026-02-16', account_a_usd, NULL, TRUE
FROM _loan_integrity_fixture;

INSERT INTO loan_transaction_links (
  user_id, debt_id, repayment_id, transaction_id, component, amount
)
SELECT user_a, loan_a, reversal_a, reversal_a_principal_tx, 'repayment_principal', 25.00
FROM _loan_integrity_fixture;

INSERT INTO loan_transaction_links (
  user_id, debt_id, repayment_id, transaction_id, component, amount
)
SELECT user_a, loan_a, reversal_a, reversal_a_interest_tx, 'repayment_interest', 5.00
FROM _loan_integrity_fixture;

SET CONSTRAINTS ALL IMMEDIATE;
DO $$ BEGIN RAISE NOTICE 'PASS: reversal of original payment with exact allocation mirror'; END $$;

SELECT pg_temp.expect_error(
  'repayment updates preserve posted history', '23514', 'Repayment history is immutable',
  format('UPDATE debt_repayments SET note = %L WHERE id = %L', 'edited', payment_a::TEXT)
)
FROM _loan_integrity_fixture;

SELECT pg_temp.expect_error(
  'repayment deletes preserve posted history', '23514', 'repayment history cannot be deleted',
  format('DELETE FROM debt_repayments WHERE id = %L', payment_a::TEXT)
)
FROM _loan_integrity_fixture;

SELECT pg_temp.expect_error(
  'reversal cannot reverse another reversal', '23514', 'original payment',
  format(
    'INSERT INTO debt_repayments (user_id, debt_id, amount, repayment_date, account_id, entry_type, reverses_repayment_id) VALUES (%L, %L, 30.00, DATE %L, %L, %L, %L)',
    user_a::TEXT, loan_a::TEXT, '2026-02-17', account_a_usd::TEXT, 'reversal', reversal_a::TEXT
  )
)
FROM _loan_integrity_fixture;

SELECT pg_temp.expect_error(
  'reversal amount must equal original payment', '23514', 'must equal the original payment amount',
  format(
    'INSERT INTO debt_repayments (user_id, debt_id, amount, repayment_date, account_id, entry_type, reverses_repayment_id) VALUES (%L, %L, 29.99, DATE %L, %L, %L, %L)',
    user_a::TEXT, loan_a::TEXT, '2026-02-17', account_a_usd::TEXT, 'reversal', payment_a::TEXT
  )
)
FROM _loan_integrity_fixture;

SELECT pg_temp.expect_error(
  'only one reversal per original payment', '23505', NULL,
  format(
    'INSERT INTO debt_repayments (user_id, debt_id, amount, repayment_date, account_id, entry_type, reverses_repayment_id) VALUES (%L, %L, 30.00, DATE %L, %L, %L, %L)',
    user_a::TEXT, loan_a::TEXT, '2026-02-17', account_a_usd::TEXT, 'reversal', payment_a::TEXT
  )
)
FROM _loan_integrity_fixture;

SELECT pg_temp.expect_error(
  'posted allocation update is rejected', '23514', 'Posted payment allocations are immutable',
  format(
    'UPDATE loan_payment_allocations SET principal_allocated = 24.00 WHERE repayment_id = %L',
    payment_a::TEXT
  )
)
FROM _loan_integrity_fixture;

SELECT pg_temp.expect_error(
  'posted allocation delete is rejected', '23514', 'allocations cannot be deleted',
  format(
    'DELETE FROM loan_payment_allocations WHERE repayment_id = %L', payment_a::TEXT
  )
)
FROM _loan_integrity_fixture;

-- Cross-owner composite FK test on a table without its own row triggers.
SELECT pg_temp.expect_error(
  'installment cannot use another owner loan schedule', '23503', NULL,
  format(
    'INSERT INTO loan_installments (user_id, debt_id, schedule_id, installment_number, due_date, principal_due, interest_due) VALUES (%L, %L, %L, 77, DATE %L, 1.00, 0.00)',
    user_b::TEXT, loan_a::TEXT, schedule_v1::TEXT, '2026-03-15'
  )
)
FROM _loan_integrity_fixture;

SELECT pg_temp.expect_error(
  'loan cannot reference another owner person', '23503', NULL,
  format(
    'DO $case$ BEGIN EXECUTE %L; INSERT INTO debt_records (user_id, person_id, type, amount, start_date, currency, account_id) VALUES (%L, %L, %L, 9.00, DATE %L, %L, %L); END $case$',
    'SET CONSTRAINTS ct_debt_records_current_schedule_version, ct_debt_records_disbursement_link DEFERRED',
    user_a::TEXT, person_b::TEXT, 'lent', '2026-01-15', 'USD', account_a_usd::TEXT
  )
)
FROM _loan_integrity_fixture;

-- A mismatched currency is rejected by the debt/account consistency trigger.
SELECT pg_temp.expect_error(
  'loan currency must match selected account currency', '23514', 'Loan currency must match',
  format(
    'INSERT INTO debt_records (user_id, person_id, type, amount, start_date, currency, account_id) VALUES (%L, %L, %L, 10.00, DATE %L, %L, %L)',
    user_a::TEXT, person_a::TEXT, 'lent', '2026-01-15', 'USD', account_a_eur::TEXT
  )
)
FROM _loan_integrity_fixture;

SELECT pg_temp.expect_error(
  'selected account currency cannot change while loan exists', '23514', 'Account currency cannot change',
  format('UPDATE accounts SET currency = %L WHERE id = %L', 'EUR', account_a_usd::TEXT)
)
FROM _loan_integrity_fixture;

-- A direct schedule deletion is rejected even if the version has no installments.
INSERT INTO loan_schedules (id, user_id, debt_id, version_no, is_current)
SELECT empty_schedule, user_a, loan_a, 88, FALSE
FROM _loan_integrity_fixture;
SET CONSTRAINTS ALL IMMEDIATE;

SELECT pg_temp.expect_error(
  'empty historical schedule version cannot be deleted', '23514', 'schedule versions are historical',
  format('DELETE FROM loan_schedules WHERE id = %L', empty_schedule::TEXT)
)
FROM _loan_integrity_fixture;

SELECT pg_temp.expect_error(
  'current schedule version must match loan version', '23514', 'exactly one current schedule matching',
  format('UPDATE debt_records SET current_schedule_version = 99 WHERE id = %L', loan_a::TEXT)
)
FROM _loan_integrity_fixture;

SELECT pg_temp.expect_error(
  'loan cannot have two current schedules', '23505', NULL,
  format(
    'INSERT INTO loan_schedules (user_id, debt_id, version_no, is_current) VALUES (%L, %L, 89, TRUE)',
    user_a::TEXT, loan_a::TEXT
  )
)
FROM _loan_integrity_fixture;

-- Normal version replacement: preserve v1, add v2, and update the loan pointer atomically.
DO $$
DECLARE
  f _loan_integrity_fixture%ROWTYPE;
BEGIN
  SELECT * INTO STRICT f FROM _loan_integrity_fixture;
  EXECUTE 'SET CONSTRAINTS ALL DEFERRED';
  UPDATE loan_schedules SET is_current = FALSE WHERE id = f.schedule_v1;
  INSERT INTO loan_schedules (id, user_id, debt_id, version_no, is_current)
  VALUES (f.schedule_v2, f.user_a, f.loan_a, 2, TRUE);
  UPDATE debt_records SET current_schedule_version = 2 WHERE id = f.loan_a;
  INSERT INTO loan_installments (
    id, user_id, debt_id, schedule_id, installment_number, due_date,
    principal_due, interest_due
  ) VALUES (
    f.installment_v2, f.user_a, f.loan_a, f.schedule_v2, 1, DATE '2026-03-15',
    75.00, 15.00
  );
  EXECUTE 'SET CONSTRAINTS ALL IMMEDIATE';
  RAISE NOTICE 'PASS: schedule version replacement preserves prior version';
END;
$$;

-- A positive principal-only allocation requires no zero-value interest link.
DO $$
DECLARE
  f _loan_integrity_fixture%ROWTYPE;
BEGIN
  SELECT * INTO STRICT f FROM _loan_integrity_fixture;
  EXECUTE 'SET CONSTRAINTS ALL DEFERRED';
  INSERT INTO debt_repayments (
    id, user_id, debt_id, amount, repayment_date, account_id
  ) VALUES (
    f.payment_zero_interest, f.user_a, f.loan_a, 10.00, DATE '2026-03-15', f.account_a_usd
  );
  INSERT INTO loan_payment_allocations (
    user_id, debt_id, repayment_id, installment_id, principal_allocated, interest_allocated
  ) VALUES (f.user_a, f.loan_a, f.payment_zero_interest, f.installment_v2, 10.00, 0.00);
  INSERT INTO transactions (
    id, user_id, title, amount, type, category_name, date, account_id,
    to_account_id, is_loan_generated
  ) VALUES (
    gen_random_uuid(), f.user_a, 'Integrity principal-only payment', 10.00, 'transfer',
    'Transfer', DATE '2026-03-15', NULL, f.account_a_usd, TRUE
  );
  INSERT INTO loan_transaction_links (
    user_id, debt_id, repayment_id, transaction_id, component, amount
  )
  SELECT f.user_a, f.loan_a, f.payment_zero_interest, t.id, 'repayment_principal', 10.00
  FROM transactions t
  WHERE t.user_id = f.user_a AND t.title = 'Integrity principal-only payment'
    AND t.date = DATE '2026-03-15';
  EXECUTE 'SET CONSTRAINTS ALL IMMEDIATE';
  RAISE NOTICE 'PASS: zero interest allocation does not require a transaction link';
END;
$$;

-- A lent-loan payment receives principal into the selected account; the
-- opposite transfer direction is rejected for a normal payment.
SELECT pg_temp.expect_error(
  'principal repayment transfer direction is enforced', '23514', 'wrong transfer direction',
  format(
    'DO $case$ DECLARE r UUID := gen_random_uuid(); t UUID := gen_random_uuid(); BEGIN INSERT INTO debt_repayments (id, user_id, debt_id, amount, repayment_date, account_id) VALUES (r, %L, %L, 5.00, DATE %L, %L); INSERT INTO loan_payment_allocations (user_id, debt_id, repayment_id, installment_id, principal_allocated, interest_allocated) VALUES (%L, %L, r, %L, 5.00, 0.00); INSERT INTO transactions (id, user_id, title, amount, type, category_name, date, account_id, to_account_id, is_loan_generated) VALUES (t, %L, %L, 5.00, %L, %L, DATE %L, %L, NULL, TRUE); INSERT INTO loan_transaction_links (user_id, debt_id, repayment_id, transaction_id, component, amount) VALUES (%L, %L, r, t, %L, 5.00); END $case$',
    user_a::TEXT, loan_a::TEXT, '2026-03-16', account_a_usd::TEXT,
    user_a::TEXT, loan_a::TEXT, installment_v2::TEXT,
    user_a::TEXT, 'Integrity wrong repayment direction', 'transfer', 'Transfer', '2026-03-16', account_a_usd::TEXT,
    user_a::TEXT, loan_a::TEXT, 'repayment_principal'
  ), 'ct_loan_transaction_link_integrity'
)
FROM _loan_integrity_fixture;

-- A reversal's principal/interest split must mirror the original allocation,
-- even when the total reversal amount is correct.
SELECT pg_temp.expect_error(
  'reversal allocation split must mirror the original payment', '23514',
  'must reverse the original principal and interest allocations exactly',
  format(
    'DO $case$ DECLARE r UUID := gen_random_uuid(); BEGIN INSERT INTO debt_repayments (id, user_id, debt_id, amount, repayment_date, account_id, entry_type, reverses_repayment_id) VALUES (r, %L, %L, 10.00, DATE %L, %L, %L, %L); INSERT INTO loan_payment_allocations (user_id, debt_id, repayment_id, installment_id, principal_allocated, interest_allocated) VALUES (%L, %L, r, %L, 9.00, 1.00); END $case$',
    user_a::TEXT, loan_a::TEXT, '2026-03-16', account_a_usd::TEXT, 'reversal', payment_zero_interest::TEXT,
    user_a::TEXT, loan_a::TEXT, installment_v2::TEXT
  ), 'ct_debt_repayments_allocation_total'
)
FROM _loan_integrity_fixture;

-- Deferred test: an amount-only new repayment must not commit without allocations.
SELECT pg_temp.expect_error(
  'new repayment must be fully allocated', '23514', 'must be fully allocated',
  format(
    'INSERT INTO debt_repayments (user_id, debt_id, amount, repayment_date, account_id) VALUES (%L, %L, 3.00, DATE %L, %L)',
    user_a::TEXT, loan_a::TEXT, '2026-03-16', account_a_usd::TEXT
  ), 'ct_debt_repayments_allocation_total'
)
FROM _loan_integrity_fixture;

-- Deferred test: a positive allocated component must match its transaction link.
SELECT pg_temp.expect_error(
  'positive principal link amount must match allocation', '23514', 'allocated component',
  format(
    'DO $case$ DECLARE r UUID := gen_random_uuid(); t UUID := gen_random_uuid(); BEGIN INSERT INTO debt_repayments (id, user_id, debt_id, amount, repayment_date, account_id) VALUES (r, %L, %L, 5.00, DATE %L, %L); INSERT INTO loan_payment_allocations (user_id, debt_id, repayment_id, installment_id, principal_allocated, interest_allocated) VALUES (%L, %L, r, %L, 5.00, 0.00); INSERT INTO transactions (id, user_id, title, amount, type, category_name, date, account_id, to_account_id, is_loan_generated) VALUES (t, %L, %L, 4.00, %L, %L, DATE %L, NULL, %L, TRUE); INSERT INTO loan_transaction_links (user_id, debt_id, repayment_id, transaction_id, component, amount) VALUES (%L, %L, r, t, %L, 4.00); END $case$',
    user_a::TEXT, loan_a::TEXT, '2026-03-17', account_a_usd::TEXT,
    user_a::TEXT, loan_a::TEXT, installment_v2::TEXT,
    user_a::TEXT, 'Integrity bad amount', 'transfer', 'Transfer', '2026-03-17', account_a_usd::TEXT,
    user_a::TEXT, loan_a::TEXT, 'repayment_principal'
  ), 'ct_loan_transaction_link_integrity'
)
FROM _loan_integrity_fixture;

-- Deferred test: disbursement transaction must use the exact selected account.
SELECT pg_temp.expect_error(
  'disbursement cannot use another same-owner account', '23514', 'does not match the loan amount, date, direction, or transaction type',
  format(
    'DO $case$ DECLARE d UUID := gen_random_uuid(); s UUID := gen_random_uuid(); t UUID := gen_random_uuid(); BEGIN INSERT INTO debt_records (id, user_id, person_id, type, amount, start_date, currency, account_id) VALUES (d, %L, %L, %L, 7.00, DATE %L, %L, %L); INSERT INTO loan_schedules (id, user_id, debt_id, version_no, is_current) VALUES (s, %L, d, 1, TRUE); INSERT INTO transactions (id, user_id, title, amount, type, category_name, date, account_id, to_account_id, is_loan_generated) VALUES (t, %L, %L, 7.00, %L, %L, DATE %L, %L, NULL, TRUE); INSERT INTO loan_transaction_links (user_id, debt_id, transaction_id, component, amount) VALUES (%L, d, t, %L, 7.00); END $case$',
    user_a::TEXT, person_a::TEXT, 'lent', '2026-01-15', 'USD', account_a_usd::TEXT,
    user_a::TEXT,
    user_a::TEXT, 'Integrity wrong account', 'transfer', 'Transfer', '2026-01-15', account_a_eur::TEXT,
    user_a::TEXT, 'disbursement_principal'
  ), 'ct_loan_transaction_link_integrity'
)
FROM _loan_integrity_fixture;

-- Deferred test: ownership of transaction account endpoints is checked by the link trigger.
SELECT pg_temp.expect_error(
  'loan-generated transaction cannot use another owner account', '23514', 'accounts owned by the loan owner',
  format(
    'DO $case$ DECLARE d UUID := gen_random_uuid(); s UUID := gen_random_uuid(); t UUID := gen_random_uuid(); BEGIN INSERT INTO debt_records (id, user_id, person_id, type, amount, start_date, currency, account_id) VALUES (d, %L, %L, %L, 7.00, DATE %L, %L, %L); INSERT INTO loan_schedules (id, user_id, debt_id, version_no, is_current) VALUES (s, %L, d, 1, TRUE); INSERT INTO transactions (id, user_id, title, amount, type, category_name, date, account_id, to_account_id, is_loan_generated) VALUES (t, %L, %L, 7.00, %L, %L, DATE %L, %L, NULL, TRUE); INSERT INTO loan_transaction_links (user_id, debt_id, transaction_id, component, amount) VALUES (%L, d, t, %L, 7.00); END $case$',
    user_a::TEXT, person_a::TEXT, 'lent', '2026-01-15', 'USD', account_a_usd::TEXT,
    user_a::TEXT,
    user_a::TEXT, 'Integrity cross-owner account', 'transfer', 'Transfer', '2026-01-15', account_b_eur::TEXT,
    user_a::TEXT, 'disbursement_principal'
  ), 'ct_loan_transaction_link_integrity'
)
FROM _loan_integrity_fixture;

-- Deferred test: a loan-generated transaction cannot be left unlinked.
SELECT pg_temp.expect_error(
  'loan-generated transaction requires a transaction link', '23514', 'must have exactly one loan transaction link',
  format(
    'INSERT INTO transactions (user_id, title, amount, type, category_name, date, account_id, is_loan_generated) VALUES (%L, %L, 1.00, %L, %L, DATE %L, %L, TRUE)',
    user_a::TEXT, 'Integrity unlinked generated', 'income', 'Loan interest', '2026-03-18', account_a_usd::TEXT
  ), 'ct_loan_generated_transaction_link'
)
FROM _loan_integrity_fixture;

-- Verify user-wide cascades include loans, repayments, schedules, allocations,
-- transactions and links. This is the final destructive statement and remains
-- inside this test transaction, which is rolled back below.
DO $$
DECLARE
  f _loan_integrity_fixture%ROWTYPE;
BEGIN
  SELECT * INTO STRICT f FROM _loan_integrity_fixture;
  EXECUTE 'SET CONSTRAINTS ALL DEFERRED';
  DELETE FROM users WHERE id = f.user_a;
  EXECUTE 'SET CONSTRAINTS ALL IMMEDIATE';

  PERFORM pg_temp.assert_true(
    'user deletion cascades loan-related fixtures',
    NOT EXISTS (SELECT 1 FROM debt_records WHERE id = f.loan_a)
    AND NOT EXISTS (SELECT 1 FROM debt_repayments WHERE debt_id = f.loan_a)
    AND NOT EXISTS (SELECT 1 FROM loan_schedules WHERE debt_id = f.loan_a)
    AND NOT EXISTS (SELECT 1 FROM loan_payment_allocations WHERE debt_id = f.loan_a)
    AND NOT EXISTS (SELECT 1 FROM loan_transaction_links WHERE debt_id = f.loan_a)
    AND NOT EXISTS (SELECT 1 FROM transactions WHERE user_id = f.user_a)
  );
END;
$$;

ROLLBACK;
