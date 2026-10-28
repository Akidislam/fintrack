import { Request, Response, NextFunction } from "express";
import { pool } from "../db";
import {
  BudgetResponse,
  CreateBudgetDTO,
  UpdateBudgetDTO,
} from "../types";

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

interface BudgetRow {
  id: string;
  user_id: string;
  category_id: string | null;
  category_name: string;
  monthly_limit: string | number;
  created_at: Date | string;
  updated_at: Date | string;
  category_icon?: string | null;
  category_color?: string | null;
  current_spent?: string | number | null;
}

function mapBudgetRow(row: BudgetRow): BudgetResponse {
  const limit =
    typeof row.monthly_limit === "number"
      ? row.monthly_limit
      : Number.parseFloat(String(row.monthly_limit));
  const cleanLimit = Math.round((limit + Number.EPSILON) * 100) / 100;

  const createdAtStr =
    row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at);

  const updatedAtStr =
    row.updated_at instanceof Date
      ? row.updated_at.toISOString()
      : String(row.updated_at);

  let currentSpent: number | undefined;
  if (row.current_spent !== undefined && row.current_spent !== null) {
    const spent =
      typeof row.current_spent === "number"
        ? row.current_spent
        : Number.parseFloat(String(row.current_spent));
    currentSpent = Math.round((spent + Number.EPSILON) * 100) / 100;
  }

  return {
    id: row.id,
    userId: row.user_id,
    categoryId: row.category_id ?? null,
    category: row.category_name,
    categoryName: row.category_name,
    monthlyLimit: cleanLimit,
    ...(currentSpent !== undefined ? { currentSpent } : {}),
    categoryIcon: row.category_icon ?? null,
    categoryColor: row.category_color ?? null,
    createdAt: createdAtStr,
    updatedAt: updatedAtStr,
  };
}

const BUDGET_SELECT_SQL = `
  SELECT
    b.id,
    b.user_id,
    b.category_id,
    b.category_name,
    b.monthly_limit,
    b.created_at,
    b.updated_at,
    c.icon AS category_icon,
    c.color AS category_color,
    COALESCE((
      SELECT SUM(t.amount)
      FROM transactions t
      WHERE t.user_id = b.user_id
        AND t.type = 'expense'
        AND (
          (b.category_id IS NOT NULL AND t.category_id = b.category_id)
          OR LOWER(t.category_name) = LOWER(b.category_name)
        )
        AND t.date >= DATE_TRUNC('month', CURRENT_DATE)::date
        AND t.date < (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month')::date
    ), 0)::numeric AS current_spent
  FROM budgets b
  LEFT JOIN categories c ON c.id = b.category_id
`;

/**
 * Resolves category_id and category_name safely based on categoryId and/or categoryName input
 */
async function resolveBudgetCategory(
  categoryInput: string | undefined,
  categoryIdInput: string | null | undefined,
  userId: string
): Promise<{ categoryId: string | null; categoryName: string }> {
  // 1. If explicit categoryId provided, verify it exists and is accessible by user
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

  return {
    categoryId: null,
    categoryName: trimmedName,
  };
}

/**
 * GET /api/budgets
 * Retrieve all budgets owned by the authenticated user with real-time current month spending
 */
export async function getBudgets(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = getAuthUserId(req, res);
    if (!userId) return;

    const { category } = req.query;
    const conditions: string[] = ["b.user_id = $1"];
    const params: unknown[] = [userId];

    if (category !== undefined && typeof category === "string" && category.trim()) {
      conditions.push("LOWER(b.category_name) = LOWER($2)");
      params.push(category.trim());
    }

    const query = `
      ${BUDGET_SELECT_SQL}
      WHERE ${conditions.join(" AND ")}
      ORDER BY b.category_name ASC;
    `;

    const result = await pool.query<BudgetRow>(query, params);

    res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows.map(mapBudgetRow),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/budgets/:id
 * Retrieve a single budget by ID owned by the authenticated user
 */
export async function getBudgetById(
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
        message: "Invalid budget ID format.",
      });
      return;
    }

    const query = `
      ${BUDGET_SELECT_SQL}
      WHERE b.id = $1 AND b.user_id = $2;
    `;

    const result = await pool.query<BudgetRow>(query, [id, userId]);

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: "Budget not found.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: mapBudgetRow(result.rows[0]),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/budgets
 * Create a new category budget for the authenticated user
 */
