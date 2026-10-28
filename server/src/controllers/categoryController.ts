import { Request, Response, NextFunction } from "express";
import { pool } from "../db";
import {
  CategoryResponse,
  CategoryType,
  CreateCategoryDTO,
  UpdateCategoryDTO,
} from "../types";

export const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001";

const VALID_CATEGORY_TYPES: readonly CategoryType[] = [
  "income",
  "expense",
  "transfer",
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

interface CategoryRow {
  id: string;
  user_id: string | null;
  name: string;
  type: string;
  icon: string | null;
  color: string | null;
  is_system: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

function mapCategoryRow(row: CategoryRow): CategoryResponse {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    type: row.type as CategoryType,
    icon: row.icon,
    color: row.color,
    isSystem: Boolean(row.is_system),
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  };
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

    const result = await pool.query<CategoryRow>(queryText, queryParams);

    res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows.map(mapCategoryRow),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/categories/:id
 * Retrieve a single category by ID.
 * Returns the category if it is a system category (user_id IS NULL)
 * or if it belongs to the authenticated user (user_id = req.user.userId).
 * Returns 404 if the category does not exist or belongs to another user.
 */
export async function getCategoryById(
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

    const query = `
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
      WHERE id = $1 AND (user_id IS NULL OR user_id = $2);
    `;

    const result = await pool.query<CategoryRow>(query, [id, userId]);

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: `Category with ID '${id}' not found.`,
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: mapCategoryRow(result.rows[0]),
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
    if (cleanIcon && cleanIcon.length > 50) {
      res.status(400).json({
        success: false,
        message: "Category icon must be 50 characters or fewer.",
      });
      return;
    }

    const cleanColor = color && typeof color === "string" && color.trim() !== ""
      ? color.trim()
      : null;
    if (cleanColor && cleanColor.length > 20) {
      res.status(400).json({
        success: false,
        message: "Category color must be 20 characters or fewer.",
      });
      return;
    }

    const insertResult = await pool.query<CategoryRow>(
      `
        INSERT INTO categories (user_id, name, type, icon, color, is_system)
        VALUES ($1, $2, $3, $4, $5, FALSE)
        RETURNING id, user_id, name, type, icon, color, is_system, created_at, updated_at;
      `,
      [userId, trimmedName, type, cleanIcon, cleanColor]
    );

    res.status(201).json({
      success: true,
      message: "Category created successfully.",
      data: mapCategoryRow(insertResult.rows[0]),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/categories/:id
 * Update an existing custom category owned by the authenticated user.
 * System categories cannot be modified (returns 403).
 * Returns 404 if the category does not exist or belongs to another user.
 */
export async function updateCategory(
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

    if (!req.body || typeof req.body !== "object") {
      res.status(400).json({
        success: false,
        message: "Request body is required.",
      });
      return;
    }

    // 1. Fetch category and verify ownership
    const checkResult = await pool.query<CategoryRow>(
      `SELECT id, user_id, name, type, icon, color, is_system, created_at, updated_at FROM categories WHERE id = $1;`,
      [id]
    );

    if (checkResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: `Category with ID '${id}' not found.`,
      });
      return;
    }

    const existing = checkResult.rows[0];

    if (existing.is_system) {
      res.status(403).json({
        success: false,
        message: "System categories cannot be modified.",
      });
      return;
    }

    if (existing.user_id !== userId) {
      res.status(404).json({
        success: false,
        message: `Category with ID '${id}' not found.`,
      });
      return;
    }

    const { name, type, icon, color }: UpdateCategoryDTO = req.body;

    if (
      name === undefined &&
      type === undefined &&
      icon === undefined &&
      color === undefined
    ) {
      res.status(400).json({
        success: false,
        message: "At least one field (name, type, icon, color) is required to update.",
      });
      return;
    }

    // Validate name if provided
    let cleanName = existing.name;
    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        res.status(400).json({
          success: false,
          message: "Category name cannot be empty.",
        });
        return;
      }
      cleanName = name.trim();
      if (cleanName.length > 50) {
        res.status(400).json({
          success: false,
          message: "Category name must be 50 characters or fewer.",
        });
        return;
      }
    }

    // Validate type if provided
    let cleanType = existing.type as CategoryType;
    if (type !== undefined) {
      if (typeof type !== "string" || !VALID_CATEGORY_TYPES.includes(type as CategoryType)) {
        res.status(400).json({
          success: false,
          message: `Invalid category type: '${String(type)}'. Allowed values are: ${VALID_CATEGORY_TYPES.join(", ")}.`,
        });
        return;
      }
      cleanType = type as CategoryType;
    }

    // Check duplicate name + type for this user if name or type changed
    if (
      cleanName.toLowerCase() !== existing.name.toLowerCase() ||
      cleanType !== existing.type
    ) {
      const duplicateCheck = await pool.query(
        `SELECT id FROM categories WHERE user_id = $1 AND LOWER(name) = LOWER($2) AND type = $3 AND id <> $4;`,
        [userId, cleanName, cleanType, id]
      );

      if (duplicateCheck.rows.length > 0) {
        res.status(409).json({
          success: false,
          message: `A category named '${cleanName}' of type '${cleanType}' already exists in your account.`,
        });
        return;
      }
    }

    let cleanIcon = existing.icon;
    if (icon !== undefined) {
      cleanIcon = icon && typeof icon === "string" && icon.trim() !== "" ? icon.trim() : null;
      if (cleanIcon && cleanIcon.length > 50) {
        res.status(400).json({
          success: false,
          message: "Category icon must be 50 characters or fewer.",
        });
        return;
      }
    }

    let cleanColor = existing.color;
    if (color !== undefined) {
      cleanColor = color && typeof color === "string" && color.trim() !== "" ? color.trim() : null;
      if (cleanColor && cleanColor.length > 20) {
        res.status(400).json({
          success: false,
          message: "Category color must be 20 characters or fewer.",
        });
        return;
      }
    }

    const updateResult = await pool.query<CategoryRow>(
      `
        UPDATE categories
        SET
          name = $1,
          type = $2,
          icon = $3,
          color = $4,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $5 AND user_id = $6
        RETURNING id, user_id, name, type, icon, color, is_system, created_at, updated_at;
      `,
      [cleanName, cleanType, cleanIcon, cleanColor, id, userId]
    );

    res.status(200).json({
      success: true,
      message: "Category updated successfully.",
      data: mapCategoryRow(updateResult.rows[0]),
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
