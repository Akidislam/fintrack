/**
 * Returns the current calendar year and month as a tuple [year, month]
 * where month is 1-indexed (January = 1).
 *
 * Calling this once outside of a filter/map and passing the result in
 * avoids repeated `new Date()` calls inside render (React purity lint rule).
 */
export function getCurrentYearMonth(): [number, number] {
  const now = new Date();
  return [now.getFullYear(), now.getMonth() + 1];
}

/**
 * Returns true if the given YYYY-MM-DD date string belongs to the
 * provided [year, month] tuple. Month is 1-indexed.
 *
 * Parses by splitting on '-' to avoid UTC offset issues with `new Date(dateStr)`.
 */
export function isInYearMonth(
  dateStr: string,
  [year, month]: [number, number]
): boolean {
  try {
    const parts = dateStr.split('-');
    if (parts.length < 2) return false;
    return Number.parseInt(parts[0], 10) === year && Number.parseInt(parts[1], 10) === month;
  } catch {
    return false;
  }
}

/**
 * Checks whether a YYYY-MM-DD date string falls within [startDate, endDate] (inclusive).
 * Safely handles missing/empty start or end dates.
 * If both are provided and startDate > endDate, gracefully swaps them to handle the inverted range.
 */
export function isDateInRange(
  dateStr: string,
  startDate?: string,
  endDate?: string
): boolean {
  if (!dateStr) return false;

  const trimmedStart = startDate?.trim();
  const trimmedEnd = endDate?.trim();

  // If neither boundary is set, any date is in range
  if (!trimmedStart && !trimmedEnd) return true;

  // Normalize boundaries if both are provided but inverted
  const start =
    trimmedStart && trimmedEnd && trimmedStart > trimmedEnd
      ? trimmedEnd
      : trimmedStart;
  const end =
    trimmedStart && trimmedEnd && trimmedStart > trimmedEnd
      ? trimmedStart
      : trimmedEnd;

  if (start && dateStr < start) {
    return false;
  }
  if (end && dateStr > end) {
    return false;
  }
  return true;
}
