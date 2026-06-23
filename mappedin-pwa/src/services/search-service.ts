import type { MapData } from '@mappedin/mappedin-js';

import type { LocationResult } from '../types';
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
