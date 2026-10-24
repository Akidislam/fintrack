import { Response } from "express";
import jwt from "jsonwebtoken";
import { AuthTokenPayload } from "../types";

export const AUTH_COOKIE_NAME = "fintrack_token";

const JWT_SECRET =
  process.env.JWT_SECRET || "fintrack_dev_fallback_secret_do_not_use_in_prod";

if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
  console.warn(
    "[SECURITY WARNING] JWT_SECRET is not set in production environment. A default fallback is being used!"
  );
}

/**
 * Signs a JWT with user payload valid for 7 days
 */
export function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: "7d",
  });
}

/**
 * Verifies a JWT token and returns the payload, or null if invalid or expired
 */
export function verifyToken(token: string): AuthTokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
  } catch {
    return null;
  }
}

/**
 * Configures and sets the HttpOnly authentication cookie
 */
export function setAuthCookie(res: Response, token: string): void {
  const isProd = process.env.NODE_ENV === "production";

  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
    path: "/",
  });
}

/**
 * Clears the authentication cookie on logout
 */
export function clearAuthCookie(res: Response): void {
  const isProd = process.env.NODE_ENV === "production";

  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: "/",
  });
}
