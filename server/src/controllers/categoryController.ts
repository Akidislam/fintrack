import { Request, Response, NextFunction } from "express";
import { pool } from "../db";
import { CategoryResponse, CategoryType } from "../types";

export const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001";

const VALID_CATEGORY_TYPES: readonly CategoryType[] = [
  "income",
  "expense",
  "transfer",
];

/**
 * GET /api/categories
 * Returns list of categories (system categories + user-custom categories).
 * Optional query parameter: ?type=income|expense|transfer
 */
export async function getCategories(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
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
      queryParams = [DEFAULT_USER_ID, type];
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
      queryParams = [DEFAULT_USER_ID];
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
