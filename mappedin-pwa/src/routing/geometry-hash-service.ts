import type { RouteCoordinate, RouteLeg, RouteStep } from '../types';

/**
 * Deterministic geometry fingerprint over the full route polyline,
 * floor assignments, legs, and maneuvers. Used for deduplication -
 * only truly identical routes share the same hash.
 */
export function computeGeometryHash(input: {
  pathCoordinates: RouteCoordinate[];
  legs?: RouteLeg[];
  maneuvers?: RouteStep[];
  routeVersion?: number;
  generatedAt?: number;
}): string {
  const { pathCoordinates, legs = [], maneuvers = [], routeVersion, generatedAt } = input;
  let hash = 2166136261; // FNV-1a offset basis

  const mix = (value: number) => {
    hash ^= value;
    hash = Math.imul(hash, 16777619);
  };

  mix(pathCoordinates.length);
  for (const p of pathCoordinates) {
    mix(Math.round(p.latitude * 1e7));
    mix(Math.round(p.longitude * 1e7));
    const floor = p.floorId ?? '';
    for (let i = 0; i < floor.length; i++) mix(floor.charCodeAt(i));
    if (p.legId) {
      for (let i = 0; i < p.legId.length; i++) mix(p.legId.charCodeAt(i));
    }
    if (p.segmentIndex != null) mix(p.segmentIndex);
    if (p.distanceAlongRoute != null) mix(Math.round(p.distanceAlongRoute * 100));
  }

  mix(legs.length);
  for (const leg of legs) {
    mix(leg.index);
    const floor = leg.floorId ?? '';
    for (let i = 0; i < floor.length; i++) mix(floor.charCodeAt(i));
    mix(leg.startIndex);
    mix(leg.endIndex);
    mix(Math.round((leg.distanceMeters ?? 0) * 100));
    const kind = leg.transitionType ?? '';
    for (let i = 0; i < kind.length; i++) mix(kind.charCodeAt(i));
    mix(leg.steps.length);
  }

  mix(maneuvers.length);
  for (const m of maneuvers) {
    const text = `${m.instruction ?? ''}|${m.actionType ?? ''}|${m.legIndex ?? ''}|${m.stepIndex ?? ''}`;
    for (let i = 0; i < text.length; i++) mix(text.charCodeAt(i));
    if (m.distanceMeters != null) mix(Math.round(m.distanceMeters * 100));
  }

  if (routeVersion != null) mix(routeVersion);
  if (generatedAt != null) mix(Math.floor(generatedAt / 1000));

  return (hash >>> 0).toString(36);
}

/** Payload checksum - geometry hash plus identity fields for transport integrity. */
export function computeRouteChecksum(input: {
  routeId: string;
  routeVersion: number;
  geometryHash: string;
  generatedAt: number;
  pathLength: number;
}): string {
  const raw = [
    input.routeId,
    input.routeVersion,
    input.geometryHash,
    input.generatedAt,
    input.pathLength,
  ].join(':');
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/** @deprecated Use computeGeometryHash - kept for callers expecting path-only hash. */
export function pathGeometryHash(path: RouteCoordinate[]): string {
  return computeGeometryHash({ pathCoordinates: path });
}
