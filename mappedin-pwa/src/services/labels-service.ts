import type { MapData, MapView } from '@mappedin/mappedin-js';

import { appLog } from '../utils/logger';

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

/**
 * Mappedin does not show store/room names automatically — labels must be added
 * via mapView.Labels (same as the Flutter embedded map).
 */
export function addLocationLabels(mapView: MapView, mapData: MapData): number {
  if (!mapView.Labels?.add) return 0;

  let count = 0;
  const labeledSpaceIds = new Set<string>();

  const addLabel = (
    target: unknown,
    text: string | undefined,
    options: Record<string, unknown> = {},
  ): void => {
    if (!target || !text?.trim()) return;
    const spaceId =
      typeof target === 'object' && target && 'id' in target
        ? String((target as { id: string }).id)
        : '';
    if (spaceId && labeledSpaceIds.has(spaceId)) return;

    try {
      mapView.Labels.add(target as never, text.trim(), {
        interactive: true,
        rank: 'medium',
        ...options,
      });
      if (spaceId) labeledSpaceIds.add(spaceId);
      count++;
    } catch (error) {
      appLog(
        'Labels',
        `Failed: ${text}`,
        error instanceof Error ? error.message : error,
      );
    }
  };

  const profiles = mapData.getByType('location-profile');
  appLog('Labels', `location-profile count: ${profiles.length}`);

  for (const profile of profiles) {
    const anchor = profileAnchor(mapData, profile as { spaces?: unknown[]; points?: unknown[]; mapObjects?: unknown[] });
    if (anchor) {
      addLabel(anchor, profile.name, { rank: 'high' });
    }
  }

  if ((mapData as { isEnterpriseMode?: boolean }).isEnterpriseMode) {
    for (const location of mapData.getByType('enterprise-location')) {
      const spaces = (location as { spaces?: unknown[] }).spaces ?? [];
      const anchor =
        spaces
          .map((entry) => resolveSpaceRef(mapData, entry))
          .find(Boolean) ?? location;
      addLabel(anchor, location.name, { rank: 'high' });
    }
  }

  for (const space of mapData.getByType('space')) {
    if (!space.name || labeledSpaceIds.has(space.id)) continue;
    addLabel(space, space.name);
  }

  appLog('Labels', `Added ${count} label(s)`);
  return count;
}

export function scheduleLocationLabels(
  mapView: MapView,
  mapData: MapData,
): void {
  window.setTimeout(() => {
    try {
      addLocationLabels(mapView, mapData);
    } catch (error) {
      appLog('Labels', 'Label pass failed', error);
    }
  }, 0);
}
