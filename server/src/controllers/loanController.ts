import { NextFunction, Request, Response } from "express";
import {
  CreateLoanInput,
  createLoan,
  InterestMethod,
  LoanDirection,
  RepaymentMode,
} from "../services/loanService";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const AMOUNT_REGEX = /^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/;
const RATE_REGEX = /^(?:0|[1-9]\d{0,2})(?:\.\d{1,6})?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_REGEX.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function decimalUnits(value: string, scale: number): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, "0"));
}

function normalizeDecimal(value: string, scale: number): string {
  const [whole, fraction = ""] = value.split(".");
  return `${whole}.${fraction.padEnd(scale, "0")}`;
}

function invalid(res: Response, message: string): void {
  res.status(400).json({ success: false, message });
}

export async function createLoanController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, message: "Authentication required. Please log in." });
      return;
    }
    if (!isRecord(req.body)) {
      invalid(res, "A JSON request body is required.");
      return;
    }

    const body = req.body;
    if (typeof body.personId !== "string" || !UUID_REGEX.test(body.personId)) {
      invalid(res, "personId must be a valid UUID.");
      return;
    }
    if (body.type !== "lent" && body.type !== "borrowed") {
      invalid(res, "type must be either 'lent' or 'borrowed'.");
      return;
    }
    if (typeof body.accountId !== "string" || !UUID_REGEX.test(body.accountId)) {
      invalid(res, "accountId must be a valid UUID.");
      return;
    }
    if (typeof body.amount !== "string" || !AMOUNT_REGEX.test(body.amount) || decimalUnits(body.amount, 2) <= 0n) {
      invalid(res, "amount must be a positive decimal string with up to 13 integer and 2 fractional digits.");
      return;
    }
    if (!validDate(body.startDate)) {
      invalid(res, "startDate must be a real calendar date in YYYY-MM-DD format.");
      return;
    }
    if (body.interestMethod !== "none" && body.interestMethod !== "simple" && body.interestMethod !== "flat") {
      invalid(res, "interestMethod must be 'none', 'simple', or 'flat'.");
      return;
    }
    if (typeof body.annualRatePct !== "string" || !RATE_REGEX.test(body.annualRatePct)) {
      invalid(res, "annualRatePct must be a decimal string with up to 3 integer and 6 fractional digits.");
      return;
    }
    const rate = normalizeDecimal(body.annualRatePct, 6);
    const rateUnits = decimalUnits(body.annualRatePct, 6);
    if ((body.interestMethod === "none" && rateUnits !== 0n) || (body.interestMethod !== "none" && rateUnits <= 0n)) {
      invalid(res, "Use a zero annualRatePct with no interest, and a positive rate for simple or flat interest.");
      return;
    }
    if (body.repaymentMode !== "one_time" && body.repaymentMode !== "installments") {
      invalid(res, "repaymentMode must be 'one_time' or 'installments'.");
      return;
    }

    let installments: Array<{ dueDate: string; principalDue: string }> | undefined;
    let dueDate: string | undefined;
    if (body.repaymentMode === "one_time") {
      if (!validDate(body.dueDate) || body.dueDate <= body.startDate) {
        invalid(res, "A one-time loan requires a dueDate later than startDate.");
        return;
      }
      dueDate = body.dueDate;
      installments = [{ dueDate, principalDue: normalizeDecimal(body.amount, 2) }];
    } else {
      if (!Array.isArray(body.installments) || body.installments.length < 1 || body.installments.length > 600) {
        invalid(res, "Installment loans require between 1 and 600 schedule entries.");
        return;
      }
      installments = [];
      let previousDate = body.startDate;
      for (let index = 0; index < body.installments.length; index += 1) {
        const item = body.installments[index];
        if (!isRecord(item) || !validDate(item.dueDate) || item.dueDate <= previousDate) {
          invalid(res, `Installment ${index + 1} dueDate must be a valid date after the prior date and startDate.`);
          return;
        }
        if (typeof item.principalDue !== "string" || !AMOUNT_REGEX.test(item.principalDue)) {
          invalid(res, `Installment ${index + 1} principalDue must be a non-negative decimal string with up to 2 fractional digits.`);
          return;
        }
        installments.push({ dueDate: item.dueDate, principalDue: normalizeDecimal(item.principalDue, 2) });
        previousDate = item.dueDate;
      }
    }

    if (body.currency !== undefined && (typeof body.currency !== "string" || !/^[A-Za-z]{3}$/.test(body.currency))) {
      invalid(res, "currency, when supplied, must be a three-letter currency code.");
      return;
    }
    if (body.description !== undefined && body.description !== null &&
        (typeof body.description !== "string" || body.description.trim().length > 255)) {
      invalid(res, "description must be 255 characters or fewer.");
      return;
    }

    const rawIdempotencyKey = req.get("Idempotency-Key");
    if (!rawIdempotencyKey || !UUID_REGEX.test(rawIdempotencyKey)) {
      invalid(res, "A valid UUID Idempotency-Key header is required.");
      return;
    }

    const input: CreateLoanInput = {
      personId: body.personId,
      type: body.type as LoanDirection,
      amount: normalizeDecimal(body.amount, 2),
      accountId: body.accountId,
      ...(typeof body.currency === "string" ? { currency: body.currency.toUpperCase() } : {}),
      startDate: body.startDate,
      ...(dueDate ? { dueDate } : {}),
      interestMethod: body.interestMethod as InterestMethod,
      annualRatePct: rate,
      repaymentMode: body.repaymentMode as RepaymentMode,
      description: typeof body.description === "string" ? body.description.trim() || null : null,
      ...(installments ? { installments } : {}),
    };

    const result = await createLoan(userId, rawIdempotencyKey, input);
    if (result.kind === "person_not_found") {
      res.status(404).json({ success: false, message: "Person not found." });
      return;
    }
    if (result.kind === "account_not_found") {
      res.status(404).json({ success: false, message: "Account not found or archived." });
      return;
    }
    if (result.kind === "currency_mismatch") {
      res.status(400).json({ success: false, message: "Loan currency must match the selected account currency." });
      return;
    }
    if (result.kind === "schedule_principal_mismatch") {
      res.status(400).json({ success: false, message: "Installment principal amounts must sum exactly to the loan principal." });
      return;
    }
    if (result.kind === "empty_installment") {
      res.status(400).json({ success: false, message: "Each installment must contain a positive principal or interest amount." });
      return;
    }
    if (result.kind === "idempotency_conflict") {
      res.status(409).json({ success: false, message: "This Idempotency-Key was already used with a different request." });
      return;
    }

    res.status(result.kind === "replayed" ? 200 : 201).json({
      success: true,
      message: result.kind === "replayed" ? "Loan creation request already processed." : "Loan created successfully.",
      data: result.loan,
    });
  } catch (error) {
    next(error);
  }
}
