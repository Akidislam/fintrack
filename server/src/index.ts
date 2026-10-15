import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Health Check Endpoint
app.get("/api/health", (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: "FinTrack API is running!",
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`FinTrack server is running on http://localhost:${PORT}`);
});
