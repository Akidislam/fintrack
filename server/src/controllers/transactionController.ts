import { Request, Response, NextFunction } from "express";
import { pool } from "../db";
import {
  TransactionResponse,
  TransactionType,
  CreateTransactionDTO,
  UpdateTransactionDTO,
} from "../types";

export const ALLOWED_TRANSACTION_TYPES: readonly TransactionType[] = [
  "income",
  "expense",
  "transfer",
];

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUUID(id: unknown): id is string {
  return typeof id === "string" && UUID_REGEX.test(id);
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateString(dateStr: unknown): boolean {
  if (typeof dateStr !== "string" || !DATE_REGEX.test(dateStr)) {
    return false;
  }
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  // Ensure real calendar date (prevents e.g. 2026-02-31 turning into 2026-03-03)
  return parsed.toISOString().slice(0, 10) === dateStr;
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

interface TransactionRow {
  id: string;
  user_id: string;
  title: string;
  amount: string | number;
  type: string;
  category_id: string | null;
  category_name: string;
  date: Date | string;
  note: string | null;
  account_id: string | null;
  to_account_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  account_name?: string | null;
  to_account_name?: string | null;
}

function mapTransactionRow(row: TransactionRow): TransactionResponse {
  const parsedAmount =
    typeof row.amount === "number"
      ? row.amount
      : Number.parseFloat(String(row.amount));
  const cleanAmount = Math.round((parsedAmount + Number.EPSILON) * 100) / 100;

  const dateStr =
    row.date instanceof Date
      ? row.date.toISOString().split("T")[0]
      : String(row.date).split("T")[0];

  const createdAtStr =
    row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at);

  const updatedAtStr =
    row.updated_at instanceof Date
      ? row.updated_at.toISOString()
      : String(row.updated_at);

  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    amount: cleanAmount,
    type: row.type as TransactionType,
    categoryId: row.category_id ?? null,
    category: row.category_name,
    categoryName: row.category_name,
    date: dateStr,
    note: row.note ?? null,
    accountId: row.account_id ?? null,
    toAccountId: row.to_account_id ?? null,
    accountName: row.account_name ?? null,
    toAccountName: row.to_account_name ?? null,
    createdAt: createdAtStr,
    updatedAt: updatedAtStr,
  };
}

const TRANSACTION_SELECT_SQL = `
  SELECT
    t.id,
    t.user_id,
    t.title,
    t.amount,
    t.type,
    t.category_id,
    t.category_name,
    t.date,
    t.note,
    t.account_id,
    t.to_account_id,
    t.created_at,
    t.updated_at,
    a.name AS account_name,
    ta.name AS to_account_name
  FROM transactions t
  LEFT JOIN accounts a ON a.id = t.account_id AND a.user_id = t.user_id
  LEFT JOIN accounts ta ON ta.id = t.to_account_id AND ta.user_id = t.user_id
`;

/**
 * Validates whether an account exists and is owned by the authenticated user
 */
async function verifyUserAccount(
  accountId: string,
  userId: string
): Promise<{ exists: boolean; name: string; isArchived: boolean }> {
  const result = await pool.query<{ name: string; is_archived: boolean }>(
    `SELECT name, is_archived FROM accounts WHERE id = $1 AND user_id = $2;`,
    [accountId, userId]
  );
  if (result.rows.length === 0) {
    return { exists: false, name: "", isArchived: false };
  }
  return {
    exists: true,
    name: result.rows[0].name,
    isArchived: Boolean(result.rows[0].is_archived),
  };
}

/**
 * Resolves category_id and category_name safely based on categoryId and/or categoryName input
 */
