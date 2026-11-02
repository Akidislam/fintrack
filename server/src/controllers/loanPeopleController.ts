import { NextFunction, Request, Response } from "express";
import { CreatePersonDTO, UpdatePersonDTO } from "../types";
import {
  createPerson,
  deletePerson,
  getPersonById,
  listPeople,
  updatePerson,
} from "../services/peopleService";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NOTE_LENGTH = 5000;

interface DatabaseError extends Error {
  code?: string;
}

function getAuthUserId(req: Request, res: Response): string | null {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({
      success: false,
      message: "Authentication required. Please log in.",
    });
    return null;
  }
  return userId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error &&
    (error as DatabaseError).code === "23505";
}

function normalizeNullableText(
  value: unknown,
  field: string,
  maxLength: number
): { value: string | null } | { error: string } {
  if (value === null || value === undefined) {
    return { value: null };
  }
  if (typeof value !== "string") {
    return { error: `${field} must be a string.` };
  }

  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    return { error: `${field} must be ${maxLength} characters or fewer.` };
  }
  return { value: trimmed || null };
}

function validateEmail(email: string | null): string | null {
  if (email !== null && !EMAIL_REGEX.test(email)) {
    return "Email must be a valid email address.";
  }
  return null;
}

function getValidPersonId(req: Request, res: Response): string | null {
  const { id } = req.params;
  if (typeof id !== "string" || !UUID_REGEX.test(id)) {
    res.status(400).json({
      success: false,
      message: "Invalid person ID format. Expected a valid UUID.",
    });
    return null;
  }
  return id;
}

function parsePaginationValue(
  value: unknown,
  name: string,
  defaultValue: number,
  allowZero: boolean
): { value: number } | { error: string } {
  if (value === undefined) {
    return { value: defaultValue };
  }
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return { error: `Query parameter '${name}' must be an integer.` };
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || (allowZero ? parsed < 0 : parsed <= 0)) {
    return { error: `Query parameter '${name}' is outside the supported range.` };
  }
  return { value: parsed };
}

/** GET /api/loans/people */
export async function getPeople(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = getAuthUserId(req, res);
    if (!userId) return;

    let search: string | undefined;
    if (req.query.search !== undefined) {
      if (typeof req.query.search !== "string") {
        res.status(400).json({ success: false, message: "Search must be a single string." });
        return;
      }
      search = req.query.search.trim();
      if (search.length > 100) {
        res.status(400).json({ success: false, message: "Search must be 100 characters or fewer." });
        return;
      }
      if (!search) search = undefined;
    }

    const limit = parsePaginationValue(req.query.limit, "limit", 50, false);
    if ("error" in limit) {
      res.status(400).json({ success: false, message: limit.error });
      return;
    }

    const offset = parsePaginationValue(req.query.offset, "offset", 0, true);
    if ("error" in offset) {
      res.status(400).json({ success: false, message: offset.error });
      return;
    }

    const people = await listPeople(userId, {
      search,
      limit: Math.min(limit.value, 500),
      offset: offset.value,
    });

    res.status(200).json({
      success: true,
      count: people.length,
      data: people,
    });
  } catch (error) {
    next(error);
  }
}

/** GET /api/loans/people/:id */
export async function getPersonByIdController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = getAuthUserId(req, res);
    if (!userId) return;
    const personId = getValidPersonId(req, res);
    if (!personId) return;

    const person = await getPersonById(userId, personId);
    if (!person) {
      res.status(404).json({ success: false, message: "Person not found." });
      return;
    }

    res.status(200).json({ success: true, data: person });
  } catch (error) {
    next(error);
  }
}

