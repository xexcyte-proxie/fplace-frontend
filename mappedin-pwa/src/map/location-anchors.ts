import type { MapData } from '@mappedin/mappedin-js';

export interface LocationAnchor {
  id: string;
  name: string;
  anchor: unknown;
}

function resolveSpaceRef(mapData: MapData, ref: unknown): unknown {
  if (!ref) return null;
  if (typeof ref === 'object' && ref && 'id' in ref) return ref;
  if (typeof ref === 'string') return mapData.getById('space', ref) ?? null;
  return null;
}

function profileAnchor(
  mapData: MapData,
  profile: {
    spaces?: unknown[];
    points?: unknown[];
    mapObjects?: unknown[];
  },
): unknown {
  const spaces = profile.spaces ?? [];
  if (spaces.length) return resolveSpaceRef(mapData, spaces[0]);
  const points = profile.points ?? [];
  if (points.length) return points[0];
  const objects = profile.mapObjects ?? [];
  if (objects.length) return objects[0];
  return null;
}

function anchorId(target: unknown, fallback: string): string {
  if (typeof target === 'object' && target && 'id' in target) {
    return String((target as { id: string }).id);
  }
  return fallback;
}

/** Collects the same map anchors previously used for text labels. */
export function collectLocationAnchors(mapData: MapData): LocationAnchor[] {
  const entries: LocationAnchor[] = [];
  const seenSpaceIds = new Set<string>();

  const push = (target: unknown, name: string | undefined, idHint: string): void => {
    if (!target || !name?.trim()) return;
    const spaceId = anchorId(target, idHint);
    if (seenSpaceIds.has(spaceId)) return;
    seenSpaceIds.add(spaceId);
    entries.push({ id: spaceId, name: name.trim(), anchor: target });
  };

  for (const profile of mapData.getByType('location-profile')) {
    const typed = profile as {
      id: string;
      name?: string;
      spaces?: unknown[];
      points?: unknown[];
      mapObjects?: unknown[];
    };
    const anchor = profileAnchor(mapData, typed);
    if (anchor) push(anchor, typed.name, typed.id);
  }

  if ((mapData as { isEnterpriseMode?: boolean }).isEnterpriseMode) {
    for (const location of mapData.getByType('enterprise-location')) {
      const typed = location as { id: string; name?: string; spaces?: unknown[] };
      const spaces = typed.spaces ?? [];
      const anchor =
        spaces.map((entry) => resolveSpaceRef(mapData, entry)).find(Boolean) ??
        location;
      push(anchor, typed.name, typed.id);
    }
  }

  for (const space of mapData.getByType('space')) {
    if (!space.name || seenSpaceIds.has(space.id)) continue;
    push(space, space.name, space.id);
  }

  return entries;
}

export function slugifyLocationName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