export async function createBudget(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = getAuthUserId(req, res);
    if (!userId) return;

    const body: CreateBudgetDTO = req.body;
    if (!body || typeof body !== "object") {
      res.status(400).json({
        success: false,
        message: "Request body is required.",
      });
      return;
    }

    // 1. Validate Category Name
    const rawCategory =
      body.categoryName !== undefined
        ? body.categoryName
        : body.category !== undefined
        ? body.category
        : "";

    if (typeof rawCategory !== "string" || !rawCategory.trim()) {
      res.status(400).json({
        success: false,
        message: "Category name is required.",
      });
      return;
    }

    const cleanCategoryName = rawCategory.trim();
    if (cleanCategoryName.length > 50) {
      res.status(400).json({
        success: false,
        message: "Category name must be 50 characters or fewer.",
      });
      return;
    }

    // 2. Validate Monthly Limit
    if (
      body.monthlyLimit === undefined ||
      body.monthlyLimit === null ||
      typeof body.monthlyLimit !== "number" ||
      !Number.isFinite(body.monthlyLimit)
    ) {
      res.status(400).json({
        success: false,
        message: "A valid numeric monthlyLimit is required.",
      });
      return;
    }

    if (body.monthlyLimit < 0) {
      res.status(400).json({
        success: false,
        message: "Monthly limit must be a non-negative number.",
      });
      return;
    }

    const cleanLimit = Math.round((body.monthlyLimit + Number.EPSILON) * 100) / 100;

    // 3. Resolve Category
    let resolvedCat: { categoryId: string | null; categoryName: string };
    try {
      resolvedCat = await resolveBudgetCategory(
        cleanCategoryName,
        body.categoryId,
        userId
      );
    } catch (catErr) {
      res.status(400).json({
        success: false,
        message: catErr instanceof Error ? catErr.message : "Invalid category.",
      });
      return;
    }

    // 4. Check Duplicate Budget for user
    const duplicateCheck = await pool.query<{ id: string }>(
      `SELECT id FROM budgets WHERE user_id = $1 AND LOWER(category_name) = LOWER($2);`,
      [userId, resolvedCat.categoryName]
    );

    if (duplicateCheck.rows.length > 0) {
      res.status(409).json({
        success: false,
        message: `A budget for category '${resolvedCat.categoryName}' already exists.`,
      });
      return;
    }

    // 5. Insert Budget
    const insertSql = `
      INSERT INTO budgets (
        user_id,
        category_id,
        category_name,
        monthly_limit
      ) VALUES ($1, $2, $3, $4)
      RETURNING id;
    `;

    const insertResult = await pool.query<{ id: string }>(insertSql, [
      userId,
      resolvedCat.categoryId,
      resolvedCat.categoryName,
      cleanLimit,
    ]);

    const createdId = insertResult.rows[0].id;

    // 6. Fetch full budget record
    const fetchQuery = `
      ${BUDGET_SELECT_SQL}
      WHERE b.id = $1 AND b.user_id = $2;
    `;
    const fetchResult = await pool.query<BudgetRow>(fetchQuery, [createdId, userId]);

    res.status(201).json({
      success: true,
      message: "Budget created successfully.",
      data: mapBudgetRow(fetchResult.rows[0]),
    });
  } catch (error) {
    // Catch unique constraint violation error if concurrent requests occur
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      res.status(409).json({
        success: false,
        message: "A budget for this category already exists.",
      });
      return;
    }
    next(error);
  }
}

/**
 * PUT /api/budgets/:id
 * Update an existing budget owned by the authenticated user
 */