async function resolveCategory(
  type: TransactionType,
  categoryInput: string | undefined,
  categoryIdInput: string | null | undefined,
  userId: string
): Promise<{ categoryId: string | null; categoryName: string }> {
  // If type is transfer, category defaults to 'Transfer'
  if (type === "transfer") {
    const catName = categoryInput && categoryInput.trim() ? categoryInput.trim() : "Transfer";
    return { categoryId: null, categoryName: catName };
  }

  // 1. If explicit categoryId provided, verify it belongs to user or is a system category
  if (categoryIdInput) {
    if (!isValidUUID(categoryIdInput)) {
      throw new Error("Invalid category ID format.");
    }
    const catRes = await pool.query<{ id: string; name: string }>(
      `SELECT id, name FROM categories WHERE id = $1 AND (user_id IS NULL OR user_id = $2);`,
      [categoryIdInput, userId]
    );
    if (catRes.rows.length > 0) {
      return {
        categoryId: catRes.rows[0].id,
        categoryName: categoryInput && categoryInput.trim() ? categoryInput.trim() : catRes.rows[0].name,
      };
    }
    throw new Error("Category not found or access denied.");
  }

  // 2. If category name string provided, lookup matching category in system or user categories
  const trimmedName = categoryInput ? categoryInput.trim() : "";
  if (!trimmedName) {
    throw new Error("Category name is required.");
  }

  const lookupRes = await pool.query<{ id: string; name: string }>(
    `SELECT id, name FROM categories WHERE LOWER(name) = LOWER($1) AND (user_id IS NULL OR user_id = $2) LIMIT 1;`,
    [trimmedName, userId]
  );

  if (lookupRes.rows.length > 0) {
    return {
      categoryId: lookupRes.rows[0].id,
      categoryName: lookupRes.rows[0].name,
    };
  }

  // Custom or non-listed category name
  return {
    categoryId: null,
    categoryName: trimmedName,
  };
}

/**
 * Helper to validate transfer source and destination accounts
 */
async function validateAccounts(
  type: TransactionType,
  accountId: string | null | undefined,
  toAccountId: string | null | undefined,
  userId: string
): Promise<string | null> {
  if (type === "transfer") {
    if (!accountId) {
      return "Source account (accountId) is required for transfers.";
    }
    if (!toAccountId) {
      return "Destination account (toAccountId) is required for transfers.";
    }
    if (!isValidUUID(accountId)) {
      return "Invalid source account ID format.";
    }
    if (!isValidUUID(toAccountId)) {
      return "Invalid destination account ID format.";
    }
    if (accountId === toAccountId) {
      return "Source and destination accounts must be different for transfers.";
    }

    const [fromAcct, toAcct] = await Promise.all([
      verifyUserAccount(accountId, userId),
      verifyUserAccount(toAccountId, userId),
    ]);

    if (!fromAcct.exists) {
      return "Source account not found or access denied.";
    }
    if (!toAcct.exists) {
      return "Destination account not found or access denied.";
    }
  } else {
    // Non-transfer: toAccountId must be null
    if (toAccountId) {
      return "Destination account (toAccountId) can only be specified for transfers.";
    }
    // If accountId is provided, verify it belongs to user
    if (accountId) {
      if (!isValidUUID(accountId)) {
        return "Invalid account ID format.";
      }
      const acct = await verifyUserAccount(accountId, userId);
      if (!acct.exists) {
        return "Account not found or access denied.";
      }
    }
  }

  return null;
}

/**
 * GET /api/transactions
 * List all transactions for authenticated user with optional filtering
 */
