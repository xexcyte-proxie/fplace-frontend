/**
 * Parse password-reset email deep-link params (`uid` + `token`).
 * Supports query string and hash query forms used by reset emails.
 */
export interface PasswordResetLinkParams {
  uid: string;
  token: string;
}

export function parsePasswordResetLink(
  search: string,
  hash = '',
): PasswordResetLinkParams | null {
  const fromSearch = readParams(search);
  if (fromSearch) return fromSearch;

  const hashQueryIndex = hash.indexOf('?');
  if (hashQueryIndex >= 0) {
    return readParams(hash.slice(hashQueryIndex));
  }

  // Some clients put params in the hash path as `#uid=…&token=…`
  if (hash.startsWith('#') && hash.includes('uid=')) {
    return readParams(`?${hash.slice(1)}`);
  }

  return null;
}

function readParams(raw: string): PasswordResetLinkParams | null {
  if (!raw) return null;
  const query = raw.startsWith('?') ? raw.slice(1) : raw.startsWith('#') ? raw.slice(1) : raw;
  const params = new URLSearchParams(query);
  const uid = (params.get('uid') ?? '').trim();
  const token = (params.get('token') ?? '').trim();
  if (!uid || !token) return null;
  return { uid, token };
}

/** Strip uid/token from the address bar without reloading. */
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

  if (!hadSearch && nextHash === locationLike.hash) return;

  const nextSearch = searchParams.toString();
  const url = `${locationLike.pathname}${nextSearch ? `?${nextSearch}` : ''}${nextHash}`;
  historyLike.replaceState(null, '', url);
}
