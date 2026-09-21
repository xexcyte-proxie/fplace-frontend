import type { LocationMessage } from '../../domain/entities';

/**
 * Normalize location conversation JSON from REST or WebSocket payloads.
 */
export function coerceLocationMessage(raw: unknown): LocationMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const dto = raw as Record<string, unknown>;
  const nested =
    extractObject(dto, ['message', 'payload', 'data']) ?? dto;

  const userRaw = nested.user;
  if (!userRaw || typeof userRaw !== 'object') return null;
  const user = userRaw as Record<string, unknown>;

  const id = Number(nested.id);
  const venue = Number(nested.venue);
  const locationId = String(
    nested.location_id ?? nested.locationId ?? '',
  ).trim();
  const userId = Number(user.id);
  if (
    !Number.isFinite(id) ||
    !Number.isFinite(venue) ||
    !locationId ||
    !Number.isFinite(userId)
  ) {
    return null;
  }

  const createdAt = String(
    nested.created_at ?? nested.createdAt ?? '',
  );

  return {
    id,
    venue,
    location_id: locationId,
    location_name: String(
      nested.location_name ?? nested.locationName ?? '',
    ).trim(),
    user: {
      id: userId,
      display_name: String(
        user.display_name ?? user.displayName ?? 'Guest',
      ),
    },
    content: String(nested.content ?? ''),
    created_at: createdAt,
    updated_at: String(
      nested.updated_at ?? nested.updatedAt ?? createdAt,
    ),
  };
}

export function coerceLocationMessageList(raw: unknown): {
  count: number;
  next: string | null;
  previous: string | null;
  results: LocationMessage[];
} {
  if (!raw || typeof raw !== 'object') {
    return { count: 0, next: null, previous: null, results: [] };
  }
  const dto = raw as Record<string, unknown>;
  const rows = Array.isArray(dto.results) ? dto.results : [];
  const results = rows
    .map((row) => coerceLocationMessage(row))
    .filter((row): row is LocationMessage => row != null);
  return {
    count: Number(dto.count) || results.length,
    next: typeof dto.next === 'string' ? dto.next : null,
    previous: typeof dto.previous === 'string' ? dto.previous : null,
    results,
  };
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