export async function getTransactions(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = getAuthUserId(req, res);
    if (!userId) return;

    const {
      type,
      accountId,
      category,
      startDate,
      endDate,
      search,
      limit,
      offset,
    } = req.query;

    const conditions: string[] = ["t.user_id = $1"];
    const params: unknown[] = [userId];
    let paramIndex = 2;

    if (type !== undefined) {
      if (
        typeof type !== "string" ||
        !ALLOWED_TRANSACTION_TYPES.includes(type as TransactionType)
      ) {
        res.status(400).json({
          success: false,
          message: `Invalid transaction type: '${String(type)}'. Allowed: ${ALLOWED_TRANSACTION_TYPES.join(", ")}.`,
        });
        return;
      }
      conditions.push(`t.type = $${paramIndex++}`);
      params.push(type);
    }

    if (accountId !== undefined) {
      if (!isValidUUID(accountId)) {
        res.status(400).json({
          success: false,
          message: "Invalid accountId query parameter.",
        });
        return;
      }
      conditions.push(`(t.account_id = $${paramIndex} OR t.to_account_id = $${paramIndex})`);
      params.push(accountId);
      paramIndex++;
    }

    if (category !== undefined && typeof category === "string" && category.trim()) {
      conditions.push(`LOWER(t.category_name) = LOWER($${paramIndex++})`);
      params.push(category.trim());
    }

    if (startDate !== undefined) {
      if (!isValidDateString(startDate)) {
        res.status(400).json({
          success: false,
          message: "Invalid startDate query parameter. Expected YYYY-MM-DD.",
        });
        return;
      }
      conditions.push(`t.date >= $${paramIndex++}`);
      params.push(startDate);
    }

    if (endDate !== undefined) {
      if (!isValidDateString(endDate)) {
        res.status(400).json({
          success: false,
          message: "Invalid endDate query parameter. Expected YYYY-MM-DD.",
        });
        return;
      }
      conditions.push(`t.date <= $${paramIndex++}`);
      params.push(endDate);
    }

    if (search !== undefined && typeof search === "string" && search.trim()) {
      conditions.push(
        `(t.title ILIKE $${paramIndex} OR t.note ILIKE $${paramIndex} OR t.category_name ILIKE $${paramIndex})`
      );
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    let limitClause = "";
    if (limit !== undefined) {
      const parsedLimit = Number.parseInt(String(limit), 10);
      if (Number.isNaN(parsedLimit) || parsedLimit <= 0) {
        res.status(400).json({
          success: false,
          message: "Query parameter 'limit' must be a positive integer.",
        });
        return;
      }
      const safeLimit = Math.min(parsedLimit, 500);
      limitClause += ` LIMIT ${safeLimit}`;
    }

    let offsetClause = "";
    if (offset !== undefined) {
      const parsedOffset = Number.parseInt(String(offset), 10);
      if (Number.isNaN(parsedOffset) || parsedOffset < 0) {
        res.status(400).json({
          success: false,
          message: "Query parameter 'offset' must be a non-negative integer.",
        });
        return;
      }
      offsetClause += ` OFFSET ${parsedOffset}`;
    }

    const query = `
      ${TRANSACTION_SELECT_SQL}
      WHERE ${conditions.join(" AND ")}
      ORDER BY t.date DESC, t.created_at DESC
      ${limitClause}
      ${offsetClause};
    `;

    const result = await pool.query<TransactionRow>(query, params);

    res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows.map(mapTransactionRow),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/transactions/:id
 * Retrieve a single transaction by ID owned by the authenticated user
 */
export async function getTransactionById(
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
        message: "Invalid transaction ID format.",
      });
      return;
    }

    const query = `
      ${TRANSACTION_SELECT_SQL}
      WHERE t.id = $1 AND t.user_id = $2;
    `;

    const result = await pool.query<TransactionRow>(query, [id, userId]);

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: "Transaction not found.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: mapTransactionRow(result.rows[0]),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/transactions
 * Create a new transaction strictly scoped to the authenticated user
 */
