import express, { Request, Response } from "express";
import cors, { CorsOptions } from "cors";
import dotenv from "dotenv";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler";

dotenv.config();

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

// Fallback 404 handler for unknown routes
app.use(notFoundHandler);

// Centralized error handler
app.use(errorHandler);

// Start Server
app.listen(PORT, () => {
  console.log(`FinTrack server is running on http://localhost:${PORT}`);
});
