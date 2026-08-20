/**
 * Parse password-reset email deep-link params (`uid` + `token`).
 *
 * Canonical email link (production):
 *   https://fplaces.netlify.app/reset-password?uid=…&token=…
 *
 * Also supports query/hash variants used in local and legacy links.
 */

export interface PasswordResetLinkParams {
  uid: string;
  token: string;
}

const RESET_PATH = '/reset-password';
const CAPTURE_KEY = 'fplaces_password_reset_link';

/**
 * Read uid/token from a location-like search + hash.
 * Pathname is optional; `/reset-password` is recognized but not required
 * when both query params are present.
 */
export function parsePasswordResetLink(
  search: string,
  hash = '',
  pathname = '',
): PasswordResetLinkParams | null {
  const fromSearch = readParams(search);
  if (fromSearch) return fromSearch;

  const hashQueryIndex = hash.indexOf('?');
  if (hashQueryIndex >= 0) {
    const fromHashQuery = readParams(hash.slice(hashQueryIndex));
    if (fromHashQuery) return fromHashQuery;
  }

  // Some clients put params in the hash path as `#uid=…&token=…`
  if (hash.startsWith('#') && hash.includes('uid=')) {
    const fromHash = readParams(`?${hash.slice(1)}`);
    if (fromHash) return fromHash;
  }

  // Path-only marker without params cannot open reset confirm.
  if (normalizePath(pathname) === RESET_PATH) {
    return null;
  }

  return null;
}

/**
 * Capture reset params from the current URL into sessionStorage immediately,
 * then normalize the address bar to `/` so boot/routing cannot lose them.
 */
export function capturePasswordResetLinkFromLocation(
  locationLike: Pick<Location, 'pathname' | 'search' | 'hash'> = window.location,
  historyLike: Pick<History, 'replaceState'> = window.history,
  storage: Storage | null = defaultSessionStorage(),
): PasswordResetLinkParams | null {
  const params = parsePasswordResetLink(
    locationLike.search,
    locationLike.hash,
    locationLike.pathname,
  );
  if (!params) {
    return loadCapturedPasswordResetLink(storage);
  }

  persistCapturedPasswordResetLink(params, storage);
  clearPasswordResetLinkFromUrl(locationLike, historyLike);
  return params;
}

/** Consume a previously captured link (URL or sessionStorage). */
export function consumePasswordResetLink(
  locationLike: Pick<Location, 'pathname' | 'search' | 'hash'> = window.location,
  historyLike: Pick<History, 'replaceState'> = window.history,
  storage: Storage | null = defaultSessionStorage(),
): PasswordResetLinkParams | null {
  const fromUrl = parsePasswordResetLink(
    locationLike.search,
    locationLike.hash,
    locationLike.pathname,
  );
  if (fromUrl) {
    persistCapturedPasswordResetLink(fromUrl, storage);
    clearPasswordResetLinkFromUrl(locationLike, historyLike);
    return takeCapturedPasswordResetLink(storage) ?? fromUrl;
  }
  return takeCapturedPasswordResetLink(storage);
}

export function loadCapturedPasswordResetLink(
  storage: Storage | null = defaultSessionStorage(),
): PasswordResetLinkParams | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(CAPTURE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PasswordResetLinkParams>;
    const uid = typeof parsed.uid === 'string' ? parsed.uid.trim() : '';
    const token = typeof parsed.token === 'string' ? parsed.token.trim() : '';
    if (!uid || !token) return null;
    return { uid, token };
  } catch {
    return null;
  }
}

function persistCapturedPasswordResetLink(
  params: PasswordResetLinkParams,
  storage: Storage | null,
): void {
  if (!storage) return;
  try {
    storage.setItem(CAPTURE_KEY, JSON.stringify(params));
  } catch {
    /* storage unavailable */
  }
}

function takeCapturedPasswordResetLink(
  storage: Storage | null,
): PasswordResetLinkParams | null {
  const params = loadCapturedPasswordResetLink(storage);
  if (!storage) return params;
  try {
    storage.removeItem(CAPTURE_KEY);
  } catch {
    /* storage unavailable */
  }
  return params;
}

function readParams(raw: string): PasswordResetLinkParams | null {
  if (!raw) return null;
  const query = raw.startsWith('?')
    ? raw.slice(1)
    : raw.startsWith('#')
      ? raw.slice(1)
      : raw;
  const params = new URLSearchParams(query);
  const uid = (params.get('uid') ?? '').trim();
  const token = (params.get('token') ?? '').trim();
  if (!uid || !token) return null;
  return { uid, token };
}

function normalizePath(pathname: string): string {
  if (!pathname) return '';
  const trimmed = pathname.replace(/\/+$/, '') || '/';
  return trimmed.toLowerCase();
}

/**
 * Strip uid/token from the address bar and normalize `/reset-password` → `/`
 * without reloading.
 */
export function clearPasswordResetLinkFromUrl(
  locationLike: Pick<Location, 'pathname' | 'search' | 'hash'> = window.location,
  historyLike: Pick<History, 'replaceState'> = window.history,
): void {
  const searchParams = new URLSearchParams(
    locationLike.search.startsWith('?')
      ? locationLike.search.slice(1)
      : locationLike.search,
  );
  const hadSearch = searchParams.has('uid') || searchParams.has('token');
  searchParams.delete('uid');
  searchParams.delete('token');

  let nextHash = locationLike.hash;
  if (nextHash.includes('uid=') || nextHash.includes('token=')) {
    nextHash = '';
  }

  const onResetPath = normalizePath(locationLike.pathname) === RESET_PATH;
  const nextPath = onResetPath ? '/' : locationLike.pathname;

  if (!hadSearch && nextHash === locationLike.hash && !onResetPath) return;

  const nextSearch = searchParams.toString();
  const url = `${nextPath}${nextSearch ? `?${nextSearch}` : ''}${nextHash}`;
  historyLike.replaceState(null, '', url);
}

function defaultSessionStorage(): Storage | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
}
