import type { ForumComment } from '../../domain/entities';

/**
 * Normalize forum comment JSON from REST payloads.
 */
export function coerceForumComment(raw: unknown): ForumComment | null {
  if (!raw || typeof raw !== 'object') return null;
  const dto = raw as Record<string, unknown>;
  const id = Number(dto.id);
  const post = Number(dto.post);
  const userRaw = dto.user;
  if (
    !Number.isFinite(id) ||
    !Number.isFinite(post) ||
    !userRaw ||
    typeof userRaw !== 'object'
  ) {
    return null;
  }
  const user = userRaw as Record<string, unknown>;
  const userId = Number(user.id);
  if (!Number.isFinite(userId)) return null;

  const createdAt = String(
    dto.created_at ?? dto.createdAt ?? new Date().toISOString(),
  );
  return {
    id,
    post,
    user: {
      id: userId,
      display_name: String(
        user.display_name ?? user.displayName ?? 'Guest',
      ),
    },
    content: String(dto.content ?? ''),
    created_at: createdAt,
    updated_at: String(dto.updated_at ?? dto.updatedAt ?? createdAt),
  };
}

export function coerceForumCommentList(raw: unknown): {
  count: number;
  next: string | null;
  previous: string | null;
  results: ForumComment[];
} {
  if (!raw || typeof raw !== 'object') {
    return { count: 0, next: null, previous: null, results: [] };
  }
  const dto = raw as Record<string, unknown>;
  const resultsRaw = Array.isArray(dto.results) ? dto.results : [];
  const results = resultsRaw
    .map((row) => coerceForumComment(row))
    .filter((row): row is ForumComment => row != null);
  return {
    count: Number(dto.count) || results.length,
    next: typeof dto.next === 'string' ? dto.next : null,
    previous: typeof dto.previous === 'string' ? dto.previous : null,
    results,
  };
}
