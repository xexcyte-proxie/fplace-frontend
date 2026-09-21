import type { ForumInterest, PaginatedList } from '../../domain/entities';

/**
 * Normalize interest catalog JSON from GET /api/forum/interests/.
 */
export function coerceForumInterest(raw: unknown): ForumInterest | null {
  if (!raw || typeof raw !== 'object') return null;
  const dto = raw as Record<string, unknown>;
  const id = Number(dto.id);
  const name = String(dto.name ?? '').trim();
  if (!Number.isFinite(id) || !name) return null;

  const createdAt = String(
    dto.created_at ?? dto.createdAt ?? new Date().toISOString(),
  );
  const slugRaw = dto.slug;
  const slug =
    typeof slugRaw === 'string' && slugRaw.trim()
      ? slugRaw.trim()
      : name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  return {
    id,
    name,
    slug,
    order: Number(dto.order) || 0,
    is_active: dto.is_active !== false && dto.isActive !== false,
    created_at: createdAt,
    updated_at: String(dto.updated_at ?? dto.updatedAt ?? createdAt),
  };
}

export function coerceForumInterestList(
  raw: unknown,
): PaginatedList<ForumInterest> {
  if (Array.isArray(raw)) {
    const results = raw
      .map((row) => coerceForumInterest(row))
      .filter((row): row is ForumInterest => row != null);
    return { count: results.length, next: null, previous: null, results };
  }
  if (!raw || typeof raw !== 'object') {
    return { count: 0, next: null, previous: null, results: [] };
  }
  const dto = raw as Record<string, unknown>;
  const rows = Array.isArray(dto.results) ? dto.results : [];
  const results = rows
    .map((row) => coerceForumInterest(row))
    .filter((row): row is ForumInterest => row != null);
  return {
    count: Number(dto.count) || results.length,
    next: typeof dto.next === 'string' ? dto.next : null,
    previous: typeof dto.previous === 'string' ? dto.previous : null,
    results,
  };
}
