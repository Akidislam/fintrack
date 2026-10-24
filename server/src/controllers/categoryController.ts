import { Request, Response, NextFunction } from "express";
import { pool } from "../db";
import { CategoryResponse, CategoryType, CreateCategoryDTO } from "../types";

export const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001";

const VALID_CATEGORY_TYPES: readonly CategoryType[] = [
  "income",
  "expense",
  "transfer",
];

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUUID(id: unknown): id is string {
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

/**
 * GET /api/categories
 * Returns list of categories (system categories + authenticated user's custom categories).
 * Never exposes other users' custom categories.
 * Optional query parameter: ?type=income|expense|transfer
 */
export async function getCategories(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = getAuthUserId(req, res);
    if (!userId) return;

    const { type } = req.query;

    if (type !== undefined) {
      if (
        typeof type !== "string" ||
        !VALID_CATEGORY_TYPES.includes(type as CategoryType)
      ) {
        res.status(400).json({
          success: false,
          message: `Invalid category type: '${String(type)}'. Allowed values are: ${VALID_CATEGORY_TYPES.join(", ")}.`,
        });
        return;
      }
    }

    let queryText: string;
    let queryParams: unknown[];

    if (type) {
      queryText = `
        SELECT 
          id,
          user_id,
          name,
          type,
          icon,
          color,
          is_system,
          created_at,
          updated_at
        FROM categories
        WHERE (user_id IS NULL OR user_id = $1)
          AND type = $2
        ORDER BY name ASC;
      `;
      queryParams = [userId, type];
    } else {
      queryText = `
        SELECT 
          id,
          user_id,
          name,
          type,
          icon,
          color,
          is_system,
          created_at,
          updated_at
        FROM categories
        WHERE (user_id IS NULL OR user_id = $1)
        ORDER BY type ASC, name ASC;
      `;
      queryParams = [userId];
    }

    const result = await pool.query(queryText, queryParams);

    const categories: CategoryResponse[] = result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      type: row.type as CategoryType,
      icon: row.icon,
      color: row.color,
      isSystem: row.is_system,
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
      updatedAt:
        row.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : String(row.updated_at),
    }));

    res.status(200).json({
      success: true,
      count: categories.length,
      data: categories,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/categories
 * Create a new custom category for the authenticated user.
 */
export async function createCategory(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = getAuthUserId(req, res);
    if (!userId) return;

    if (!req.body || typeof req.body !== "object") {
      res.status(400).json({
        success: false,
        message: "Request body is required.",
      });
      return;
    }

    const { name, type, icon, color }: CreateCategoryDTO = req.body;

    if (!name || typeof name !== "string" || name.trim() === "") {
      res.status(400).json({
        success: false,
        message: "Category name is required.",
      });
      return;
    }

    const trimmedName = name.trim();
    if (trimmedName.length > 50) {
      res.status(400).json({
        success: false,
        message: "Category name must be 50 characters or fewer.",
      });
      return;
    }

    if (!type || !VALID_CATEGORY_TYPES.includes(type)) {
      res.status(400).json({
        success: false,
        message: `Invalid category type: '${String(type)}'. Allowed values are: ${VALID_CATEGORY_TYPES.join(", ")}.`,
      });
      return;
    }

    // Check duplicate name + type for this user
    const duplicateCheck = await pool.query(
      `SELECT id FROM categories WHERE user_id = $1 AND LOWER(name) = LOWER($2) AND type = $3;`,
      [userId, trimmedName, type]
    );

    if (duplicateCheck.rows.length > 0) {
      res.status(409).json({
        success: false,
        message: `A category named '${trimmedName}' of type '${type}' already exists in your account.`,
      });
      return;
    }

    const cleanIcon = icon && typeof icon === "string" && icon.trim() !== ""
      ? icon.trim()
      : null;
    const cleanColor = color && typeof color === "string" && color.trim() !== ""
      ? color.trim()
      : null;

    const insertResult = await pool.query(
      `
        INSERT INTO categories (user_id, name, type, icon, color, is_system)
        VALUES ($1, $2, $3, $4, $5, FALSE)
        RETURNING id, user_id, name, type, icon, color, is_system, created_at, updated_at;
      `,
      [userId, trimmedName, type, cleanIcon, cleanColor]
    );

    const row = insertResult.rows[0];
    const created: CategoryResponse = {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      type: row.type as CategoryType,
      icon: row.icon,
      color: row.color,
      isSystem: row.is_system,
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
      updatedAt:
        row.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : String(row.updated_at),
    };

    res.status(201).json({
      success: true,
      data: created,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/categories/:id
 * Delete a custom category belonging to the authenticated user.
 * System categories and categories owned by other users cannot be deleted.
 */
export async function deleteCategory(
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
        message: "Invalid category ID format. Expected a valid UUID.",
      });
      return;
    }

    const checkResult = await pool.query<{ id: string; name: string; user_id: string | null; is_system: boolean }>(
      `SELECT id, name, user_id, is_system FROM categories WHERE id = $1;`,
      [id]
    );

    if (checkResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: `Category with ID '${id}' not found.`,
      });
      return;
    }

    const category = checkResult.rows[0];

    if (category.is_system) {
      res.status(403).json({
        success: false,
        message: "System categories cannot be deleted.",
      });
      return;
    }

    // Return safe 404 if category belongs to another user
    if (category.user_id !== userId) {
      res.status(404).json({
        success: false,
        message: `Category with ID '${id}' not found.`,
      });
      return;
    }

    // Check if linked to transactions
    const txCheck = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM transactions WHERE category_id = $1;`,
      [id]
    );
    if ((txCheck.rows[0]?.count ?? 0) > 0) {
      res.status(409).json({
        success: false,
        message: `Cannot delete category '${category.name}' because it has associated transactions.`,
      });
      return;
    }

    // Check if linked to budgets
    const budgetCheck = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM budgets WHERE category_id = $1;`,
      [id]
    );
    if ((budgetCheck.rows[0]?.count ?? 0) > 0) {
      res.status(409).json({
        success: false,
        message: `Cannot delete category '${category.name}' because it has associated budgets.`,
      });
      return;
    }

    await pool.query(
      `DELETE FROM categories WHERE id = $1 AND user_id = $2;`,
      [id, userId]
    );

    res.status(200).json({
      success: true,
      message: `Category '${category.name}' was deleted successfully.`,
    });
  } catch (error) {
    next(error);
  }
}
