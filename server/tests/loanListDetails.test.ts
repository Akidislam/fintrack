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
  throw new Error("Loan list/detail integration tests require DATABASE_URL to target only fintrack_migration_test.");
}

const unique = randomUUID();
let ownerId = "";
let otherUserId = "";
let ownerPersonId = "";
let otherPersonId = "";
let ownerAccountId = "";
let otherAccountId = "";
let ownerLoanIds: string[] = [];
let otherLoanId = "";
let server: Server;
let apiBase = "";

const app = express();
app.use(express.json());
app.use("/api/loans", loanRoutes);
app.use(errorHandler);

function token(userId: string, email: string): string {
  return signToken({ userId, email });
}

async function requestJson(
  path: string,
  userToken?: string
): Promise<{ status: number; body: Record<string, any> }> {
  const response = await fetch(`${apiBase}${path}`, {
    headers: userToken ? { Authorization: `Bearer ${userToken}` } : {},
  });
  return { status: response.status, body: await response.json() as Record<string, any> };
}

async function createLoan(userToken: string, personId: string, accountId: string, installment = false) {
  const body = installment
    ? {
        personId,
        type: "lent",
        amount: "100.00",
        accountId,
        currency: "USD",
        startDate: "2025-01-01",
        interestMethod: "none",
        annualRatePct: "0",
        repaymentMode: "installments",
        installments: [
          { dueDate: "2025-02-01", principalDue: "40.00" },
          { dueDate: "2025-03-01", principalDue: "60.00" },
        ],
      }
    : {
        personId,
        type: "borrowed",
        amount: "75.00",
        accountId,
        currency: "USD",
        startDate: "2025-01-01",
        dueDate: "2025-02-01",
        interestMethod: "none",
        annualRatePct: "0",
        repaymentMode: "one_time",
      };

  const response = await fetch(`${apiBase}/api/loans`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${userToken}`,
      "Content-Type": "application/json",
      "Idempotency-Key": randomUUID(),
    },
    body: JSON.stringify(body),
  });
  const result = await response.json() as Record<string, any>;
  assert.equal(response.status, 201, JSON.stringify(result));
  return result.data as { id: string };
}

before(async () => {
  const check = await pool.query<{ exists: boolean }>(
    "SELECT to_regclass('public.loan_creation_idempotency') IS NOT NULL AS exists;"
  );
  assert.equal(check.rows[0].exists, true, "Apply the existing loan migrations to the isolated test database first.");

  const ownerEmail = `loan-read-owner-${unique}@example.test`;
  const otherEmail = `loan-read-other-${unique}@example.test`;
  const users = await pool.query<{ id: string; email: string }>(
    `INSERT INTO users (name, email, currency)
     VALUES ('Loan Read Test Owner', $1, 'USD'), ('Loan Read Test Other', $2, 'USD')
     RETURNING id, email;`,
    [ownerEmail, otherEmail]
  );
  ownerId = users.rows.find((row) => row.email === ownerEmail)!.id;
  otherUserId = users.rows.find((row) => row.email === otherEmail)!.id;

  const people = await pool.query<{ id: string; user_id: string }>(
    `INSERT INTO people (user_id, name)
     VALUES ($1, $2), ($3, $4) RETURNING id, user_id;`,
    [ownerId, `Owner ${unique}`, otherUserId, `Other ${unique}`]
  );
  ownerPersonId = people.rows.find((row) => row.user_id === ownerId)!.id;
  otherPersonId = people.rows.find((row) => row.user_id === otherUserId)!.id;

  const accounts = await pool.query<{ id: string; user_id: string }>(
    `INSERT INTO accounts (user_id, name, type, opening_balance, currency)
     VALUES ($1, $2, 'Bank Account', 1000, 'USD'),
            ($3, $4, 'Bank Account', 1000, 'USD')
     RETURNING id, user_id;`,
    [ownerId, `Owner Loan Read ${unique}`, otherUserId, `Other Loan Read ${unique}`]
  );
  ownerAccountId = accounts.rows.find((row) => row.user_id === ownerId)!.id;
  otherAccountId = accounts.rows.find((row) => row.user_id === otherUserId)!.id;

  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  apiBase = `http://127.0.0.1:${address.port}`;

  const ownerToken = token(ownerId, ownerEmail);
  const otherToken = token(otherUserId, otherEmail);
  const first = await createLoan(ownerToken, ownerPersonId, ownerAccountId, true);
  const second = await createLoan(ownerToken, ownerPersonId, ownerAccountId);
  const other = await createLoan(otherToken, otherPersonId, otherAccountId);
  ownerLoanIds = [first.id, second.id];
  otherLoanId = other.id;
});

after(async () => {
  if (server?.listening) {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  if (ownerId) await pool.query("DELETE FROM users WHERE id = $1 OR id = $2;", [ownerId, otherUserId]);
  await pool.end();
});

test("loan list is authenticated, owner-scoped, and paginated", async () => {
  const ownerToken = token(ownerId, `loan-read-owner-${unique}@example.test`);
  const unauthenticated = await requestJson("/api/loans");
  assert.equal(unauthenticated.status, 401);

  const all = await requestJson("/api/loans", ownerToken);
  assert.equal(all.status, 200);
  assert.equal(all.body.success, true);
  assert.equal(all.body.count, 2);
  assert.deepEqual(new Set(all.body.data.map((loan: { id: string }) => loan.id)), new Set(ownerLoanIds));
  assert.equal(all.body.data.some((loan: { id: string }) => loan.id === otherLoanId), false);
  assert.equal(all.body.data[0].person.id, ownerPersonId);
  assert.equal(all.body.data[0].account.id, ownerAccountId);

  const firstPage = await requestJson("/api/loans?limit=1&offset=0", ownerToken);
  const secondPage = await requestJson("/api/loans?limit=1&offset=1", ownerToken);
  assert.equal(firstPage.status, 200);
  assert.equal(secondPage.status, 200);
  assert.equal(firstPage.body.count, 1);
  assert.equal(secondPage.body.count, 1);
  assert.notEqual(firstPage.body.data[0].id, secondPage.body.data[0].id);

  const invalidLimit = await requestJson("/api/loans?limit=100000", ownerToken);
  assert.equal(invalidLimit.status, 400);
});

test("loan detail returns its owned parties and only current schedule installments", async () => {
  const ownerToken = token(ownerId, `loan-read-owner-${unique}@example.test`);
  const detail = await requestJson(`/api/loans/${ownerLoanIds[0]}`, ownerToken);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.success, true);
  assert.equal(detail.body.data.id, ownerLoanIds[0]);
  assert.equal(detail.body.data.person.id, ownerPersonId);
  assert.equal(detail.body.data.person.name, `Owner ${unique}`);
  assert.equal(detail.body.data.account.id, ownerAccountId);
  assert.equal(detail.body.data.schedule.version, detail.body.data.currentScheduleVersion);
  assert.deepEqual(
    detail.body.data.schedule.installments.map((item: { dueDate: string; principalDue: string }) => [item.dueDate, item.principalDue]),
    [["2025-02-01", "40.00"], ["2025-03-01", "60.00"]]
  );

  const invalidId = await requestJson("/api/loans/not-a-uuid", ownerToken);
  assert.equal(invalidId.status, 400);
  const missing = await requestJson(`/api/loans/${randomUUID()}`, ownerToken);
  assert.equal(missing.status, 404);
  const otherOwnerLoan = await requestJson(`/api/loans/${otherLoanId}`, ownerToken);
  assert.equal(otherOwnerLoan.status, 404);
});
