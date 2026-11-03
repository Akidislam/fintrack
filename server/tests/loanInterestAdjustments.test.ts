import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { PoolClient } from "pg";
import { pool } from "../src/db";
import { createLoan, CreatedLoan, LoanDirection } from "../src/services/loanService";

// This guard runs before any query. Never point this integration suite at the
// primary database, even if a developer's server/.env does so.
const connectionString = process.env.DATABASE_URL;
if (!connectionString || new URL(connectionString).pathname.replace(/^\//, "") !== "fintrack_migration_test") {
  throw new Error("Loan interest-adjustment integration tests require DATABASE_URL to target only fintrack_migration_test.");
}

const runId = randomUUID();
let ownerId = "";
let otherUserId = "";
let ownerPersonId = "";
let otherPersonId = "";
let ownerUsdAccountId = "";
let ownerBdtAccountId = "";
let otherUsdAccountId = "";

interface LoanFixture {
  loan: CreatedLoan;
  installments: Array<{ id: string; principal_due: string; interest_due: string }>;
}

interface RepaymentFixture {
  id: string;
  date: string;
  amount: string;
  principal: string;
  interest: string;
  installmentId: string;
}

interface AdjustmentFixture {
  id: string;
  amount: string;
  disposition: "cash_refund" | "loan_credit";
  repaymentId: string;
}

function pgCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

function cents(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

function money(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

async function expectPgFailure(
  operation: () => Promise<unknown>,
  expectedCodes: string[] = ["23514"]
): Promise<void> {
  let caught: unknown;
  try {
    await operation();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, "Expected the database operation to fail.");
  assert.ok(
    expectedCodes.includes(pgCode(caught) ?? ""),
    `Expected PostgreSQL code ${expectedCodes.join(" or ")}, received ${pgCode(caught) ?? "a non-PostgreSQL error"}: ${String(caught)}`
  );
}

async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("SET CONSTRAINTS ALL IMMEDIATE;");
    await client.query("COMMIT;");
    return result;
  } catch (error) {
    await client.query("ROLLBACK;").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function makeLoan(
  type: LoanDirection = "lent",
  interestMethod: "flat" | "simple" = "flat",
  userId = ownerId,
  personId = ownerPersonId,
  accountId = ownerUsdAccountId
): Promise<LoanFixture> {
  const result = await createLoan(userId, randomUUID(), {
    personId,
    type,
    amount: "1000.00",
    accountId,
    currency: "USD",
    startDate: "2026-01-01",
    interestMethod,
    annualRatePct: "12.000000",
    repaymentMode: "installments",
    installments: [
      { dueDate: "2027-01-01", principalDue: "600.00" },
      { dueDate: "2027-07-01", principalDue: "400.00" },
    ],
  });
  assert.equal(result.kind, "created");
  if (result.kind !== "created") throw new Error(`Loan fixture creation returned ${result.kind}.`);

  const schedules = await pool.query<{ id: string }>(
    "SELECT id FROM loan_schedules WHERE user_id = $1 AND debt_id = $2 AND is_current;",
    [userId, result.loan.id]
  );
  const installments = await pool.query<{ id: string; principal_due: string; interest_due: string }>(
    `SELECT id, principal_due::text, interest_due::text
       FROM loan_installments
      WHERE user_id = $1 AND debt_id = $2 AND schedule_id = $3
      ORDER BY installment_number;`,
    [userId, result.loan.id, schedules.rows[0]?.id]
  );
  assert.equal(installments.rows.length, 2);
  return { loan: result.loan, installments: installments.rows };
}

function repaymentTxShape(
  type: LoanDirection,
  entryType: "payment" | "reversal",
  component: "repayment_principal" | "repayment_interest",
  accountId: string
): { type: string; accountId: string | null; toAccountId: string | null } {
  if (component === "repayment_principal") {
    const inward = (type === "lent") === (entryType === "payment");
    return inward
      ? { type: "transfer", accountId: null, toAccountId: accountId }
      : { type: "transfer", accountId, toAccountId: null };
  }
  const isIncome = (type === "lent") === (entryType === "payment");
  return {
    type: isIncome ? "income" : "expense",
    accountId,
    toAccountId: null,
  };
}

async function insertLoanComponentTransaction(
  client: PoolClient,
  loan: CreatedLoan,
  repaymentId: string,
  date: string,
  amount: string,
  entryType: "payment" | "reversal",
  component: "repayment_principal" | "repayment_interest"
): Promise<void> {
  if (cents(amount) === 0n) return;
  const shape = repaymentTxShape(loan.type, entryType, component, loan.accountId);
  const tx = await client.query<{ id: string }>(
    `INSERT INTO transactions (
       user_id, title, amount, type, category_name, date, account_id, to_account_id, is_loan_generated
     ) VALUES ($1, $2, $3::numeric, $4, $5, $6::date, $7, $8, TRUE)
     RETURNING id;`,
    [loan.userId, `Test ${component}`, amount, shape.type,
      component === "repayment_interest" ? (shape.type === "income" ? "Interest Income" : "Interest Expense") : "Transfer",
      date, shape.accountId, shape.toAccountId]
  );
  await client.query(
    `INSERT INTO loan_transaction_links (
       user_id, debt_id, repayment_id, transaction_id, component, amount
     ) VALUES ($1, $2, $3, $4, $5, $6::numeric);`,
    [loan.userId, loan.id, repaymentId, tx.rows[0].id, component, amount]
  );
}

async function makeRepayment(
  fixture: LoanFixture,
  options: {
    installmentIndex?: number;
    installmentId?: string;
    principal?: string;
    interest?: string;
    date?: string;
    entryType?: "payment" | "reversal";
    reversesRepaymentId?: string | null;
  } = {}
): Promise<RepaymentFixture> {
  const installment = fixture.installments[options.installmentIndex ?? 0];
  const principal = options.principal ?? "1.00";
  const interest = options.interest ?? "1.00";
  const date = options.date ?? "2027-01-15";
  const entryType = options.entryType ?? "payment";
  const amount = money(cents(principal) + cents(interest));

  return transaction(async (client) => {
    const repayment = await client.query<{ id: string }>(
      `INSERT INTO debt_repayments (
         user_id, debt_id, amount, repayment_date, account_id, entry_type,
         reverses_repayment_id, idempotency_key, is_legacy_unallocated
       ) VALUES ($1, $2, $3::numeric, $4::date, $5, $6, $7, $8, FALSE)
       RETURNING id;`,
      [fixture.loan.userId, fixture.loan.id, amount, date, fixture.loan.accountId,
        entryType, options.reversesRepaymentId ?? null, randomUUID()]
    );
    const repaymentId = repayment.rows[0].id;
    await client.query(
      `INSERT INTO loan_payment_allocations (
         user_id, debt_id, repayment_id, installment_id, principal_allocated, interest_allocated
       ) VALUES ($1, $2, $3, $4, $5::numeric, $6::numeric);`,
      [fixture.loan.userId, fixture.loan.id, repaymentId, installment.id, principal, interest]
    );
    await insertLoanComponentTransaction(client, fixture.loan, repaymentId, date, principal, entryType, "repayment_principal");
    await insertLoanComponentTransaction(client, fixture.loan, repaymentId, date, interest, entryType, "repayment_interest");
    return { id: repaymentId, date, amount, principal, interest, installmentId: installment.id };
  });
}

async function reverseRepayment(
  fixture: LoanFixture,
  original: RepaymentFixture,
  date = "2027-01-16"
): Promise<RepaymentFixture> {
  return makeRepayment(fixture, {
    installmentIndex: fixture.installments.findIndex((row) => row.id === original.installmentId),
    principal: original.principal,
    interest: original.interest,
    date,
    entryType: "reversal",
    reversesRepaymentId: original.id,
  });
}

async function makeAdjustment(
  fixture: LoanFixture,
  repayment: RepaymentFixture,
  options: {
    amount?: string;
    disposition?: "cash_refund" | "loan_credit";
    entryType?: "credit" | "reversal";
    reversesAdjustmentId?: string | null;
    accountId?: string;
    transactionType?: string;
    transactionAmount?: string;
    transactionDate?: string;
  } = {}
): Promise<AdjustmentFixture> {
  const amount = options.amount ?? "10.00";
  const disposition = options.disposition ?? "loan_credit";
  const entryType = options.entryType ?? "credit";
  const transactionDate = options.transactionDate ?? repayment.date;

  return transaction(async (client) => {
    const adjustment = await client.query<{ id: string }>(
      `INSERT INTO loan_interest_adjustments (
         user_id, debt_id, repayment_id, entry_type, reverses_adjustment_id,
         disposition, amount, effective_date
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::numeric, $8::date)
       RETURNING id;`,
      [fixture.loan.userId, fixture.loan.id, repayment.id, entryType,
        options.reversesAdjustmentId ?? null, disposition, amount, repayment.date]
    );
    const adjustmentId = adjustment.rows[0].id;

    if (disposition === "cash_refund") {
      const txType = options.transactionType ?? (entryType === "credit"
        ? (fixture.loan.type === "lent" ? "expense" : "income")
        : (fixture.loan.type === "lent" ? "income" : "expense"));
      const txAmount = options.transactionAmount ?? amount;
      const tx = await client.query<{ id: string }>(
        `INSERT INTO transactions (
           user_id, title, amount, type, category_name, date, account_id, to_account_id, is_loan_generated
         ) VALUES ($1, 'Test interest refund', $2::numeric, $3, 'Interest Adjustment', $4::date, $5, NULL, TRUE)
         RETURNING id;`,
        [fixture.loan.userId, txAmount, txType, transactionDate, options.accountId ?? fixture.loan.accountId]
      );
      await client.query(
        `INSERT INTO loan_transaction_links (
           user_id, debt_id, repayment_id, transaction_id, component, amount, adjustment_id
         ) VALUES ($1, $2, NULL, $3, 'interest_adjustment', $4::numeric, $5);`,
        [fixture.loan.userId, fixture.loan.id, tx.rows[0].id, txAmount, adjustmentId]
      );
    }
    return { id: adjustmentId, amount, disposition, repaymentId: repayment.id };
  });
}

async function applyCredit(
  fixture: LoanFixture,
  adjustment: AdjustmentFixture,
  options: {
    amount?: string;
    component?: "principal" | "interest";
    installmentIndex?: number;
    effectiveDate?: string;
    entryType?: "application" | "reversal";
    reversesApplicationId?: string | null;
    repaymentId?: string | null;
  } = {}
): Promise<string> {
  return transaction(async (client) => {
    const result = await client.query<{ id: string }>(
      `INSERT INTO loan_interest_credit_applications (
         user_id, debt_id, adjustment_id, installment_id, repayment_id, entry_type,
         reverses_application_id, applied_component, amount, effective_date
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::numeric, $10::date)
       RETURNING id;`,
      [fixture.loan.userId, fixture.loan.id, adjustment.id,
        options.installmentId ?? fixture.installments[options.installmentIndex ?? 0].id,
        options.repaymentId ?? null, options.entryType ?? "application",
        options.reversesApplicationId ?? null, options.component ?? "principal",
        options.amount ?? "1.00", options.effectiveDate ?? "2027-01-15"]
    );
    return result.rows[0].id;
  });
}

before(async () => {
  const schema = await pool.query<{ adjustments: string | null; applications: string | null }>(
    `SELECT to_regclass('public.loan_interest_adjustments')::text AS adjustments,
            to_regclass('public.loan_interest_credit_applications')::text AS applications;`
  );
  assert.ok(schema.rows[0]?.adjustments, "Migration 006 must be applied to fintrack_migration_test before running this suite.");
  assert.ok(schema.rows[0]?.applications, "Migration 006 credit-application table is missing from fintrack_migration_test.");

  const ownerEmail = `interest-adjustment-owner-${runId}@example.test`;
  const otherEmail = `interest-adjustment-other-${runId}@example.test`;
  const users = await pool.query<{ id: string; email: string }>(
    `INSERT INTO users (name, email, currency)
     VALUES ('Interest Adjustment Test Owner', $1, 'USD'), ('Interest Adjustment Test Other', $2, 'USD')
     RETURNING id, email;`,
    [ownerEmail, otherEmail]
  );
  ownerId = users.rows.find((row) => row.email === ownerEmail)!.id;
  otherUserId = users.rows.find((row) => row.email === otherEmail)!.id;

  const people = await pool.query<{ id: string; user_id: string }>(
    `INSERT INTO people (user_id, name)
     VALUES ($1, $3), ($2, $4)
     RETURNING id, user_id;`,
    [ownerId, otherUserId, `Owner ${runId}`, `Other ${runId}`]
  );
  ownerPersonId = people.rows.find((row) => row.user_id === ownerId)!.id;
  otherPersonId = people.rows.find((row) => row.user_id === otherUserId)!.id;

  const accounts = await pool.query<{ id: string; user_id: string; currency: string }>(
    `INSERT INTO accounts (user_id, name, type, opening_balance, currency)
     VALUES ($1, $3, 'Bank Account', 10000, 'USD'),
            ($1, $4, 'Bank Account', 10000, 'BDT'),
            ($2, $5, 'Bank Account', 10000, 'USD')
     RETURNING id, user_id, currency;`,
    [ownerId, otherUserId, `Owner USD ${runId}`, `Owner BDT ${runId}`, `Other USD ${runId}`]
  );
  ownerUsdAccountId = accounts.rows.find((row) => row.user_id === ownerId && row.currency === "USD")!.id;
  ownerBdtAccountId = accounts.rows.find((row) => row.user_id === ownerId && row.currency === "BDT")!.id;
  otherUsdAccountId = accounts.rows.find((row) => row.user_id === otherUserId)!.id;
});

after(async () => {
  if (ownerId || otherUserId) {
    await pool.query("DELETE FROM users WHERE id = ANY($1::uuid[]);", [[ownerId, otherUserId].filter(Boolean)]);
  }
  await pool.end();
});

test("Migration 006 loan-interest adjustments and credit applications", async (t) => {
  await t.test("cash refunds use the correct account transaction direction for lending and borrowing", async () => {
    for (const type of ["lent", "borrowed"] as const) {
      const fixture = await makeLoan(type);
      const payment = await makeRepayment(fixture);
      const adjustment = await makeAdjustment(fixture, payment, { disposition: "cash_refund", amount: "2.00" });
      const rows = await pool.query<{ type: string; amount: string; account_id: string }>(
        `SELECT tx.type, tx.amount::text, tx.account_id
           FROM loan_transaction_links l
           JOIN transactions tx ON tx.id = l.transaction_id
          WHERE l.adjustment_id = $1 AND l.component = 'interest_adjustment';`,
        [adjustment.id]
      );
      assert.equal(rows.rows.length, 1);
      assert.equal(rows.rows[0].type, type === "lent" ? "expense" : "income");
      assert.equal(rows.rows[0].amount, "2.00");
      assert.equal(rows.rows[0].account_id, ownerUsdAccountId);
    }
  });

  await t.test("cash-refund links reject wrong account, amount, date, and accounting type", async () => {
    const fixture = await makeLoan("lent");
    const payment = await makeRepayment(fixture);
    await expectPgFailure(() => makeAdjustment(fixture, payment, {
      disposition: "cash_refund", amount: "2.00", accountId: ownerBdtAccountId,
    }));
    await expectPgFailure(() => makeAdjustment(fixture, payment, {
      disposition: "cash_refund", amount: "2.00", transactionAmount: "1.00",
    }));
    await expectPgFailure(() => makeAdjustment(fixture, payment, {
      disposition: "cash_refund", amount: "2.00", transactionType: "income",
    }));
    await expectPgFailure(() => makeAdjustment(fixture, payment, {
      disposition: "cash_refund", amount: "2.00", transactionDate: "2027-01-16",
    }));
  });

  await t.test("loan credits have no cash link and application reduces installment principal obligation", async () => {
    const fixture = await makeLoan();
    const payment = await makeRepayment(fixture, { principal: "10.00", interest: "5.00" });
    const adjustment = await makeAdjustment(fixture, payment, { amount: "100.00" });
    await applyCredit(fixture, adjustment, { amount: "50.00", component: "principal" });
    const counts = await pool.query<{ link_count: string; applied: string }>(
      `SELECT (SELECT COUNT(*)::text FROM loan_transaction_links WHERE adjustment_id = $1) AS link_count,
              (SELECT COALESCE(SUM(amount), 0)::text FROM loan_interest_credit_applications
                WHERE adjustment_id = $1 AND entry_type = 'application') AS applied;`,
      [adjustment.id]
    );
    assert.equal(counts.rows[0].link_count, "0");
    assert.equal(counts.rows[0].applied, "50.00");
  });

  await t.test("applications cannot precede their source date or exceed source credit", async () => {
    const fixture = await makeLoan();
    const payment = await makeRepayment(fixture);
    const adjustment = await makeAdjustment(fixture, payment, { amount: "10.00" });
    await expectPgFailure(() => applyCredit(fixture, adjustment, {
      amount: "1.00", effectiveDate: "2027-01-14",
    }));
    await applyCredit(fixture, adjustment, { amount: "6.00" });
    await expectPgFailure(() => applyCredit(fixture, adjustment, { amount: "5.00" }));
  });

  await t.test("applications cannot exceed the remaining installment principal or interest", async () => {
    const principalFixture = await makeLoan();
    const principalPayment = await makeRepayment(principalFixture, { principal: "1.00", interest: "1.00" });
    const principalCredit = await makeAdjustment(principalFixture, principalPayment, { amount: "1000.00" });
    const principalRemaining = cents(principalFixture.installments[0].principal_due) - 100n;
    await expectPgFailure(() => applyCredit(principalFixture, principalCredit, {
      amount: money(principalRemaining + 1n), component: "principal",
    }));

    const interestFixture = await makeLoan();
    const interestPayment = await makeRepayment(interestFixture, { principal: "1.00", interest: "1.00" });
    const interestCredit = await makeAdjustment(interestFixture, interestPayment, { amount: "100.00" });
    const interestRemaining = cents(interestFixture.installments[0].interest_due) - 100n;
    await expectPgFailure(() => applyCredit(interestFixture, interestCredit, {
      amount: money(interestRemaining + 1n), component: "interest",
    }));
  });

  await t.test("application reversal restores available credit and installment obligation; ledger is immutable", async () => {
    const fixture = await makeLoan();
    const payment = await makeRepayment(fixture);
    const adjustment = await makeAdjustment(fixture, payment, { amount: "100.00" });
    const applicationId = await applyCredit(fixture, adjustment, {
      amount: "80.00", effectiveDate: "2027-02-01",
    });
    await expectPgFailure(() => applyCredit(fixture, adjustment, {
      amount: "80.00", entryType: "reversal", reversesApplicationId: applicationId,
      effectiveDate: "2027-01-31",
    }));
    await applyCredit(fixture, adjustment, {
      amount: "80.00", entryType: "reversal", reversesApplicationId: applicationId,
      effectiveDate: "2027-02-02",
    });
    await applyCredit(fixture, adjustment, { amount: "100.00", effectiveDate: "2027-02-03" });
    const net = await pool.query<{ amount: string }>(
      `SELECT COALESCE(SUM(CASE WHEN entry_type = 'application' THEN amount ELSE -amount END), 0)::text AS amount
         FROM loan_interest_credit_applications WHERE adjustment_id = $1;`,
      [adjustment.id]
    );
    assert.equal(net.rows[0].amount, "100.00");
    await expectPgFailure(() => applyCredit(fixture, adjustment, {
      amount: "80.00", entryType: "reversal", reversesApplicationId: applicationId,
      effectiveDate: "2027-02-02",
    }), ["23505"]);
    await expectPgFailure(() => transaction((client) => client.query(
      "UPDATE loan_interest_credit_applications SET note = 'changed' WHERE id = $1;", [applicationId]
    )));
    await expectPgFailure(() => transaction((client) => client.query(
      "UPDATE loan_interest_adjustments SET note = 'changed' WHERE id = $1;", [adjustment.id]
    )));
    await expectPgFailure(() => transaction((client) => client.query(
      "UPDATE loan_installments SET principal_due = principal_due + 1 WHERE id = $1;",
      [fixture.installments[0].id]
    )));
  });

  await t.test("repayment allocations reduce credit-eligible installment obligation", async () => {
    const fixture = await makeLoan();
    const payment = await makeRepayment(fixture, { principal: "100.00", interest: "5.00" });
    const adjustment = await makeAdjustment(fixture, payment, { amount: "1000.00" });
    const remaining = cents(fixture.installments[0].principal_due) - 10000n;
    await expectPgFailure(() => applyCredit(fixture, adjustment, {
      amount: money(remaining + 1n), component: "principal",
    }));
  });

  await t.test("loan-credit adjustment can be reversed only after applications are reversed", async () => {
    const fixture = await makeLoan();
    const payment = await makeRepayment(fixture);
    const adjustment = await makeAdjustment(fixture, payment, { amount: "20.00" });
    const repaymentReversal = await reverseRepayment(fixture, payment);
    const appId = await applyCredit(fixture, adjustment, { amount: "1.00" });
    await expectPgFailure(() => makeAdjustment(fixture, repaymentReversal, {
      amount: adjustment.amount, entryType: "reversal", reversesAdjustmentId: adjustment.id,
    }));

    const secondFixture = await makeLoan();
    const secondPayment = await makeRepayment(secondFixture);
    const secondAdjustment = await makeAdjustment(secondFixture, secondPayment, { amount: "20.00" });
    const secondReversal = await reverseRepayment(secondFixture, secondPayment);
    const reversed = await makeAdjustment(secondFixture, secondReversal, {
      amount: secondAdjustment.amount, entryType: "reversal", reversesAdjustmentId: secondAdjustment.id,
    });
    assert.equal(reversed.disposition, "loan_credit");
    await expectPgFailure(() => makeAdjustment(secondFixture, secondReversal, {
      amount: secondAdjustment.amount, entryType: "reversal", reversesAdjustmentId: secondAdjustment.id,
    }), ["23505"]);
    assert.ok(appId);
  });

  await t.test("cash-refund reversal uses inverse income/expense direction and preserves ledger rows", async () => {
    for (const type of ["lent", "borrowed"] as const) {
      const fixture = await makeLoan(type);
      const payment = await makeRepayment(fixture);
      const adjustment = await makeAdjustment(fixture, payment, { disposition: "cash_refund", amount: "2.00" });
      const repaymentReversal = await reverseRepayment(fixture, payment);
      const reversal = await makeAdjustment(fixture, repaymentReversal, {
        disposition: "cash_refund", amount: "2.00", entryType: "reversal", reversesAdjustmentId: adjustment.id,
      });
      const tx = await pool.query<{ type: string; amount: string }>(
        `SELECT t.type, t.amount::text
           FROM loan_transaction_links l JOIN transactions t ON t.id = l.transaction_id
          WHERE l.adjustment_id = $1;`,
        [reversal.id]
      );
      assert.equal(tx.rows[0].type, type === "lent" ? "income" : "expense");
      assert.equal(tx.rows[0].amount, "2.00");
      await expectPgFailure(() => transaction((client) => client.query(
        "DELETE FROM loan_interest_adjustments WHERE id = $1;", [adjustment.id]
      )));
    }
  });

  await t.test("non-flat loans cannot create interest adjustments", async () => {
    const fixture = await makeLoan("lent", "simple");
    const payment = await makeRepayment(fixture);
    await expectPgFailure(() => makeAdjustment(fixture, payment, { amount: "1.00" }));
  });

  await t.test("cross-owner references cannot create interest adjustments", async () => {
    const flatFixture = await makeLoan();
    const flatPayment = await makeRepayment(flatFixture);
    // Keep the malformed owner reference's repayment valid and unique for this
    // loan/user key so the ownership trigger, rather than the repayment unique
    // constraint, is the rule under test.
    const distinctOwnerPayment = await makeRepayment(flatFixture);
    const otherFixture = await makeLoan("lent", "flat", otherUserId, otherPersonId, otherUsdAccountId);
    const otherPayment = await makeRepayment(otherFixture);
    await expectPgFailure(() => transaction(async (client) => {
      await client.query(
        `INSERT INTO loan_interest_adjustments (
           user_id, debt_id, repayment_id, entry_type, disposition, amount, effective_date
         ) VALUES ($1, $2, $3, 'credit', 'loan_credit', 1.00, $4::date);`,
        [otherUserId, flatFixture.loan.id, distinctOwnerPayment.id, distinctOwnerPayment.date]
      );
    }), ["23514", "23503"]);

    const ownerCredit = await makeAdjustment(flatFixture, flatPayment, { amount: "10.00" });
    await expectPgFailure(() => transaction(async (client) => {
      await client.query(
        `INSERT INTO loan_interest_adjustments (
           user_id, debt_id, repayment_id, entry_type, disposition, amount, effective_date
         ) VALUES ($1, $2, $3, 'credit', 'loan_credit', 1.00, $4::date);`,
        [ownerId, flatFixture.loan.id, otherPayment.id, otherPayment.date]
      );
    }));
    await expectPgFailure(() => applyCredit(flatFixture, ownerCredit, {
      amount: "1.00", installmentId: otherFixture.installments[0].id,
    }));

    // Each repayment may have only one adjustment. Use another valid payment
    // so this assertion reaches the cross-owner account check rather than the
    // intended per-repayment uniqueness guard.
    const cashRefundPayment = await makeRepayment(flatFixture);
    await expectPgFailure(() => makeAdjustment(flatFixture, cashRefundPayment, {
      disposition: "cash_refund", amount: "1.00", accountId: otherUsdAccountId,
    }), ["23514", "23503"]);
  });

  await t.test("new schedule version is allowed while a credit-referenced historical installment stays protected", async () => {
    const fixture = await makeLoan();
    const payment = await makeRepayment(fixture, { installmentIndex: 1 });
    const adjustment = await makeAdjustment(fixture, payment, { amount: "10.00" });
    await applyCredit(fixture, adjustment, { amount: "1.00" });
    await transaction(async (client) => {
      const nextSchedule = await client.query<{ id: string }>(
        `INSERT INTO loan_schedules (user_id, debt_id, version_no, is_current, created_by)
         VALUES ($1, $2, 2, FALSE, $1) RETURNING id;`,
        [ownerId, fixture.loan.id]
      );
      const newScheduleId = nextSchedule.rows[0].id;
      for (let i = 0; i < fixture.installments.length; i += 1) {
        const old = fixture.installments[i];
        await client.query(
          `INSERT INTO loan_installments (
             user_id, debt_id, schedule_id, installment_number, due_date, principal_due, interest_due
           ) SELECT user_id, debt_id, $1, installment_number, due_date, principal_due, interest_due
               FROM loan_installments WHERE id = $2;`,
          [newScheduleId, old.id]
        );
      }
      await client.query("UPDATE loan_schedules SET is_current = FALSE WHERE debt_id = $1 AND version_no = 1;", [fixture.loan.id]);
      await client.query("UPDATE loan_schedules SET is_current = TRUE WHERE id = $1;", [newScheduleId]);
      await client.query("UPDATE debt_records SET current_schedule_version = 2 WHERE id = $1;", [fixture.loan.id]);
    });
  });

  await t.test("concurrent credit applications cannot overspend one adjustment", async () => {
    const fixture = await makeLoan();
    const payment = await makeRepayment(fixture);
    const adjustment = await makeAdjustment(fixture, payment, { amount: "100.00" });
    const attempt = () => applyCredit(fixture, adjustment, { amount: "60.00" });
    const results = await Promise.allSettled([attempt(), attempt()]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const rejected = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    assert.equal(rejected.length, 1);
    assert.equal(pgCode(rejected[0].reason), "23514");
    const net = await pool.query<{ amount: string }>(
      `SELECT COALESCE(SUM(CASE WHEN entry_type = 'application' THEN amount ELSE -amount END), 0)::text AS amount
         FROM loan_interest_credit_applications WHERE adjustment_id = $1;`,
      [adjustment.id]
    );
    assert.equal(net.rows[0].amount, "60.00");
  });

  await t.test("concurrent application and adjustment reversal cannot both consume the same credit", async () => {
    const fixture = await makeLoan();
    const payment = await makeRepayment(fixture);
    const adjustment = await makeAdjustment(fixture, payment, { amount: "10.00" });
    const repaymentReversal = await reverseRepayment(fixture, payment);
    const applicationAttempt = applyCredit(fixture, adjustment, { amount: "1.00" });
    const reversalAttempt = makeAdjustment(fixture, repaymentReversal, {
      amount: adjustment.amount, entryType: "reversal", reversesAdjustmentId: adjustment.id,
    });
    const outcomes = await Promise.allSettled([applicationAttempt, reversalAttempt]);
    assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
    const rejected = outcomes.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    assert.equal(rejected.length, 1);
    assert.equal(pgCode(rejected[0].reason), "23514");
  });
});
