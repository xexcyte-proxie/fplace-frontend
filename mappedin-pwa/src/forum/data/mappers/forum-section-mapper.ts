import type { ForumSection, PaginatedList } from '../../domain/entities';

function optionalMappedinLocationId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/**
 * Normalize section JSON from GET /api/forum/sections/.
 */
export function coerceForumSection(raw: unknown): ForumSection | null {
  if (!raw || typeof raw !== 'object') return null;
  const dto = raw as Record<string, unknown>;
  const id = Number(dto.id);
  const venue = Number(dto.venue);
  const name = String(dto.name ?? '').trim();
  if (!Number.isFinite(id) || !Number.isFinite(venue) || !name) return null;

  const createdAt = String(
    dto.created_at ?? dto.createdAt ?? new Date().toISOString(),
  );
  return {
    id,
    venue,
    name,
    code: String(dto.code ?? '').trim(),
    is_active: dto.is_active !== false && dto.isActive !== false,
    mappedin_location_id: optionalMappedinLocationId(
      dto.mappedin_location_id ?? dto.mappedinLocationId,
    ),
    created_at: createdAt,
    updated_at: String(dto.updated_at ?? dto.updatedAt ?? createdAt),
  };
}

export function coerceForumSectionList(
  raw: unknown,
): PaginatedList<ForumSection> {
  if (Array.isArray(raw)) {
    const results = raw
      .map((row) => coerceForumSection(row))
      .filter((row): row is ForumSection => row != null);
    return { count: results.length, next: null, previous: null, results };
  }
  if (!raw || typeof raw !== 'object') {
    return { count: 0, next: null, previous: null, results: [] };
  }
  const dto = raw as Record<string, unknown>;
  const rows = Array.isArray(dto.results) ? dto.results : [];
  const results = rows
    .map((row) => coerceForumSection(row))
    .filter((row): row is ForumSection => row != null);
  return {
    count: Number(dto.count) || results.length,
    next: typeof dto.next === 'string' ? dto.next : null,
    previous: typeof dto.previous === 'string' ? dto.previous : null,
    results,
  };
}