export async function updateBudget(
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
        message: "Invalid budget ID format.",
      });
      return;
    }

    const body: UpdateBudgetDTO = req.body;
    if (!body || typeof body !== "object") {
      res.status(400).json({
        success: false,
        message: "Request body is required.",
      });
      return;
    }

    // 1. Verify budget exists and belongs to authenticated user
    const existingResult = await pool.query<BudgetRow>(
      `SELECT * FROM budgets WHERE id = $1 AND user_id = $2;`,
      [id, userId]
    );

    if (existingResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: "Budget not found.",
      });
      return;
    }

    const existing = existingResult.rows[0];

    // 2. Validate fields
    const hasCategoryUpdate =
      body.categoryName !== undefined ||
      body.category !== undefined ||
      body.categoryId !== undefined;
    const hasLimitUpdate = body.monthlyLimit !== undefined;

    if (!hasCategoryUpdate && !hasLimitUpdate) {
      res.status(400).json({
        success: false,
        message:
          "At least one field (monthlyLimit, category, categoryName, categoryId) is required to update.",
      });
      return;
    }

    let cleanLimit =
      typeof existing.monthly_limit === "number"
        ? existing.monthly_limit
        : Number.parseFloat(String(existing.monthly_limit));

    if (hasLimitUpdate) {
      if (
        body.monthlyLimit === null ||
        typeof body.monthlyLimit !== "number" ||
        !Number.isFinite(body.monthlyLimit)
      ) {
        res.status(400).json({
          success: false,
          message: "Monthly limit must be a valid number.",
        });
        return;
      }
      if (body.monthlyLimit < 0) {
        res.status(400).json({
          success: false,
          message: "Monthly limit must be a non-negative number.",
        });
        return;
      }
      cleanLimit = Math.round((body.monthlyLimit + Number.EPSILON) * 100) / 100;
    }

    let effectiveCategoryId = existing.category_id;
    let effectiveCategoryName = existing.category_name;

    if (hasCategoryUpdate) {
      const rawCategory =
        body.categoryName !== undefined
          ? body.categoryName
          : body.category !== undefined
          ? body.category
          : existing.category_name;

      if (typeof rawCategory !== "string" || !rawCategory.trim()) {
        res.status(400).json({
          success: false,
          message: "Category name cannot be empty.",
        });
        return;
      }

      const cleanCatName = rawCategory.trim();
      if (cleanCatName.length > 50) {
        res.status(400).json({
          success: false,
          message: "Category name must be 50 characters or fewer.",
        });
        return;
      }

      const inputCategoryId =
        body.categoryId !== undefined ? body.categoryId : existing.category_id;

      try {
        const resolved = await resolveBudgetCategory(
          cleanCatName,
          inputCategoryId,
          userId
        );
        effectiveCategoryId = resolved.categoryId;
        effectiveCategoryName = resolved.categoryName;
      } catch (catErr) {
        res.status(400).json({
          success: false,
          message: catErr instanceof Error ? catErr.message : "Invalid category.",
        });
        return;
      }

      // Check duplicate
      const duplicateCheck = await pool.query<{ id: string }>(
        `SELECT id FROM budgets WHERE user_id = $1 AND LOWER(category_name) = LOWER($2) AND id <> $3;`,
        [userId, effectiveCategoryName, id]
      );

      if (duplicateCheck.rows.length > 0) {
        res.status(409).json({
          success: false,
          message: `A budget for category '${effectiveCategoryName}' already exists.`,
        });
        return;
      }
    }

    // 3. Execute Update
    const updateSql = `
      UPDATE budgets
      SET
        category_id = $1,
        category_name = $2,
        monthly_limit = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $4 AND user_id = $5;
    `;

    await pool.query(updateSql, [
      effectiveCategoryId,
      effectiveCategoryName,
      cleanLimit,
      id,
      userId,
    ]);

    // 4. Fetch updated budget
    const fetchSql = `
      ${BUDGET_SELECT_SQL}
      WHERE b.id = $1 AND b.user_id = $2;
    `;
    const fetchResult = await pool.query<BudgetRow>(fetchSql, [id, userId]);

    res.status(200).json({
      success: true,
      message: "Budget updated successfully.",
      data: mapBudgetRow(fetchResult.rows[0]),
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      res.status(409).json({
        success: false,
        message: "A budget for this category already exists.",
      });
      return;
    }
    next(error);
  }
}

/**
 * DELETE /api/budgets/:id
 * Delete an existing budget owned by the authenticated user
 */
export async function deleteBudget(
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
        message: "Invalid budget ID format.",
      });
      return;
    }

    const deleteSql = `
      DELETE FROM budgets
      WHERE id = $1 AND user_id = $2
      RETURNING id, category_name;
    `;

    const result = await pool.query<{ id: string; category_name: string }>(
      deleteSql,
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: "Budget not found.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: `Budget for '${result.rows[0].category_name}' deleted successfully.`,
    });
  } catch (error) {
    next(error);
  }
}
