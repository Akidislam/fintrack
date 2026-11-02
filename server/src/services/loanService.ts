import { createHash } from "crypto";
import { PoolClient } from "pg";
import { pool } from "../db";

export type LoanDirection = "lent" | "borrowed";
export type InterestMethod = "none" | "simple" | "flat";
export type RepaymentMode = "one_time" | "installments";

export interface LoanInstallmentInput {
  dueDate: string;
  principalDue: string;
}

export interface CreateLoanInput {
  personId: string;
  type: LoanDirection;
  amount: string;
  accountId: string;
  currency?: string;
  startDate: string;
  dueDate?: string;
  interestMethod: InterestMethod;
  annualRatePct: string;
  repaymentMode: RepaymentMode;
  description?: string | null;
  installments?: LoanInstallmentInput[];
}

export interface CreatedLoan {
  id: string;
  userId: string;
  personId: string;
  personName: string;
  type: LoanDirection;
  amount: string;
  accountId: string;
  accountName: string;
  currency: string;
  startDate: string;
  dueDate: string;
  interestMethod: InterestMethod;
  annualRatePct: string;
  repaymentMode: RepaymentMode;
  description: string | null;
  status: string;
  currentScheduleVersion: number;
  schedule: {
    version: number;
    installments: Array<{
      installmentNumber: number;
      dueDate: string;
      principalDue: string;
      interestDue: string;
    }>;
  };
  createdAt: string;
}

export type CreateLoanResult =
  | { kind: "created"; loan: CreatedLoan }
  | { kind: "replayed"; loan: CreatedLoan }
  | { kind: "idempotency_conflict" }
  | { kind: "person_not_found" }
  | { kind: "account_not_found" }
  | { kind: "currency_mismatch" }
  | { kind: "schedule_principal_mismatch" }
  | { kind: "empty_installment" };

interface ScheduleRow {
  installment_number: number;
  due_date: Date | string;
  principal_due: string;
  interest_due: string;
}

interface LoanRow {
  id: string;
  user_id: string;
  person_id: string;
  person_name: string;
  type: LoanDirection;
  amount: string;
  account_id: string;
  account_name: string;
  currency: string;
  start_date: Date | string;
  due_date: Date | string;
  interest_method: InterestMethod;
  annual_rate_pct: string;
  repayment_mode: RepaymentMode;
  description: string | null;
  status: string;
  current_schedule_version: number;
  created_at: Date | string;
}

