import type { Directions } from '@mappedin/mappedin-js';

import type { NavigationProgressSnapshot } from '../position/types';
import { buildProductionRoutePayload } from '../routing/build-route-payload';
import { computeGeometryHash } from '../routing/geometry-hash-service';
import { ensurePathFloorIds } from '../routing/floor-propagation-engine';
import { routeLifecycleManager } from '../routing/route-lifecycle-manager';
import { buildIntelligentLegs } from '../routing/route-leg-builder';
import type { FloorInfo, RouteCoordinate, RouteLeg, RoutePayload } from '../types';

import { coordinateTransformationService } from '../routing/coordinate-transformation-service';

export { haversineMeters } from './geo-math';

export { computeGeometryHash, pathGeometryHash } from '../routing/geometry-hash-service';

export function coordLatLng(target: unknown): { lat: number; lng: number } | null {
  if (!target || typeof target !== 'object') return null;
  const t = target as Record<string, unknown>;
  const lat = Number(t.latitude ?? (t.center as Record<string, unknown>)?.latitude);
  const lng = Number(t.longitude ?? (t.center as Record<string, unknown>)?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function serializeCoordinate(target: unknown): RouteCoordinate | null {
  return coordinateTransformationService.serializeCoordinate(target);
}

export function serializePathCoordinates(coords: unknown[] | undefined): RouteCoordinate[] {
  return coordinateTransformationService.serializePathCoordinates(coords);
}

/** @deprecated Use buildProductionRoutePayload — kept for backward compatibility. */
export function buildLegs(instructions: Directions['instructions'] | undefined): RouteLeg[] {
  return buildIntelligentLegs(instructions, [], 'legacy');
}

export function buildRoutePayload(
  directions: Directions,
  destinationName: string,
  mapId: string,
  origin?: unknown,
  destination?: unknown,
): RoutePayload {
  return buildProductionRoutePayload(directions, {
    destinationName,
    mapId,
    origin,
    destination,
  });
}

export function legInstructions(leg: RouteLeg | undefined): string {
  if (!leg?.steps.length) return 'Follow the path';
  return leg.steps.map((s) => s.instruction).join(', ');
}

export function toArPayload(
  route: RoutePayload,
  currentLegIndex: number,
  instructions: string,
  userPosition?: RouteCoordinate | null,
  floors?: FloorInfo[],
  navigationProgress?: NavigationProgressSnapshot | null,
): Record<string, unknown> {
  const { path: pathCoordinates } = ensurePathFloorIds(route.pathCoordinates, {
    originFloorId: route.origin?.floorId,
    destinationFloorId: route.destination?.floorId,
    legs: route.legs,
    maneuvers: route.maneuvers,
  });

  const geometryHash = route.geometryHash || computeGeometryHash({
    pathCoordinates,
    legs: route.legs,
    maneuvers: route.maneuvers,
    routeVersion: route.routeVersion,
    generatedAt: route.generatedAt,
  });

  return {
    type: 'route_update',
    legCount: route.legs.length,
    currentLegIndex,
    instructions,
    destinationName: route.destinationName ?? 'Destination',
    ...(route.destinationFloorName
      ? { destinationFloorName: route.destinationFloorName }
      : {}),
    ...(route.destinationAreaHint
      ? { destinationAreaHint: route.destinationAreaHint }
      : {}),
    distanceMeters: route.distanceMeters,
    durationSeconds: route.durationSeconds,
    mapId: route.mapId,
    routeId: route.routeId,
    routeVersion: route.routeVersion,
    generatedAt: route.generatedAt,
    updatedAt: route.updatedAt ?? route.generatedAt,
    geometryHash,
    checksum: route.checksum,
    mapVersion: route.mapVersion ?? route.mapId,
    venueId: route.venueId ?? route.mapId,
    routingEngineVersion: route.routingEngineVersion,
    pathHash: geometryHash,
    origin: route.origin,
    destination: route.destination,
    pathCoordinates,
    maneuvers: route.maneuvers,
    legs: route.legs,
    positioningMode: 'mappedin',
    navigationMode: route.navigationMode ?? 'walk',
    floors: floors ?? [],
    lifecycle: route.lifecycle ?? routeLifecycleManager.get(),
    ...(route.floorTransitions?.length
      ? { floorTransitions: route.floorTransitions }
      : {}),
    ...(userPosition ? { userPosition } : {}),
    ...(navigationProgress ? { navigationProgress } : {}),
  };
}

function base64UrlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Max URL hash length — large routes must use bridge/session transport. */
const MAX_ROUTE_HASH_CHARS = 1800;

export function encodeRouteForAr(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  if (json.length > MAX_ROUTE_HASH_CHARS) {
    return '';
  }
  return `#route=${base64UrlEncode(json)}`;
}

export function buildArRoutePayload(
  route: RoutePayload,
  currentLegIndex: number,
  instructions: string,
  userPosition?: RouteCoordinate | null,
  floors?: FloorInfo[],
  navigationProgress?: NavigationProgressSnapshot | null,
): Record<string, unknown> {
  return toArPayload(
    route,
    currentLegIndex,
    instructions,
    userPosition,
    floors,
    navigationProgress,
  );
}
