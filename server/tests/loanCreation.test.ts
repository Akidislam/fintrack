import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import express from "express";
import { createServer, Server } from "node:http";
import { pool } from "../src/db";
import loanRoutes from "../src/routes/loanRoutes";
import { errorHandler } from "../src/middleware/errorHandler";
import { signToken } from "../src/utils/token";

const connectionString = process.env.DATABASE_URL;
if (!connectionString || new URL(connectionString).pathname.replace(/^\//, "") !== "fintrack_migration_test") {
  throw new Error("Loan API integration tests require DATABASE_URL to target only fintrack_migration_test.");
}

const unique = randomUUID();
let ownerId = "";
let otherUserId = "";
let personId = "";
let accountId = "";
let otherPersonId = "";
let otherAccountId = "";
let server: Server;
let apiBase = "";

const app = express();
app.use(express.json());
app.use("/api/loans", loanRoutes);
app.use(errorHandler);

function bearer(userId: string, email: string): string {
  return signToken({ userId, email });
}

async function postLoan(
  token: string,
  body: Record<string, unknown>,
  key = randomUUID()
): Promise<{ status: number; body: Record<string, any> }> {
  const response = await fetch(`${apiBase}/api/loans`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as Record<string, any> };
}

function loanBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    personId,
    type: "lent",
    amount: "1000.00",
    accountId,
    currency: "USD",
    startDate: "2026-01-01",
    dueDate: "2026-01-31",
    interestMethod: "simple",
    annualRatePct: "10",
    repaymentMode: "one_time",
    description: "Integration test loan",
    ...overrides,
  };
}

before(async () => {
  const check = await pool.query<{ exists: boolean }>(
    "SELECT to_regclass('public.loan_creation_idempotency') IS NOT NULL AS exists;"
  );
  assert.equal(check.rows[0].exists, true, "Apply migration 005 to the isolated test database before running these tests.");

  const ownerEmail = `loan-api-owner-${unique}@example.test`;
  const otherEmail = `loan-api-other-${unique}@example.test`;
  const users = await pool.query<{ id: string; email: string }>(
    `INSERT INTO users (name, email, currency)
     VALUES ('Loan API Test Owner', $1, 'USD'), ('Loan API Test Other', $2, 'USD')
     RETURNING id, email;`,
    [ownerEmail, otherEmail]
  );
  ownerId = users.rows.find((row) => row.email === ownerEmail)!.id;
  otherUserId = users.rows.find((row) => row.email === otherEmail)!.id;

  const ownerPerson = await pool.query<{ id: string }>(
    "INSERT INTO people (user_id, name) VALUES ($1, 'Loan API Test Person') RETURNING id;",
    [ownerId]
  );
  personId = ownerPerson.rows[0].id;
  const otherPerson = await pool.query<{ id: string }>(
    "INSERT INTO people (user_id, name) VALUES ($1, 'Other Loan API Person') RETURNING id;",
    [otherUserId]
  );
  otherPersonId = otherPerson.rows[0].id;

  const accounts = await pool.query<{ id: string; user_id: string }>(
    `INSERT INTO accounts (user_id, name, type, opening_balance, currency)
     VALUES ($1, 'Loan API Test USD', 'Bank Account', 10000, 'USD'),
            ($2, 'Other Loan API USD', 'Bank Account', 10000, 'USD')
     RETURNING id, user_id;`,
    [ownerId, otherUserId]
  );
  accountId = accounts.rows.find((row) => row.user_id === ownerId)!.id;
  otherAccountId = accounts.rows.find((row) => row.user_id === otherUserId)!.id;

  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  apiBase = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (ownerId) await pool.query("DELETE FROM users WHERE id = $1 OR id = $2;", [ownerId, otherUserId]);
  await pool.end();
});