/** POST /api/loans/people */
export async function createPersonController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = getAuthUserId(req, res);
    if (!userId) return;
    if (!isRecord(req.body)) {
      res.status(400).json({ success: false, message: "A JSON request body is required." });
      return;
    }

    const body = req.body as Partial<CreatePersonDTO>;
    if (typeof body.name !== "string" || !body.name.trim()) {
      res.status(400).json({ success: false, message: "Person name is required." });
      return;
    }
    const name = body.name.trim();
    if (name.length > 100) {
      res.status(400).json({ success: false, message: "Person name must be 100 characters or fewer." });
      return;
    }

    const phone = normalizeNullableText(body.phone, "Phone", 30);
    if ("error" in phone) {
      res.status(400).json({ success: false, message: phone.error });
      return;
    }
    const email = normalizeNullableText(body.email, "Email", 255);
    if ("error" in email) {
      res.status(400).json({ success: false, message: email.error });
      return;
    }
    const emailError = validateEmail(email.value);
    if (emailError) {
      res.status(400).json({ success: false, message: emailError });
      return;
    }
    const note = normalizeNullableText(body.note, "Note", MAX_NOTE_LENGTH);
    if ("error" in note) {
      res.status(400).json({ success: false, message: note.error });
      return;
    }

    const person = await createPerson(userId, {
      name,
      phone: phone.value,
      email: email.value,
      note: note.value,
    });

    res.status(201).json({
      success: true,
      message: "Person created successfully.",
      data: person,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ success: false, message: "A person with this name already exists." });
      return;
    }
    next(error);
  }
}

/** PATCH /api/loans/people/:id */
export async function updatePersonController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = getAuthUserId(req, res);
    if (!userId) return;
    const personId = getValidPersonId(req, res);
    if (!personId) return;
    if (!isRecord(req.body)) {
      res.status(400).json({ success: false, message: "A JSON request body is required." });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const updates: UpdatePersonDTO = {};
    const permittedFields = ["name", "phone", "email", "note"] as const;
    const hasPermittedField = permittedFields.some((field) =>
      Object.prototype.hasOwnProperty.call(body, field)
    );
    if (!hasPermittedField) {
      res.status(400).json({
        success: false,
        message: "At least one permitted field (name, phone, email, note) must be provided.",
      });
      return;
    }

    if (Object.prototype.hasOwnProperty.call(body, "name")) {
      if (typeof body.name !== "string" || !body.name.trim()) {
        res.status(400).json({ success: false, message: "Person name cannot be empty." });
        return;
      }
      const name = body.name.trim();
      if (name.length > 100) {
        res.status(400).json({ success: false, message: "Person name must be 100 characters or fewer." });
        return;
      }
      updates.name = name;
    }

    for (const field of ["phone", "email", "note"] as const) {
      if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
      const maxLength = field === "phone" ? 30 : field === "email" ? 255 : MAX_NOTE_LENGTH;
      const normalized = normalizeNullableText(body[field], field[0].toUpperCase() + field.slice(1), maxLength);
      if ("error" in normalized) {
        res.status(400).json({ success: false, message: normalized.error });
        return;
      }
      updates[field] = normalized.value;
    }

    const emailError = validateEmail(updates.email ?? null);
    if (emailError && Object.prototype.hasOwnProperty.call(body, "email")) {
      res.status(400).json({ success: false, message: emailError });
      return;
    }

    const person = await updatePerson(userId, personId, updates);
    if (!person) {
      res.status(404).json({ success: false, message: "Person not found." });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Person updated successfully.",
      data: person,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ success: false, message: "A person with this name already exists." });
      return;
    }
    next(error);
  }
}

/** DELETE /api/loans/people/:id */
export async function deletePersonController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = getAuthUserId(req, res);
    if (!userId) return;
    const personId = getValidPersonId(req, res);
    if (!personId) return;

    const result = await deletePerson(userId, personId);
    if (result.status === "not_found") {
      res.status(404).json({ success: false, message: "Person not found." });
      return;
    }
    if (result.status === "has_loans") {
      res.status(409).json({
        success: false,
        message: "This person is referenced by loan records and cannot be deleted.",
        loanCount: result.loanCount,
      });
      return;
    }

    res.status(200).json({ success: true, message: "Person deleted successfully." });
  } catch (error) {
    next(error);
  }
}
