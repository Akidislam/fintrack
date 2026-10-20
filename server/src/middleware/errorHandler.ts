import { Request, Response, NextFunction } from "express";

export interface AppError extends Error {
  status?: number;
  statusCode?: number;
}

/**
 * Catches all unhandled routes and returns a structured JSON 404 response.
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}

/**
 * Centralized Express error-handling middleware.
 * Formats errors into a consistent JSON response.
 * - For known 4xx client errors, preserves status code and custom error message.
 * - For unexpected 500 server errors in production, masks internal details with a generic message.
 * - Never leaks stack traces in production.
 */
export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const isDev = process.env.NODE_ENV === "development";
  const rawStatus = err.status || err.statusCode || 500;
  const status =
    Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus <= 599
      ? rawStatus
      : 500;

  // Protect internal error details for unexpected 500 errors in production
  const message =
    status >= 500 && !isDev
      ? "Internal server error"
      : err.message || "An unexpected error occurred";

  res.status(status).json({
    success: false,
    message,
    ...(isDev && err.stack ? { stack: err.stack } : {}),
  });
}
