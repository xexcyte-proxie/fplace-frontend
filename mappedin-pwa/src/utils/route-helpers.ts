import type { Directions } from '@mappedin/mappedin-js';

import type { FloorInfo, RouteCoordinate, RouteLeg, RoutePayload, RouteStep } from '../types';

export function haversineMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function coordLatLng(target: unknown): { lat: number; lng: number } | null {
  if (!target || typeof target !== 'object') return null;
  const t = target as Record<string, unknown>;
  const lat = Number(t.latitude ?? (t.center as Record<string, unknown>)?.latitude);
  const lng = Number(t.longitude ?? (t.center as Record<string, unknown>)?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function serializeCoordinate(target: unknown): RouteCoordinate | null {
  const ll = coordLatLng(target);
  if (!ll) return null;
  const t = target as Record<string, unknown>;
  const floor = t.floor as Record<string, unknown> | string | undefined;
  const floorId =
    typeof floor === 'object' && floor?.id != null
      ? String(floor.id)
      : floor != null
        ? String(floor)
        : undefined;
  return { latitude: ll.lat, longitude: ll.lng, floorId };
}

export function serializePathCoordinates(coords: unknown[] | undefined): RouteCoordinate[] {
  if (!Array.isArray(coords)) return [];
  return coords
    .map((c) => serializeCoordinate(c))
    .filter((c): c is RouteCoordinate => c != null);
}

function instructionText(instruction: {
  action?: { type?: string; bearing?: string };
  distance?: number;
}): string {
  const action = instruction.action;
  if (!action) return 'Continue';
  const bearing = action.bearing ? ` ${action.bearing}` : '';
  const distance =
    instruction.distance != null ? ` in ${Math.round(instruction.distance)} m` : '';
  return `${action.type || 'Continue'}${bearing}${distance}`;
}

function instructionStep(instruction: {
  action?: { type?: string; bearing?: string };
  distance?: number;
}): RouteStep {
  return {
    instruction: instructionText(instruction),
    actionType: instruction.action?.type,
    bearing: instruction.action?.bearing,
    distanceMeters: instruction.distance,
  };
}

export function buildLegs(instructions: Directions['instructions'] | undefined): RouteLeg[] {
  if (!instructions?.length) {
    return [{ index: 0, steps: [{ instruction: 'Continue' }] }];
  }

  const legs: RouteLeg[] = [];
  let current: RouteStep[] = [];

  for (const instruction of instructions) {
    current.push(instructionStep(instruction));
    const type = instruction.action?.type?.toLowerCase() ?? '';
    if (type.includes('connection')) {
      legs.push({ index: legs.length, steps: [...current] });
      current = [];
    }
  }

  if (current.length) {
    legs.push({ index: legs.length, steps: current });
  }

  return legs.length
    ? legs
    : [{ index: 0, steps: instructions.map((i) => instructionStep(i)) }];
}

export function buildRoutePayload(
  directions: Directions,
  destinationName: string,
  mapId: string,
  origin?: unknown,
  destination?: unknown,
): RoutePayload {
  const legs = buildLegs(directions.instructions);
  const pathCoordinates = serializePathCoordinates(directions.coordinates as unknown[]);
  const maneuvers: RouteStep[] = [];

  for (const leg of legs) {
    leg.steps.forEach((step, stepIndex) => {
      maneuvers.push({ ...step, legIndex: leg.index, stepIndex });
    });
  }

  return {
    legs,
    destinationName,
    pathCoordinates,
    maneuvers,
    distanceMeters: directions.distance ?? null,
    durationSeconds:
      directions.distance != null && Number.isFinite(directions.distance)
        ? directions.distance / 1.4
        : null,
    origin: serializeCoordinate(origin) ?? pathCoordinates[0] ?? null,
    destination:
      serializeCoordinate(destination) ??
      pathCoordinates[pathCoordinates.length - 1] ??
      null,
    mapId,
  };
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
): Record<string, unknown> {
  return {
    type: 'route_update',
    legCount: route.legs.length,
    currentLegIndex,
    instructions,
    destinationName: route.destinationName ?? 'Destination',
    distanceMeters: route.distanceMeters,
    durationSeconds: route.durationSeconds,
    mapId: route.mapId,
    origin: route.origin,
    destination: route.destination,
    pathCoordinates: route.pathCoordinates,
    maneuvers: route.maneuvers,
    legs: route.legs,
    positioningMode: 'mappedin',
    floors: floors ?? [],
    ...(userPosition ? { userPosition } : {}),
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

export function encodeRouteForAr(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  return `#route=${base64UrlEncode(json)}`;
}

export function buildArRoutePayload(
  route: RoutePayload,
  currentLegIndex: number,
  instructions: string,
  userPosition?: RouteCoordinate | null,
  floors?: FloorInfo[],
): Record<string, unknown> {
  return toArPayload(route, currentLegIndex, instructions, userPosition, floors);
}
