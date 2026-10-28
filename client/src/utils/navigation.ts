export const VALID_NAV_PAGES = [
  'dashboard',
  'accounts',
  'transactions',
  'categories',
  'budgets',
  'analytics',
  'settings',
] as const;

export type NavPage = (typeof VALID_NAV_PAGES)[number];

export function isValidNavPage(page: unknown): page is NavPage {
  return typeof page === 'string' && VALID_NAV_PAGES.includes(page as NavPage);
}

/**
 * Resolves the active navigation page from the current window location.
 * Checks pathname, hash, and search query params in sequence.
 */
export function getNavFromLocation(): NavPage {
  if (typeof window === 'undefined') {
    return 'dashboard';
  }

  // 1. Check pathname: e.g. /analytics or /fintrack/analytics
  const pathSegments = window.location.pathname.split('/').filter(Boolean);
  const lastSegment = pathSegments[pathSegments.length - 1]?.toLowerCase();
  if (isValidNavPage(lastSegment)) {
    return lastSegment;
  }

  // 2. Check hash: e.g. #/analytics or #analytics
  const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase().split('/')[0];
  if (isValidNavPage(hash)) {
    return hash;
  }

  // 3. Check search query parameter: e.g. ?page=analytics
  const searchParams = new URLSearchParams(window.location.search);
  const pageParam = searchParams.get('page')?.toLowerCase();
  if (isValidNavPage(pageParam)) {
    return pageParam;
  }

  return 'dashboard';
}

/**
 * Maps a NavPage to its canonical URL path.
 * Dashboard maps to '/', others map to '/<page>'.
 */
export function getPathForNav(page: NavPage): string {
  return page === 'dashboard' ? '/' : `/${page}`;
}
