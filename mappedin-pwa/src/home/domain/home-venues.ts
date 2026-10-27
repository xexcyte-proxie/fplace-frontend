/**
 * Split the venue catalog into recents (visit order, newest first) and
 * everything else.
 */
export function partitionHomeVenues<T extends { id: number | string }>(
  venues: readonly T[],
  visitedIds: readonly string[],
): { recentlyVisited: T[]; otherVenues: T[] } {
  const byId = new Map(venues.map((venue) => [String(venue.id), venue]));
  const seen = new Set<string>();
  const recentlyVisited: T[] = [];

  for (const rawId of [...visitedIds].reverse()) {
    const id = rawId.trim();
    if (!id || seen.has(id)) continue;
    const venue = byId.get(id);
    if (!venue) continue;
    seen.add(id);
    recentlyVisited.push(venue);
  }

  return {
    recentlyVisited,
    otherVenues: venues.filter((venue) => !seen.has(String(venue.id))),
  };
}

/** Display venue names alphabetically from Z to A without mutating the catalog. */
export function sortVenuesByNameDescending<T extends { name: string }>(
  venues: readonly T[],
): T[] {
  return [...venues].sort((a, b) =>
    b.name.trim().localeCompare(a.name.trim(), 'en', { sensitivity: 'base' }),
  );
}