function dateOnly(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function isoTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function canonicalRequest(input: CreateLoanInput): string {
  return JSON.stringify({
    personId: input.personId,
    type: input.type,
    amount: input.amount,
    accountId: input.accountId,
    currency: input.currency?.toUpperCase() ?? null,
    startDate: input.startDate,
    dueDate: input.dueDate ?? null,
    interestMethod: input.interestMethod,
    annualRatePct: input.annualRatePct,
    repaymentMode: input.repaymentMode,
    description: input.description ?? null,
    installments: input.installments ?? null,
  });
}

async function readLoan(client: PoolClient, userId: string, loanId: string): Promise<CreatedLoan | null> {
  const result = await client.query<LoanRow>(
    `SELECT d.id, d.user_id, d.person_id, p.name AS person_name,
            d.type, d.amount::text, d.account_id, a.name AS account_name,
            d.currency, d.start_date::text AS start_date, d.due_date::text AS due_date, d.interest_method,
            d.annual_rate_pct::text, d.repayment_mode, d.description,
            d.status, d.current_schedule_version, d.created_at
       FROM debt_records d
       JOIN people p ON p.id = d.person_id AND p.user_id = d.user_id
       JOIN accounts a ON a.id = d.account_id AND a.user_id = d.user_id
      WHERE d.id = $1 AND d.user_id = $2;`,
    [loanId, userId]
  );
  const row = result.rows[0];
  if (!row) return null;

  const scheduleResult = await client.query<ScheduleRow>(
    `SELECT i.installment_number, i.due_date::text AS due_date,
            i.principal_due::text, i.interest_due::text
       FROM loan_installments i
       JOIN loan_schedules s ON s.id = i.schedule_id
          AND s.user_id = i.user_id AND s.debt_id = i.debt_id
      WHERE i.user_id = $1 AND i.debt_id = $2 AND s.is_current
      ORDER BY i.installment_number;`,
    [userId, loanId]
  );

  return {
    id: row.id,
    userId: row.user_id,
    personId: row.person_id,
    personName: row.person_name,
    type: row.type,
    amount: row.amount,
    accountId: row.account_id,
    accountName: row.account_name,
    currency: row.currency,
    startDate: dateOnly(row.start_date),
    dueDate: dateOnly(row.due_date),
    interestMethod: row.interest_method,
    annualRatePct: row.annual_rate_pct,
    repaymentMode: row.repayment_mode,
    description: row.description,
    status: row.status,
    currentScheduleVersion: row.current_schedule_version,
    schedule: {
      version: row.current_schedule_version,
      installments: scheduleResult.rows.map((installment) => ({
        installmentNumber: installment.installment_number,
        dueDate: dateOnly(installment.due_date),
        principalDue: installment.principal_due,
        interestDue: installment.interest_due,
      })),
    },
    createdAt: isoTimestamp(row.created_at),
  };
}

export async function createLoan(
  userId: string,
  idempotencyKey: string,
  input: CreateLoanInput
): Promise<CreateLoanResult> {
  const requestHash = createHash("sha256").update(canonicalRequest(input)).digest("hex");
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    // Serialize retries with the same user/key even when they arrive concurrently.
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0));",
      [`${userId}:${idempotencyKey}`]
    );
    const previousResult = await client.query<{ request_hash: string; debt_id: string }>(
      `SELECT request_hash, debt_id FROM loan_creation_idempotency
        WHERE user_id = $1 AND idempotency_key = $2;`,
      [userId, idempotencyKey]
    );
    const previous = previousResult.rows[0];
    if (previous) {
      if (previous.request_hash !== requestHash) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return { kind: "idempotency_conflict" };
      }
      const loan = await readLoan(client, userId, previous.debt_id);
      if (!loan) throw new Error("Idempotent loan creation record refers to a missing loan.");
      await client.query("COMMIT");
      transactionStarted = false;
      return { kind: "replayed", loan };
    }

    const personResult = await client.query<{ id: string; name: string }>(
      "SELECT id, name FROM people WHERE id = $1 AND user_id = $2 FOR KEY SHARE;",
      [input.personId, userId]
    );
    if (!personResult.rows[0]) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return { kind: "person_not_found" };
    }

    const accountResult = await client.query<{ id: string; name: string; currency: string; is_archived: boolean }>(
      `SELECT id, name, UPPER(currency) AS currency, is_archived
         FROM accounts WHERE id = $1 AND user_id = $2 FOR UPDATE;`,
      [input.accountId, userId]
    );
    const account = accountResult.rows[0];
    if (!account || account.is_archived) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return { kind: "account_not_found" };
    }
    if (input.currency && input.currency.toUpperCase() !== account.currency) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return { kind: "currency_mismatch" };
    }

    const schedule = input.repaymentMode === "one_time"
      ? [{ dueDate: input.dueDate as string, principalDue: input.amount }]
      : (input.installments as LoanInstallmentInput[]);
    const finalDueDate = schedule[schedule.length - 1].dueDate;

    const amountCheck = await client.query<{ matches: boolean }>(
      `SELECT COALESCE(SUM(v::numeric), 0) = $2::numeric AS matches
         FROM unnest($1::text[]) AS v;`,
      [schedule.map((item) => item.principalDue), input.amount]
    );
    if (!amountCheck.rows[0]?.matches) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return { kind: "schedule_principal_mismatch" };
    }

    const loanResult = await client.query<{ id: string }>(
      `INSERT INTO debt_records (
         user_id, person_id, type, amount, due_date, description, status,
         account_id, start_date, currency, interest_method, annual_rate_pct,
         repayment_mode, allocation_policy, current_schedule_version, is_legacy_unlinked
       ) VALUES ($1, $2, $3, $4::numeric, $5::date, $6, 'active', $7, $8::date,
                 $9, $10, $11::numeric, $12, 'oldest_due_interest_first', 1, FALSE)
       RETURNING id;`,
      [userId, input.personId, input.type, input.amount, finalDueDate,
        input.description ?? null, input.accountId, input.startDate,
        account.currency, input.interestMethod, input.annualRatePct, input.repaymentMode]
    );
    const loanId = loanResult.rows[0].id;

    const scheduleResult = await client.query<{ id: string }>(
      `INSERT INTO loan_schedules (user_id, debt_id, version_no, is_current, created_by)
       VALUES ($1, $2, 1, TRUE, $1) RETURNING id;`,
      [userId, loanId]
    );
    const scheduleId = scheduleResult.rows[0].id;

    const scheduleRows = await client.query<ScheduleRow>(
      `WITH input_rows AS (
         SELECT ord::integer AS installment_number,
                due_date::date AS due_date,
                principal_due::numeric AS principal_due
           FROM unnest($1::text[], $2::text[]) WITH ORDINALITY
                AS item(due_date, principal_due, ord)
       ), periods AS (
         SELECT installment_number, due_date, principal_due,
                due_date - COALESCE(
                  LAG(due_date) OVER (ORDER BY installment_number), $3::date
                ) AS period_days,
                COALESCE(
                  SUM(principal_due) OVER (
                    ORDER BY installment_number ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
                  ), 0
                ) AS principal_paid_before
           FROM input_rows
       ), flat_total AS (
         SELECT ROUND($4::numeric * ($5::numeric / 100) * (MAX(due_date) - $3::date) / 365, 2) AS total
           FROM periods
       )
       SELECT p.installment_number, p.due_date,
              p.principal_due::text AS principal_due,
              CASE
                WHEN $6::text = 'none' THEN 0::numeric
                WHEN $6::text = 'simple' THEN ROUND(
                  GREATEST($4::numeric - p.principal_paid_before, 0)
                  * ($5::numeric / 100) * p.period_days / 365, 2
                )
                WHEN $6::text = 'flat' AND p.installment_number < (SELECT COUNT(*) FROM periods)
                  THEN TRUNC((SELECT total FROM flat_total) / (SELECT COUNT(*) FROM periods), 2)
                WHEN $6::text = 'flat' THEN
                  (SELECT total FROM flat_total)
                  - TRUNC((SELECT total FROM flat_total) / (SELECT COUNT(*) FROM periods), 2)
                    * ((SELECT COUNT(*) FROM periods) - 1)
              END::text AS interest_due
         FROM periods p
        ORDER BY p.installment_number;`,
      [schedule.map((item) => item.dueDate), schedule.map((item) => item.principalDue),
        input.startDate, input.amount, input.annualRatePct, input.interestMethod]
    );

    const hasEmptyInstallment = scheduleRows.rows.some((row) =>
      !/[1-9]/.test(row.principal_due) && !/[1-9]/.test(row.interest_due)
    );
    if (hasEmptyInstallment) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return { kind: "empty_installment" };
    }

    for (const installment of scheduleRows.rows) {
      await client.query(
        `INSERT INTO loan_installments (
           user_id, debt_id, schedule_id, installment_number, due_date, principal_due, interest_due
         ) VALUES ($1, $2, $3, $4, $5::date, $6::numeric, $7::numeric);`,
        [userId, loanId, scheduleId, installment.installment_number,
          dateOnly(installment.due_date), installment.principal_due, installment.interest_due]
      );
    }

    // Principal disbursements are one-sided transfers, never income or expense.
    const transactionResult = await client.query<{ id: string }>(
      `INSERT INTO transactions (
         user_id, title, amount, type, category_id, category_name, date, note,
         account_id, to_account_id, is_loan_generated
       ) VALUES (
         $1, $2, $3::numeric, 'transfer', NULL, 'Transfer', $4::date, $5,
         $6, $7, TRUE
       ) RETURNING id;`,
      [userId,
        input.type === "lent" ? `Loan lent to ${personResult.rows[0].name}` : `Loan borrowed from ${personResult.rows[0].name}`,
        input.amount, input.startDate, input.description ?? null,
        input.type === "lent" ? input.accountId : null,
        input.type === "borrowed" ? input.accountId : null]
    );

    await client.query(
      `INSERT INTO loan_transaction_links (user_id, debt_id, repayment_id, transaction_id, component, amount)
       VALUES ($1, $2, NULL, $3, 'disbursement_principal', $4::numeric);`,
      [userId, loanId, transactionResult.rows[0].id, input.amount]
    );
    await client.query(
      `INSERT INTO loan_creation_idempotency (user_id, idempotency_key, request_hash, debt_id)
       VALUES ($1, $2, $3, $4);`,
      [userId, idempotencyKey, requestHash, loanId]
    );

    // Force migration's deferred integrity checks before reporting success.
    await client.query("SET CONSTRAINTS ALL IMMEDIATE;");
    const loan = await readLoan(client, userId, loanId);
    if (!loan) throw new Error("Created loan could not be read inside its transaction.");
    await client.query("COMMIT");
    transactionStarted = false;
    return { kind: "created", loan };
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
