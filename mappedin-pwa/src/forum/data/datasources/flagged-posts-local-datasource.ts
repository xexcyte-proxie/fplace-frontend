const STORAGE_PREFIX = 'fplaces.flaggedPosts.';

/** Cap stored ids so the list cannot grow unbounded over months of use. */
const MAX_STORED_IDS = 300;

function storageKey(viewerKey: string): string {
  return `${STORAGE_PREFIX}${viewerKey}`;
}

function read(viewerKey: string): string[] {
  try {
    const raw = localStorage.getItem(storageKey(viewerKey));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((id): id is string => typeof id === 'string'))];
  } catch {
    /* private mode / blocked storage / corrupt payload */
    return [];
  }
}

function write(viewerKey: string, postIds: string[]): void {
  try {
    if (postIds.length === 0) {
      localStorage.removeItem(storageKey(viewerKey));
      return;
    }
    localStorage.setItem(
      storageKey(viewerKey),
      JSON.stringify(postIds.slice(-MAX_STORED_IDS)),
    );
  } catch {
    /* private mode / blocked storage */
  }
}

/**
 * Persists which posts the viewer reported, keyed per viewer (registered user
 * or guest). The backend has no per-user `has_flagged` field on `Post` and no
 * unflag endpoint, so this local record is what keeps the "Reported" state
 * across reloads and lets the UI toggle it off again.
 */
export const flaggedPostsLocalDatasource = {
  load(viewerKey: string): string[] {
    return read(viewerKey);
  },
  add(viewerKey: string, postId: string): void {
    const ids = read(viewerKey);
    if (ids.includes(postId)) return;
    write(viewerKey, [...ids, postId]);
  },
  remove(viewerKey: string, postId: string): void {
    const ids = read(viewerKey);
    if (!ids.includes(postId)) return;
    write(viewerKey, ids.filter((id) => id !== postId));
  },
  clear(viewerKey: string): void {
    write(viewerKey, []);
  },
};