test("loan creation API covers lending, borrowing, validation, idempotency, and rollback", async () => {
  const ownerToken = bearer(ownerId, `loan-api-owner-${unique}@example.test`);
  const otherToken = bearer(otherUserId, `loan-api-other-${unique}@example.test`);

  const unauthenticated = await fetch(`${apiBase}/api/loans`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": randomUUID() },
    body: JSON.stringify(loanBody()),
  });
  assert.equal(unauthenticated.status, 401);

  const lentKey = randomUUID();
  const [lent, concurrentRetry] = await Promise.all([
    postLoan(ownerToken, loanBody({ userId: otherUserId }), lentKey),
    postLoan(ownerToken, loanBody({ userId: otherUserId }), lentKey),
  ]);
  assert.deepEqual([lent.status, concurrentRetry.status].sort(), [200, 201]);
  assert.equal(lent.body.data.userId, ownerId);
  assert.equal(lent.body.data.type, "lent");
  assert.equal(lent.body.data.schedule.installments[0].principalDue, "1000.00");
  assert.equal(lent.body.data.schedule.installments[0].interestDue, "8.22");
  const lentId = lent.body.data.id as string;
  assert.equal(concurrentRetry.body.data.id, lentId);

  const replay = await postLoan(ownerToken, loanBody(), lentKey);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.data.id, lentId);
  const conflict = await postLoan(ownerToken, loanBody({ amount: "1001.00" }), lentKey);
  assert.equal(conflict.status, 409);

  const borrowed = await postLoan(otherToken, loanBody({
    personId: otherPersonId,
    accountId: otherAccountId,
    type: "borrowed",
    repaymentMode: "installments",
    dueDate: undefined,
    interestMethod: "flat",
    annualRatePct: "12",
    installments: [
      { dueDate: "2026-02-15", principalDue: "500.00" },
      { dueDate: "2026-04-01", principalDue: "500.00" },
    ],
  }));
  assert.equal(borrowed.status, 201);
  assert.equal(borrowed.body.data.type, "borrowed");
  assert.deepEqual(borrowed.body.data.schedule.installments.map((row: any) => row.interestDue), ["14.79", "14.80"]);

  const noInterest = await postLoan(ownerToken, loanBody({
    dueDate: "2026-02-01",
    interestMethod: "none",
    annualRatePct: "0",
  }));
  assert.equal(noInterest.status, 201);
  assert.equal(noInterest.body.data.schedule.installments[0].interestDue, "0.00");

  const generatedTransactions = await pool.query<{ count: string; non_transfer_count: string }>(
    `SELECT COUNT(*)::text AS count,
            COUNT(*) FILTER (WHERE type <> 'transfer')::text AS non_transfer_count
       FROM transactions WHERE user_id = $1 AND is_loan_generated;`,
    [ownerId]
  );
  assert.equal(generatedTransactions.rows[0].count, "2");
  assert.equal(generatedTransactions.rows[0].non_transfer_count, "0");
  const lentCashDirection = await pool.query<{ account_id: string | null; to_account_id: string | null }>(
    "SELECT account_id, to_account_id FROM transactions WHERE user_id = $1 AND is_loan_generated;",
    [ownerId]
  );
  assert.equal(lentCashDirection.rows[0].account_id, accountId);
  assert.equal(lentCashDirection.rows[0].to_account_id, null);
  const borrowedCashDirection = await pool.query<{ account_id: string | null; to_account_id: string | null }>(
    "SELECT account_id, to_account_id FROM transactions WHERE user_id = $1 AND is_loan_generated;",
    [otherUserId]
  );
  assert.equal(borrowedCashDirection.rows[0].account_id, null);
  assert.equal(borrowedCashDirection.rows[0].to_account_id, otherAccountId);

  const foreignPerson = await postLoan(ownerToken, loanBody({ personId: otherPersonId }));
  assert.equal(foreignPerson.status, 404);
  const foreignAccount = await postLoan(ownerToken, loanBody({ accountId: otherAccountId }));
  assert.equal(foreignAccount.status, 404);
  const currencyMismatch = await postLoan(ownerToken, loanBody({ currency: "BDT" }));
  assert.equal(currencyMismatch.status, 400);
  const invalidSchedule = await postLoan(ownerToken, loanBody({
    repaymentMode: "installments",
    dueDate: undefined,
    installments: [
      { dueDate: "2026-02-01", principalDue: "900.00" },
      { dueDate: "2026-03-01", principalDue: "99.00" },
    ],
  }));
  assert.equal(invalidSchedule.status, 400);
  const invalidAmount = await postLoan(ownerToken, loanBody({ amount: "-1" }));
  assert.equal(invalidAmount.status, 400);

  // Force a database-side failure after the loan, schedule and installment
  // rows have been inserted. The service must roll the complete operation back.
  await pool.query("DROP TRIGGER IF EXISTS test_fail_loan_creation_transaction ON transactions;");
  await pool.query("DROP FUNCTION IF EXISTS public.test_fail_loan_creation_transaction();");
  await pool.query(`
    CREATE OR REPLACE FUNCTION public.test_fail_loan_creation_transaction()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.is_loan_generated THEN
        RAISE EXCEPTION 'intentional integration-test failure';
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER test_fail_loan_creation_transaction
    BEFORE INSERT ON transactions
    FOR EACH ROW EXECUTE FUNCTION public.test_fail_loan_creation_transaction();
  `);
  try {
    const beforeCount = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM debt_records WHERE user_id = $1;", [ownerId]
    );
    const failed = await postLoan(ownerToken, loanBody({ dueDate: "2026-02-01" }));
    assert.equal(failed.status, 500);
    const afterCount = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM debt_records WHERE user_id = $1;", [ownerId]
    );
    assert.equal(afterCount.rows[0].count, beforeCount.rows[0].count);
  } finally {
    await pool.query("DROP TRIGGER IF EXISTS test_fail_loan_creation_transaction ON transactions;");
    await pool.query("DROP FUNCTION IF EXISTS public.test_fail_loan_creation_transaction();");
  }
});
