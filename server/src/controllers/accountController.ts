import { Request, Response, NextFunction } from "express";
import { pool } from "../db";
import { AccountResponse, AccountType, CreateAccountDTO, UpdateAccountDTO } from "../types";

export const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001";

export const ALLOWED_ACCOUNT_TYPES: readonly AccountType[] = [
  "Cash",
  "Bank Account",
  "Mobile Wallet",
  "Credit Card",
];

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUUID(id: unknown): id is string {
  return typeof id === "string" && UUID_REGEX.test(id);
}

function getAuthUserId(req: Request, res: Response): string | null {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({
      success: false,
      message: "Authentication required. Please log in.",
    });
    return null;
  }
  return userId;
}

interface AccountRow {
  id: string;
  name: string;
  type: string;
  opening_balance: string | number;
  currency: string;
  note: string | null;
  is_archived: boolean;
  created_at: Date | string;
  updated_at: Date | string;
  current_balance: string | number;
  transaction_count: string | number;
}

function mapAccountRow(row: AccountRow): AccountResponse {
  const opening = typeof row.opening_balance === "number"
    ? row.opening_balance
    : parseFloat(row.opening_balance);
  const current = typeof row.current_balance === "number"
    ? row.current_balance
    : parseFloat(row.current_balance);
  const txCount = typeof row.transaction_count === "number"
    ? row.transaction_count
    : parseInt(String(row.transaction_count), 10) || 0;

  const createdAtStr = row.created_at instanceof Date
    ? row.created_at.toISOString().split("T")[0]
    : String(row.created_at).split("T")[0];

  const updatedAtStr = row.updated_at instanceof Date
    ? row.updated_at.toISOString()
    : String(row.updated_at);

  return {
    id: row.id,
    name: row.name,
    type: row.type as AccountType,
    openingBalance: Math.round((opening + Number.EPSILON) * 100) / 100,
    currency: row.currency,
    note: row.note ?? null,
    isArchived: Boolean(row.is_archived),
    createdAt: createdAtStr,
    updatedAt: updatedAtStr,
    currentBalance: Math.round((current + Number.EPSILON) * 100) / 100,
    transactionCount: txCount,
  };
}

/**
 * Standard SQL SELECT with real-time balance aggregation strictly scoped to the account's user
 */
const ACCOUNT_SELECT_SQL = `
  SELECT 
    a.id,
    a.name,
    a.type,
    a.opening_balance,
    a.currency,
    a.note,
    a.is_archived,
    a.created_at,
    a.updated_at,
    ROUND(
      a.opening_balance + COALESCE((
        SELECT SUM(
          CASE 
            WHEN t.type = 'income' AND t.account_id = a.id THEN t.amount
            WHEN t.type = 'expense' AND t.account_id = a.id THEN -t.amount
            WHEN t.type = 'transfer' AND t.account_id = a.id THEN -t.amount
            WHEN t.type = 'transfer' AND t.to_account_id = a.id THEN t.amount
            ELSE 0
          END
        )
        FROM transactions t
        WHERE (t.account_id = a.id OR t.to_account_id = a.id) AND t.user_id = a.user_id
      ), 0),
      2
    ) AS current_balance,
    (
      SELECT COUNT(*)::int
      FROM transactions t
      WHERE (t.account_id = a.id OR t.to_account_id = a.id) AND t.user_id = a.user_id
    ) AS transaction_count
  FROM accounts a
`;

/**
 * GET /api/accounts
 * List all accounts for the authenticated user with calculated current balances.
 * Optional query param: ?includeArchived=true
 */
