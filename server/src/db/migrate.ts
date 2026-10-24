import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { pool } from "../db";

// Ensure server/.env is loaded reliably whether started from project root or server/
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config();

/**
 * Finds the migrations directory across dev (ts/src) and build (js/dist) runtime paths.
 */
function getMigrationsDirectory(): string {
  const candidateDirs = [
    path.resolve(__dirname, "migrations"),
    path.resolve(__dirname, "../../src/db/migrations"),
    path.resolve(__dirname, "../src/db/migrations"),
    path.resolve(process.cwd(), "server/src/db/migrations"),
    path.resolve(process.cwd(), "src/db/migrations"),
  ];

  for (const dir of candidateDirs) {
    if (fs.existsSync(dir)) {
      return dir;
    }
  }

  throw new Error(
    `Migrations directory not found in candidates: ${candidateDirs.join(", ")}`
  );
}

/**
 * Executes all pending database migrations in transactional order.
 */
export async function runMigrations(): Promise<void> {
  const client = await pool.connect();

  try {
    // 1. Ensure the schema_migrations tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Query already applied migrations
    const appliedResult = await client.query<{ name: string }>(
      `SELECT name FROM schema_migrations ORDER BY id ASC;`
    );
    const appliedSet = new Set(appliedResult.rows.map((r: { name: string }) => r.name));

    // 3. Locate migration directory and read all .sql files
    const migrationsDir = getMigrationsDirectory();
    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort((a, b) => a.localeCompare(b));

    const pendingFiles = files.filter((file) => !appliedSet.has(file));

    if (pendingFiles.length === 0) {
      console.log("Database is up to date. No pending migrations to apply.");
      return;
    }

    console.log(`Found ${pendingFiles.length} pending migration(s)...`);

    // 4. Apply each pending migration inside its own transaction
    for (const file of pendingFiles) {
      const filePath = path.join(migrationsDir, file);
      const sqlContent = fs.readFileSync(filePath, "utf-8");

      console.log(`Applying migration: ${file}...`);
      await client.query("BEGIN");
      try {
        await client.query(sqlContent);
        await client.query(
          `INSERT INTO schema_migrations (name) VALUES ($1);`,
          [file]
        );
        await client.query("COMMIT");
        console.log(`Successfully applied: ${file}`);
      } catch (migrationError) {
        await client.query("ROLLBACK");
        console.error(`Failed to apply migration ${file}:`, (migrationError as Error).message);
        throw migrationError;
      }
    }

    console.log("All migrations applied successfully.");
  } finally {
    client.release();
  }
}

// Allow direct CLI execution: `npx tsx src/db/migrate.ts` or `npm run migrate`
if (require.main === module) {
  runMigrations()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("Migration runner failed:", msg);
      await pool.end();
      process.exit(1);
    });
}
