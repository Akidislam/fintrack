import { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import { pool } from "../db";
import { RegisterDTO, LoginDTO, UserResponse } from "../types";
import { signToken, setAuthCookie, clearAuthCookie } from "../utils/token";

const EMAIL_REGEX = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
const BCRYPT_SALT_ROUNDS = 12;

interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string | null;
  currency: string;
  created_at: Date | string;
  updated_at: Date | string;
}

function mapUserResponse(row: UserRow): UserResponse {
  const createdAtStr =
    row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at);

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    currency: row.currency,
    createdAt: createdAtStr,
  };
}

/**
 * POST /api/auth/register
 * Register a new user account. Hashes password with bcrypt and sets HttpOnly cookie.
 */
export async function register(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.body || typeof req.body !== "object") {
      res.status(400).json({
        success: false,
        message: "Request body is required.",
      });
      return;
    }

    const { name, email, password, currency }: RegisterDTO = req.body;

    // 1. Validate Name
    if (!name || typeof name !== "string" || name.trim() === "") {
      res.status(400).json({
        success: false,
        message: "Name is required.",
      });
      return;
    }
    const cleanName = name.trim();
    if (cleanName.length > 100) {
      res.status(400).json({
        success: false,
        message: "Name must be 100 characters or fewer.",
      });
      return;
    }

    // 2. Validate Email
    if (!email || typeof email !== "string" || !EMAIL_REGEX.test(email.trim())) {
      res.status(400).json({
        success: false,
        message: "A valid email address is required.",
      });
      return;
    }
    const cleanEmail = email.trim().toLowerCase();

    // 3. Validate Password
    if (!password || typeof password !== "string" || password.length < 8) {
      res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long.",
      });
      return;
    }
    if (password.length > 128) {
      res.status(400).json({
        success: false,
        message: "Password must not exceed 128 characters.",
      });
      return;
    }

    // 4. Validate Currency (optional, defaults to USD)
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

    // 5. Check if email is already registered
    const existingUserResult = await pool.query<{ id: string }>(
      `SELECT id FROM users WHERE LOWER(email) = $1;`,
      [cleanEmail]
    );

    if (existingUserResult.rows.length > 0) {
      res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
      return;
    }

    // 6. Hash password securely
    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    // 7. Insert new user into database
    const insertQuery = `
      INSERT INTO users (name, email, password_hash, currency)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, email, currency, created_at, updated_at;
    `;

    const insertResult = await pool.query<UserRow>(insertQuery, [
      cleanName,
      cleanEmail,
      passwordHash,
      cleanCurrency,
    ]);

    const newUser = insertResult.rows[0];

    // 8. Sign JWT and set HttpOnly cookie
    const token = signToken({
      userId: newUser.id,
      email: newUser.email,
    });
    setAuthCookie(res, token);

    res.status(201).json({
      success: true,
      message: "Registration successful.",
      data: mapUserResponse(newUser),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/login
 * Log in with email and password. Returns generic error on invalid credentials.
 */
export async function login(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.body || typeof req.body !== "object") {
      res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
      return;
    }

    const { email, password }: LoginDTO = req.body;

    if (!email || !password || typeof email !== "string" || typeof password !== "string") {
      res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();

    // Look up user by normalized email
    const userResult = await pool.query<UserRow>(
      `SELECT id, name, email, password_hash, currency, created_at, updated_at FROM users WHERE LOWER(email) = $1;`,
      [cleanEmail]
    );

    // Generic error message to prevent user enumeration
    const invalidCredentialsResponse = () => {
      res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    };

    if (userResult.rows.length === 0) {
      invalidCredentialsResponse();
      return;
    }

    const user = userResult.rows[0];

    // If user has no password set (e.g. unmigrated default user), reject login securely
    if (!user.password_hash) {
      invalidCredentialsResponse();
      return;
    }

    // Verify password with bcrypt
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      invalidCredentialsResponse();
      return;
    }

    // Sign JWT and set HttpOnly cookie
    const token = signToken({
      userId: user.id,
      email: user.email,
    });
    setAuthCookie(res, token);

    res.status(200).json({
      success: true,
      message: "Login successful.",
      data: mapUserResponse(user),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/logout
 * Clears the HttpOnly authentication cookie.
 */
export function logout(_req: Request, res: Response): void {
  clearAuthCookie(res);
  res.status(200).json({
    success: true,
    message: "Logged out successfully.",
  });
}

/**
 * GET /api/auth/me
 * Protected endpoint returning the current authenticated user's profile.
 */
export async function getMe(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
      return;
    }

    const userResult = await pool.query<UserRow>(
      `SELECT id, name, email, currency, created_at, updated_at FROM users WHERE id = $1;`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: "User account not found.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: mapUserResponse(userResult.rows[0]),
    });
  } catch (error) {
    next(error);
  }
}
