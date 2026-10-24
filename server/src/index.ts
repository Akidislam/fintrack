import path from "path";
import dotenv from "dotenv";

// Ensure server/.env is loaded reliably whether started from project root or server/
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config();

import express, { Request, Response } from "express";
import cors, { CorsOptions } from "cors";
import { pool } from "./db";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler";
import categoryRoutes from "./routes/categoryRoutes";
import accountRoutes from "./routes/accountRoutes";

const app = express();
const PORT = process.env.PORT || 5000;

// Configurable CORS: supports web frontend, comma-separated origins, and native mobile clients
const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser requests (e.g. React Native / Expo, curl, server-to-server) or matching web origins
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      const corsError = new Error(`Origin ${origin} not allowed by CORS`);
      (corsError as Error & { status?: number }).status = 403;
      callback(corsError);
    }
  },
  credentials: true,
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Health Check Endpoint
app.get("/api/health", (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: "FinTrack API is running!",
  });
});

// Database Health Check Endpoint
app.get("/api/health/db", async (_req: Request, res: Response) => {
  try {
    await pool.query("SELECT 1");
    res.status(200).json({
      success: true,
      message: "Database connection is healthy!",
    });
  } catch (error) {
    console.error("Database health check failed:", (error as Error).message);
    res.status(500).json({
      success: false,
      message: "Database connection failed",
    });
  }
});

// Application API Routes
app.use("/api/categories", categoryRoutes);
app.use("/api/accounts", accountRoutes);

// Fallback 404 handler for unknown routes
app.use(notFoundHandler);

// Centralized error handler
app.use(errorHandler);

// Start Server
app.listen(PORT, () => {
  console.log(`FinTrack server is running on http://localhost:${PORT}`);
});
