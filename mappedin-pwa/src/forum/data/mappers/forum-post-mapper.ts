import type { ForumPost } from '../../domain/entities';

/**
 * Normalize forum post JSON from REST or WebSocket payloads.
 * Accepts snake_case / camelCase and common upvote aliases.
 */
export function coerceForumPost(
  raw: unknown,
  options?: { hasUpvotedFallback?: boolean },
): ForumPost | null {
  if (!raw || typeof raw !== 'object') return null;
  const dto = raw as Record<string, unknown>;
  const nested =
    extractObject(dto, ['post', 'payload', 'data']) ?? dto;

  const userRaw = nested.user;
  if (!userRaw || typeof userRaw !== 'object') return null;
  const user = userRaw as Record<string, unknown>;

  const id = Number(nested.id);
  const userId = Number(user.id);
  const venue = Number(nested.venue);
  const category = Number(nested.category);
  if (
    !Number.isFinite(id) ||
    !Number.isFinite(userId) ||
    !Number.isFinite(venue) ||
    !Number.isFinite(category)
  ) {
    return null;
  }

  const sectionRaw = nested.section;
  const section =
    sectionRaw == null || sectionRaw === ''
      ? null
      : Number(sectionRaw);

  const hasUpvoted = resolveHasUpvoted(nested);
  return {
    id,
    user: {
      id: userId,
      display_name: String(
        user.display_name ?? user.displayName ?? 'Guest',
      ),
    },
    venue,
    section: section != null && Number.isFinite(section) ? section : null,
    category,
    content: String(nested.content ?? ''),
    upvotes_count: Number(nested.upvotes_count ?? nested.upvotesCount) || 0,
    flags_count: Number(nested.flags_count ?? nested.flagsCount) || 0,
    status: nested.status === 'hidden' ? 'hidden' : 'visible',
    has_upvoted:
      typeof hasUpvoted === 'boolean'
        ? hasUpvoted
        : Boolean(options?.hasUpvotedFallback),
    created_at: String(
      nested.created_at ?? nested.createdAt ?? new Date().toISOString(),
    ),
    updated_at: String(
      nested.updated_at ??
        nested.updatedAt ??
        nested.created_at ??
        nested.createdAt ??
        new Date().toISOString(),
    ),
  };
}

export function coerceForumPostList(raw: unknown): {
  count: number;
  next: string | null;
  previous: string | null;
  results: ForumPost[];
} {
  if (!raw || typeof raw !== 'object') {
    return { count: 0, next: null, previous: null, results: [] };
  }
  const dto = raw as Record<string, unknown>;
  const rows = Array.isArray(dto.results) ? dto.results : [];
  const results = rows
    .map((row) => coerceForumPost(row))
    .filter((post): post is ForumPost => post != null);
  return {
    count: Number(dto.count) || results.length,
    next: typeof dto.next === 'string' ? dto.next : null,
    previous: typeof dto.previous === 'string' ? dto.previous : null,
    results,
  };
}

function resolveHasUpvoted(dto: Record<string, unknown>): boolean | undefined {
  const candidates = [dto.has_upvoted, dto.hasUpvoted, dto.upvoted];
  for (const value of candidates) {
    if (typeof value === 'boolean') return value;
  }
  return undefined;
}

function extractObject(
  message: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> | null {
  for (const key of keys) {
    const value = message[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return null;
}