export async function getAccounts(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = getAuthUserId(req, res);
    if (!userId) return;

    const includeArchived = req.query.includeArchived === "true";

    const query = `
      ${ACCOUNT_SELECT_SQL}
      WHERE a.user_id = $1
        ${includeArchived ? "" : "AND a.is_archived = false"}
      ORDER BY a.created_at DESC;
    `;

    const result = await pool.query<AccountRow>(query, [userId]);
    const accounts = result.rows.map(mapAccountRow);

    res.status(200).json({
      success: true,
      count: accounts.length,
      data: accounts,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/accounts/:id
 * Retrieve a single account by ID, verifying ownership by the authenticated user.
 * Returns safe 404 if the account does not exist or belongs to another user.
 */
export async function getAccountById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = getAuthUserId(req, res);
    if (!userId) return;

    const { id } = req.params;

    if (!isValidUUID(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid account ID format. Expected a valid UUID.",
      });
      return;
    }

    const query = `
      ${ACCOUNT_SELECT_SQL}
      WHERE a.id = $1 AND a.user_id = $2;
    `;

    const result = await pool.query<AccountRow>(query, [id, userId]);

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: `Account with ID '${id}' not found.`,
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: mapAccountRow(result.rows[0]),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/accounts
 * Create a new account for the authenticated user.
 * Disregards any userId supplied in request body; always binds to session userId.
 */
export async function createAccount(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = getAuthUserId(req, res);
    if (!userId) return;

    const { name, type, openingBalance, currency, note }: CreateAccountDTO = req.body;

    // Validate name
    if (!name || typeof name !== "string" || name.trim() === "") {
      res.status(400).json({
        success: false,
        message: "Account name is required.",
      });
      return;
    }

    const trimmedName = name.trim();
    if (trimmedName.length > 100) {
      res.status(400).json({
        success: false,
        message: "Account name must be 100 characters or fewer.",
      });
      return;
    }

    // Validate type
    if (!type || !ALLOWED_ACCOUNT_TYPES.includes(type)) {
      res.status(400).json({
        success: false,
        message: `Invalid account type '${String(type)}'. Allowed types are: ${ALLOWED_ACCOUNT_TYPES.join(", ")}.`,
      });
      return;
    }

    // Validate opening balance
    let cleanBalance = 0;
    if (openingBalance !== undefined) {
      const parsedBalance = typeof openingBalance === "number"
        ? openingBalance
        : parseFloat(String(openingBalance));

      if (!Number.isFinite(parsedBalance)) {
        res.status(400).json({
          success: false,
          message: "Opening balance must be a valid number.",
        });
        return;
      }
      cleanBalance = Math.round((parsedBalance + Number.EPSILON) * 100) / 100;
    }

    // Validate currency
    let cleanCurrency = "USD";
    if (currency !== undefined) {
      if (typeof currency !== "string" || !/^[A-Za-z]{3}$/.test(currency.trim())) {
        res.status(400).json({
          success: false,
          message: "Currency must be a 3-letter currency code (e.g. USD, BDT, EUR).",
        });
        return;
      }
      cleanCurrency = currency.trim().toUpperCase();
    }

    // Validate note
    const cleanNote = note && typeof note === "string" && note.trim() !== ""
      ? note.trim()
      : null;

    const insertQuery = `
      INSERT INTO accounts (user_id, name, type, opening_balance, currency, note)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, name, type, opening_balance, currency, note, is_archived, created_at, updated_at;
    `;

    const insertResult = await pool.query(insertQuery, [
      userId,
      trimmedName,
      type,
      cleanBalance,
      cleanCurrency,
      cleanNote,
    ]);

    const createdRow = insertResult.rows[0];
    const newAccount: AccountResponse = {
      id: createdRow.id,
      name: createdRow.name,
      type: createdRow.type,
      openingBalance: cleanBalance,
      currency: createdRow.currency,
      note: createdRow.note,
      isArchived: createdRow.is_archived,
      createdAt:
        createdRow.created_at instanceof Date
          ? createdRow.created_at.toISOString().split("T")[0]
          : String(createdRow.created_at).split("T")[0],
      updatedAt:
        createdRow.updated_at instanceof Date
          ? createdRow.updated_at.toISOString()
          : String(createdRow.updated_at),
      currentBalance: cleanBalance,
      transactionCount: 0,
    };

    res.status(201).json({
      success: true,
      data: newAccount,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/accounts/:id
 * Update an account's details after verifying ownership by the authenticated user.
 * Returns safe 404 if the account belongs to another user.
 */
export async function updateAccount(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = getAuthUserId(req, res);
    if (!userId) return;

    const { id } = req.params;

    if (!isValidUUID(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid account ID format. Expected a valid UUID.",
      });
      return;
    }

    if (!req.body || typeof req.body !== "object") {
      res.status(400).json({
        success: false,
        message:
          "Request body is required. At least one field (name, type, openingBalance, currency, note, isArchived) must be provided to update.",
      });
      return;
    }

    const {
      name,
      type,
      openingBalance,
      currency,
      note,
      isArchived,
    }: UpdateAccountDTO = req.body;

    if (
      name === undefined &&
      type === undefined &&
      openingBalance === undefined &&
      currency === undefined &&
      note === undefined &&
      isArchived === undefined
    ) {
      res.status(400).json({
        success: false,
        message:
          "At least one field (name, type, openingBalance, currency, note, isArchived) must be provided to update.",
      });
      return;
    }

    // Check existing account owned by this user
    const checkResult = await pool.query(
      `SELECT id FROM accounts WHERE id = $1 AND user_id = $2;`,
      [id, userId]
    );

    if (checkResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: `Account with ID '${id}' not found.`,
      });
      return;
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    // Validate & add name
    if (name !== undefined) {
      if (typeof name !== "string" || name.trim() === "") {
        res.status(400).json({
          success: false,
          message: "Account name cannot be empty.",
        });
        return;
      }
      const trimmedName = name.trim();
      if (trimmedName.length > 100) {
        res.status(400).json({
          success: false,
          message: "Account name must be 100 characters or fewer.",
        });
        return;
      }
      updates.push(`name = $${paramIndex++}`);
      values.push(trimmedName);
    }

    // Validate & add type
    if (type !== undefined) {
      if (!ALLOWED_ACCOUNT_TYPES.includes(type)) {
        res.status(400).json({
          success: false,
          message: `Invalid account type '${String(type)}'. Allowed types are: ${ALLOWED_ACCOUNT_TYPES.join(", ")}.`,
        });
        return;
      }
      updates.push(`type = $${paramIndex++}`);
      values.push(type);
    }

    // Validate & add openingBalance
    if (openingBalance !== undefined) {
      const parsed = typeof openingBalance === "number"
        ? openingBalance
        : parseFloat(String(openingBalance));

      if (!Number.isFinite(parsed)) {
        res.status(400).json({
          success: false,
          message: "Opening balance must be a valid number.",
        });
        return;
      }
      const cleanBalance = Math.round((parsed + Number.EPSILON) * 100) / 100;
      updates.push(`opening_balance = $${paramIndex++}`);
      values.push(cleanBalance);
    }

    // Validate & add currency
    if (currency !== undefined) {
      if (typeof currency !== "string" || !/^[A-Za-z]{3}$/.test(currency.trim())) {
        res.status(400).json({
          success: false,
          message: "Currency must be a 3-letter currency code (e.g. USD, BDT, EUR).",
        });
        return;
      }
      updates.push(`currency = $${paramIndex++}`);
      values.push(currency.trim().toUpperCase());
    }

    // Validate & add note
    if (note !== undefined) {
      const cleanNote = note && typeof note === "string" && note.trim() !== ""
        ? note.trim()
        : null;
      updates.push(`note = $${paramIndex++}`);
      values.push(cleanNote);
    }

    // Validate & add isArchived
    if (isArchived !== undefined) {
      updates.push(`is_archived = $${paramIndex++}`);
      values.push(Boolean(isArchived));
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    values.push(id, userId);
    const updateSql = `
      UPDATE accounts
      SET ${updates.join(", ")}
      WHERE id = $${paramIndex++} AND user_id = $${paramIndex++};
    `;

    await pool.query(updateSql, values);

    // Fetch the updated account with aggregated current balance
    const updatedResult = await pool.query<AccountRow>(
      `
        ${ACCOUNT_SELECT_SQL}
        WHERE a.id = $1 AND a.user_id = $2;
      `,
      [id, userId]
    );

    res.status(200).json({
      success: true,
      data: mapAccountRow(updatedResult.rows[0]),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/accounts/:id
 * Delete an account only if owned by authenticated user and safe (no associated transactions, debts, or repayments).
 * Returns safe 404 if the account belongs to another user.
 */
export async function deleteAccount(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const client = await pool.connect();
  try {
    const userId = getAuthUserId(req, res);
    if (!userId) return;

    const { id } = req.params;

    if (!isValidUUID(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid account ID format. Expected a valid UUID.",
      });
      return;
    }

    await client.query("BEGIN");

    // Check existence and ownership
    const checkResult = await client.query<{ id: string; name: string }>(
      `SELECT id, name FROM accounts WHERE id = $1 AND user_id = $2 FOR UPDATE;`,
      [id, userId]
    );

    if (checkResult.rows.length === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({
        success: false,
        message: `Account with ID '${id}' not found.`,
      });
      return;
    }

    const accountName = checkResult.rows[0].name;

    // Check linked transactions
    const txCheck = await client.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM transactions WHERE account_id = $1 OR to_account_id = $1;`,
      [id]
    );
    const txCount = txCheck.rows[0]?.count ?? 0;

    if (txCount > 0) {
      await client.query("ROLLBACK");
      res.status(409).json({
        success: false,
        message: `Cannot delete account '${accountName}' because it has ${txCount} associated transaction(s). Please delete or reassign associated transactions first, or archive the account instead.`,
      });
      return;
    }

    // Check linked debt records
    const debtCheck = await client.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM debt_records WHERE account_id = $1;`,
      [id]
    );
    const debtCount = debtCheck.rows[0]?.count ?? 0;

    // Check linked debt repayments
    const repaymentCheck = await client.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM debt_repayments WHERE account_id = $1;`,
      [id]
    );
    const repaymentCount = repaymentCheck.rows[0]?.count ?? 0;

    if (debtCount > 0 || repaymentCount > 0) {
      await client.query("ROLLBACK");
      res.status(409).json({
        success: false,
        message: `Cannot delete account '${accountName}' because it has ${debtCount + repaymentCount} associated debt/repayment record(s).`,
      });
      return;
    }

    // Safe to delete
    await client.query(
      `DELETE FROM accounts WHERE id = $1 AND user_id = $2;`,
      [id, userId]
    );

    await client.query("COMMIT");

    res.status(200).json({
      success: true,
      message: `Account '${accountName}' was deleted successfully.`,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
}