export async function createTransaction(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = getAuthUserId(req, res);
    if (!userId) return;

    const body: CreateTransactionDTO = req.body;
    if (!body || typeof body !== "object") {
      res.status(400).json({
        success: false,
        message: "Request body is required.",
      });
      return;
    }

    const {
      title,
      amount,
      type,
      category,
      categoryName,
      categoryId,
      date,
      note,
      accountId,
      toAccountId,
    } = body;

    // 1. Validate Title
    if (typeof title !== "string" || title.trim() === "") {
      res.status(400).json({
        success: false,
        message: "Transaction title is required.",
      });
      return;
    }
    const cleanTitle = title.trim();
    if (cleanTitle.length > 200) {
      res.status(400).json({
        success: false,
        message: "Transaction title must be 200 characters or fewer.",
      });
      return;
    }

    // 2. Validate Amount
    const parsedAmount =
      typeof amount === "number" ? amount : Number.parseFloat(String(amount));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      res.status(400).json({
        success: false,
        message: "Transaction amount must be a positive number greater than 0.",
      });
      return;
    }
    const cleanAmount = Math.round((parsedAmount + Number.EPSILON) * 100) / 100;
    if (cleanAmount <= 0) {
      res.status(400).json({
        success: false,
        message: "Transaction amount rounded to 0. Must be at least 0.01.",
      });
      return;
    }

    // 3. Validate Type
    if (
      typeof type !== "string" ||
      !ALLOWED_TRANSACTION_TYPES.includes(type as TransactionType)
    ) {
      res.status(400).json({
        success: false,
        message: `Invalid transaction type. Allowed: ${ALLOWED_TRANSACTION_TYPES.join(", ")}.`,
      });
      return;
    }

    // 4. Validate Date
    if (!isValidDateString(date)) {
      res.status(400).json({
        success: false,
        message: "Transaction date is invalid or missing. Expected YYYY-MM-DD.",
      });
      return;
    }

    // 5. Validate Account ownership
    const acctError = await validateAccounts(type, accountId, toAccountId, userId);
    if (acctError) {
      res.status(400).json({
        success: false,
        message: acctError,
      });
      return;
    }

    // 6. Resolve Category
    const rawCategory = categoryName || category;
    let resolvedCat: { categoryId: string | null; categoryName: string };
    try {
      resolvedCat = await resolveCategory(type, rawCategory, categoryId, userId);
    } catch (catErr) {
      res.status(400).json({
        success: false,
        message: (catErr as Error).message,
      });
      return;
    }

    const cleanNote = note && typeof note === "string" && note.trim() !== "" ? note.trim() : null;

    // 7. Insert Transaction
    const insertSql = `
      INSERT INTO transactions (
        user_id,
        title,
        amount,
        type,
        category_id,
        category_name,
        date,
        note,
        account_id,
        to_account_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id;
    `;

    const insertResult = await pool.query<{ id: string }>(insertSql, [
      userId,
      cleanTitle,
      cleanAmount,
      type,
      resolvedCat.categoryId,
      resolvedCat.categoryName,
      date,
      cleanNote,
      accountId || null,
      type === "transfer" ? toAccountId || null : null,
    ]);

    const newId = insertResult.rows[0].id;

    // 8. Fetch complete inserted row with account names
    const fetchSql = `
      ${TRANSACTION_SELECT_SQL}
      WHERE t.id = $1 AND t.user_id = $2;
    `;
    const fetchResult = await pool.query<TransactionRow>(fetchSql, [newId, userId]);

    res.status(201).json({
      success: true,
      message: "Transaction created successfully.",
      data: mapTransactionRow(fetchResult.rows[0]),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/transactions/:id
 * Update an existing transaction owned by the authenticated user
 */
export async function updateTransaction(
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
        message: "Invalid transaction ID format.",
      });
      return;
    }

    const body: UpdateTransactionDTO = req.body;
    if (!body || typeof body !== "object") {
      res.status(400).json({
        success: false,
        message: "Request body is required.",
      });
      return;
    }

    // 1. Verify transaction exists and belongs to user
    const existingResult = await pool.query<TransactionRow>(
      `SELECT * FROM transactions WHERE id = $1 AND user_id = $2;`,
      [id, userId]
    );

    if (existingResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: "Transaction not found.",
      });
      return;
    }

    const existing = existingResult.rows[0];

    // 2. Validate Title if provided
    let cleanTitle = existing.title;
    if (body.title !== undefined) {
      if (typeof body.title !== "string" || body.title.trim() === "") {
        res.status(400).json({
          success: false,
          message: "Transaction title cannot be empty.",
        });
        return;
      }
      cleanTitle = body.title.trim();
      if (cleanTitle.length > 200) {
        res.status(400).json({
          success: false,
          message: "Transaction title must be 200 characters or fewer.",
        });
        return;
      }
    }

    // 3. Validate Amount if provided
    let cleanAmount =
      typeof existing.amount === "number"
        ? existing.amount
        : Number.parseFloat(String(existing.amount));
    if (body.amount !== undefined) {
      const parsedAmount =
        typeof body.amount === "number"
          ? body.amount
          : Number.parseFloat(String(body.amount));
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        res.status(400).json({
          success: false,
          message: "Transaction amount must be a positive number greater than 0.",
        });
        return;
      }
      cleanAmount = Math.round((parsedAmount + Number.EPSILON) * 100) / 100;
      if (cleanAmount <= 0) {
        res.status(400).json({
          success: false,
          message: "Transaction amount rounded to 0. Must be at least 0.01.",
        });
        return;
      }
    }

    // 4. Validate Type if provided
    let cleanType = existing.type as TransactionType;
    if (body.type !== undefined) {
      if (
        typeof body.type !== "string" ||
        !ALLOWED_TRANSACTION_TYPES.includes(body.type as TransactionType)
      ) {
        res.status(400).json({
          success: false,
          message: `Invalid transaction type. Allowed: ${ALLOWED_TRANSACTION_TYPES.join(", ")}.`,
        });
        return;
      }
      cleanType = body.type as TransactionType;
    }

    // 5. Validate Date if provided
    let cleanDate =
      existing.date instanceof Date
        ? existing.date.toISOString().split("T")[0]
        : String(existing.date).split("T")[0];
    if (body.date !== undefined) {
      if (!isValidDateString(body.date)) {
        res.status(400).json({
          success: false,
          message: "Transaction date is invalid. Expected YYYY-MM-DD.",
        });
        return;
      }
      cleanDate = body.date;
    }

    // 6. Effective Accounts
    const effectiveAccountId =
      body.accountId !== undefined ? body.accountId || null : existing.account_id;
    const effectiveToAccountId =
      cleanType === "transfer"
        ? body.toAccountId !== undefined
          ? body.toAccountId || null
          : existing.to_account_id
        : null;

    const acctError = await validateAccounts(
      cleanType,
      effectiveAccountId,
      effectiveToAccountId,
      userId
    );
    if (acctError) {
      res.status(400).json({
        success: false,
        message: acctError,
      });
      return;
    }

    // 7. Resolve Category if updated
    const rawCategory =
      body.categoryName !== undefined
        ? body.categoryName
        : body.category !== undefined
        ? body.category
        : existing.category_name;
    const effectiveCategoryId =
      body.categoryId !== undefined ? body.categoryId : existing.category_id;

    let resolvedCat: { categoryId: string | null; categoryName: string };
    try {
      resolvedCat = await resolveCategory(
        cleanType,
        rawCategory,
        effectiveCategoryId,
        userId
      );
    } catch (catErr) {
      res.status(400).json({
        success: false,
        message: (catErr as Error).message,
      });
      return;
    }

    // 8. Note
    let cleanNote: string | null = existing.note;
    if (body.note !== undefined) {
      cleanNote =
        body.note && typeof body.note === "string" && body.note.trim() !== ""
          ? body.note.trim()
          : null;
    }

    // 9. Execute Parameterized Update
    const updateSql = `
      UPDATE transactions
      SET
        title = $1,
        amount = $2,
        type = $3,
        category_id = $4,
        category_name = $5,
        date = $6,
        note = $7,
        account_id = $8,
        to_account_id = $9,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $10 AND user_id = $11;
    `;

    await pool.query(updateSql, [
      cleanTitle,
      cleanAmount,
      cleanType,
      resolvedCat.categoryId,
      resolvedCat.categoryName,
      cleanDate,
      cleanNote,
      effectiveAccountId,
      effectiveToAccountId,
      id,
      userId,
    ]);

    // 10. Fetch and return updated transaction
    const fetchSql = `
      ${TRANSACTION_SELECT_SQL}
      WHERE t.id = $1 AND t.user_id = $2;
    `;
    const fetchResult = await pool.query<TransactionRow>(fetchSql, [id, userId]);

    res.status(200).json({
      success: true,
      message: "Transaction updated successfully.",
      data: mapTransactionRow(fetchResult.rows[0]),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/transactions/:id
 * Delete an existing transaction owned by the authenticated user
 */
export async function deleteTransaction(
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
        message: "Invalid transaction ID format.",
      });
      return;
    }

    const deleteSql = `
      DELETE FROM transactions
      WHERE id = $1 AND user_id = $2
      RETURNING id, title;
    `;

    const result = await pool.query<{ id: string; title: string }>(deleteSql, [
      id,
      userId,
    ]);

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: "Transaction not found.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: `Transaction '${result.rows[0].title}' deleted successfully.`,
    });
  } catch (error) {
    next(error);
  }
}
