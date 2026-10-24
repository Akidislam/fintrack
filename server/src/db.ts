import path from "path";
import dotenv from "dotenv";
import { Pool } from "pg";

// Ensure server/.env is loaded reliably whether started from project root or server/
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set in the server environment");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error);
});
