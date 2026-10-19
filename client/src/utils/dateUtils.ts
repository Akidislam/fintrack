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
    return parseInt(parts[0], 10) === year && parseInt(parts[1], 10) === month;
  } catch {
    return false;
  }
}
