import type { MapData } from '@mappedin/mappedin-js';

import type { LocationResult, SearchChip } from '../types';
import { appLog } from '../utils/logger';
import { coordLatLng, serializeCoordinate } from '../utils/route-helpers';

function floorName(mapData: MapData, floorRef: unknown): string | undefined {
  if (!floorRef) return undefined;
  const id = typeof floorRef === 'object' && floorRef && 'id' in floorRef
    ? String((floorRef as { id: string }).id)
    : String(floorRef);
  const floor = mapData.getById('floor', id);
  return floor?.name ?? id;
}

function locationFromEntity(
  mapData: MapData,
  item: { id: string; name?: string; floor?: unknown; center?: unknown },
): LocationResult {
  const serialized = serializeCoordinate(item);
  return {
    id: item.id,
    name: item.name ?? 'Unknown',
    floorId: serialized?.floorId,
    floorName: floorName(mapData, item.floor),
    latitude: serialized?.latitude,
    longitude: serialized?.longitude,
  };
}

function profileAnchor(profile: {
  spaces?: unknown[];
  points?: unknown[];
  mapObjects?: unknown[];
}): unknown {
  const spaces = profile.spaces ?? [];
  if (spaces.length) return spaces[0];
  const points = profile.points ?? [];
  if (points.length) return points[0];
  const objects = profile.mapObjects ?? [];
  if (objects.length) return objects[0];
  return null;
}

const CHIP_TAG_COLORS: Record<string, string> = {
  food: '#f97316',
  'food stall': '#f97316',
  retail: '#2d4a7a',
  store: '#2d4a7a',
  entrance: '#22c55e',
  restroom: '#a855f7',
  washroom: '#a855f7',
  bathroom: '#a855f7',
};

const CHIP_DEFAULT_COLORS = [
  '#f97316',
  '#2d4a7a',
  '#22c55e',
  '#a855f7',
  '#ec4899',
  '#06b6d4',
];

function formatChipLabel(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Strip trailing unit numbers/letters so "Food Stall 100" groups as "food stall". */
function locationGroupKey(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';

  const numbered = trimmed.match(/^(.+?)\s*#?\s*\d+[A-Za-z]?$/i);
  if (numbered?.[1]) return numbered[1].trim().toLowerCase();

  const lettered = trimmed.match(/^(.+?)\s+[A-Z]$/i);
  if (lettered?.[1]) return lettered[1].trim().toLowerCase();

  const dashed = trimmed.match(/^(.+?)[\s_-]+\d+[A-Za-z]?$/i);
  if (dashed?.[1]) return dashed[1].trim().toLowerCase();

  return trimmed.toLowerCase();
}

function collectNamedLocations(mapData: MapData): string[] {
  const names: string[] = [];
  const seen = new Set<string>();

  const addName = (name?: string) => {
    const trimmed = (name ?? '').trim();
    if (trimmed.length < 2) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    names.push(trimmed);
  };

  for (const profile of mapData.getByType('location-profile')) {
    addName(profile.name);
  }
  for (const location of mapData.getByType('enterprise-location')) {
    addName(location.name);
  }
  for (const space of mapData.getByType('space')) {
    addName(space.name);
  }

  return names.sort((a, b) => a.localeCompare(b));
}

function buildConsolidatedChips(
  names: string[],
  tagCounts: Map<string, number>,
  limit: number,
): SearchChip[] {
  const groups = new Map<string, { label: string; count: number }>();

  const addGroup = (key: string, weight = 1) => {
    if (!key) return;
    const label = formatChipLabel(key);
    const entry = groups.get(key);
    if (entry) entry.count += weight;
    else groups.set(key, { label, count: weight });
  };

  for (const name of names) {
    addGroup(locationGroupKey(name));
  }

  for (const [tag, count] of tagCounts) {
    addGroup(tag, count);
  }

  return [...groups.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[1].label.localeCompare(b[1].label))
    .slice(0, limit)
    .map(([id, { label }], index) => ({
      id,
      label,
      color: CHIP_TAG_COLORS[id] ?? CHIP_DEFAULT_COLORS[index % CHIP_DEFAULT_COLORS.length],
    }));
}

export function getLocationChips(mapData: MapData, limit = 12): SearchChip[] {
  const tagCounts = new Map<string, number>();

  for (const profile of mapData.getByType('location-profile')) {
    for (const tag of (profile as { searchTags?: string[] }).searchTags ?? []) {
      const normalized = tag.trim().toLowerCase();
      if (!normalized) continue;
      tagCounts.set(normalized, (tagCounts.get(normalized) ?? 0) + 1);
    }
  }

  const names = collectNamedLocations(mapData);
  return buildConsolidatedChips(names, tagCounts, limit);
}

export async function searchVenue(
  mapData: MapData,
  query: string,
  limit = 30,
): Promise<LocationResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  try {
    const search = (mapData as { Search?: { enable?: () => Promise<void>; query?: (...args: unknown[]) => Promise<unknown> } }).Search;
    if (search?.enable && search.query) {
      await search.enable();
      const results = (await search.query(trimmed, {
        places: { limit },
        enterpriseLocations: { limit },
        locationProfiles: { limit },
      })) as {
        places?: Array<{ item?: { id: string; name?: string; floor?: unknown } }>;
        enterpriseLocations?: Array<{ item?: { id: string; name?: string; floor?: unknown } }>;
        locationProfiles?: Array<{ item?: { id: string; name?: string; floor?: unknown } }>;
      };

      const locations: LocationResult[] = [];
      for (const group of [
        results.places,
        results.enterpriseLocations,
        results.locationProfiles,
      ]) {
        if (!Array.isArray(group)) continue;
        for (const entry of group) {
          const item = entry?.item;
          if (!item?.id) continue;
          locations.push(locationFromEntity(mapData, item));
        }
      }
      if (locations.length) {
        appLog('Search', `API returned ${locations.length} result(s)`);
        return locations.slice(0, limit);
      }
    }
  } catch (error) {
    appLog('Search', 'Search API unavailable — using filter fallback', error);
  }

  const lower = trimmed.toLowerCase();
  const locations: LocationResult[] = [];

  for (const profile of mapData.getByType('location-profile')) {
    const name = (profile.name ?? '').toLowerCase();
    const tags = ((profile as { searchTags?: string[] }).searchTags ?? [])
      .join(' ')
      .toLowerCase();
    if (!name.includes(lower) && !tags.includes(lower)) continue;
    const anchor = profileAnchor(profile as { spaces?: unknown[]; points?: unknown[]; mapObjects?: unknown[] });
    const ll = coordLatLng(anchor ?? profile);
    locations.push({
      id: profile.id,
      name: profile.name ?? 'Unknown',
      floorName: floorName(mapData, (profile as { floor?: unknown }).floor),
      latitude: ll?.lat,
      longitude: ll?.lng,
    });
  }

  for (const space of mapData.getByType('space')) {
    if (!(space.name ?? '').toLowerCase().includes(lower)) continue;
    if (locations.some((l) => l.id === space.id)) continue;
    const serialized = serializeCoordinate(space);
    locations.push({
      id: space.id,
      name: space.name ?? 'Unknown',
      floorId: serialized?.floorId,
      floorName: floorName(mapData, space.floor),
      latitude: serialized?.latitude,
      longitude: serialized?.longitude,
    });
  }

  return locations.slice(0, limit);
}

export function resolveMapTarget(mapData: MapData, locationId: string): unknown {
  return (
    mapData.getById('space', locationId) ??
    mapData.getById('location-profile', locationId) ??
    mapData.getById('object', locationId) ??
    null
  );
}
