import { PoolClient } from "pg";
import { pool } from "../db";
import { PersonResponse, UpdatePersonDTO } from "../types";

interface PersonRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  note: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface ListPeopleOptions {
  search?: string;
  limit: number;
  offset: number;
}

export type DeletePersonResult =
  | { status: "deleted" }
  | { status: "not_found" }
  | { status: "has_loans"; loanCount: number };

function mapPersonRow(row: PersonRow): PersonResponse {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    note: row.note,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  };
}

const PERSON_COLUMNS = `
  id,
  name,
  phone,
  email,
  note,
  created_at,
  updated_at
`;

export async function listPeople(
  userId: string,
  options: ListPeopleOptions
): Promise<PersonResponse[]> {
  const values: unknown[] = [userId];
  const searchCondition = options.search
    ? `AND (name ILIKE $2 OR email ILIKE $2 OR phone ILIKE $2)`
    : "";

  if (options.search) {
    values.push(`%${options.search}%`);
  }

  const limitParameter = values.length + 1;
  values.push(options.limit);
  const offsetParameter = values.length + 1;
  values.push(options.offset);

  const result = await pool.query<PersonRow>(
    `
      SELECT ${PERSON_COLUMNS}
      FROM people
      WHERE user_id = $1
        ${searchCondition}
      ORDER BY created_at DESC, id DESC
      LIMIT $${limitParameter}
      OFFSET $${offsetParameter};
    `,
    values
  );

  return result.rows.map(mapPersonRow);
}

export async function getPersonById(
  userId: string,
  personId: string
): Promise<PersonResponse | null> {
  const result = await pool.query<PersonRow>(
    `
      SELECT ${PERSON_COLUMNS}
      FROM people
      WHERE id = $1 AND user_id = $2;
    `,
    [personId, userId]
  );

  return result.rows[0] ? mapPersonRow(result.rows[0]) : null;
}

export async function createPerson(
  userId: string,
  person: { name: string; phone: string | null; email: string | null; note: string | null }
): Promise<PersonResponse> {
  const result = await pool.query<PersonRow>(
    `
      INSERT INTO people (user_id, name, phone, email, note)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING ${PERSON_COLUMNS};
    `,
    [userId, person.name, person.phone, person.email, person.note]
  );

  return mapPersonRow(result.rows[0]);
}

export async function updatePerson(
  userId: string,
  personId: string,
  updates: UpdatePersonDTO
): Promise<PersonResponse | null> {
  const columns: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) {
    values.push(updates.name);
    columns.push(`name = $${values.length}`);
  }
  if (updates.phone !== undefined) {
    values.push(updates.phone);
    columns.push(`phone = $${values.length}`);
  }
  if (updates.email !== undefined) {
    values.push(updates.email);
    columns.push(`email = $${values.length}`);
  }
  if (updates.note !== undefined) {
    values.push(updates.note);
    columns.push(`note = $${values.length}`);
  }

  values.push(personId, userId);
  const personIdParameter = values.length - 1;
  const userIdParameter = values.length;

  const result = await pool.query<PersonRow>(
    `
      UPDATE people
      SET ${columns.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${personIdParameter} AND user_id = $${userIdParameter}
      RETURNING ${PERSON_COLUMNS};
    `,
    values
  );

  return result.rows[0] ? mapPersonRow(result.rows[0]) : null;
}

export async function deletePerson(
  userId: string,
  personId: string
): Promise<DeletePersonResult> {
  const client: PoolClient = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    // FOR UPDATE serializes deletion against a concurrent loan insert, whose
    // person foreign key takes a key-share lock on this row.
    const personResult = await client.query<{ id: string }>(
      `SELECT id FROM people WHERE id = $1 AND user_id = $2 FOR UPDATE;`,
      [personId, userId]
    );

    if (personResult.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return { status: "not_found" };
    }

    const loanResult = await client.query<{ count: number }>(
      `
        SELECT COUNT(*)::int AS count
        FROM debt_records
        WHERE person_id = $1 AND user_id = $2;
      `,
      [personId, userId]
    );
    const loanCount = loanResult.rows[0]?.count ?? 0;

    if (loanCount > 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return { status: "has_loans", loanCount };
    }

    await client.query(
      `DELETE FROM people WHERE id = $1 AND user_id = $2;`,
      [personId, userId]
    );
    await client.query("COMMIT");
    transactionStarted = false;

    return { status: "deleted" };
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK").catch(() => undefined);
    }
    throw error;
  } finally {
    client.release();
  }
}
