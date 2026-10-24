import { Request, Response, NextFunction } from "express";
import { verifyToken, AUTH_COOKIE_NAME } from "../utils/token";

/**
 * Middleware that verifies authentication using an HttpOnly cookie or Authorization Bearer header.
 * Attaches the authenticated user payload to req.user.
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // 1. Check HttpOnly cookie first
  let token: string | undefined = req.cookies?.[AUTH_COOKIE_NAME];

  // 2. Fall back to Authorization: Bearer <token> header (supports mobile or programmatic clients)
  if (!token && req.headers.authorization) {
    const authHeader = req.headers.authorization;
    if (authHeader.startsWith("Bearer ") || authHeader.startsWith("bearer ")) {
      token = authHeader.substring(7).trim();
    }
  }

  if (!token) {
    res.status(401).json({
      success: false,
      message: "Authentication required. Please log in.",
    });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({
      success: false,
      message: "Invalid or expired session. Please log in again.",
    });
    return;
  }

  req.user = {
    userId: payload.userId,
    email: payload.email,
  };

  next();
}
