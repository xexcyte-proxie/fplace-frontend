import type { RouteCoordinate } from '../types';
import { computeGeometryHash } from '../routing/geometry-hash-service';

/** WGS84 mean Earth radius - matches AR geo-math.js */
export const EARTH_RADIUS_M = 6371000;
const MIN_COS_LAT = 0.01;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function normalizeDegrees(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Great-circle distance between two WGS84 points (meters). */
export function haversineMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Initial bearing from `from` to `to` (degrees, 0 = north, clockwise). */
export function bearingDegrees(from: RouteCoordinate, to: RouteCoordinate): number {
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const dLng = toRad(to.longitude - from.longitude);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return normalizeDegrees(toDeg(Math.atan2(y, x)));
}

/**
 * Equirectangular local offset from ref → p in meters (SLAM/Three.js axes).
 * x = east, z = south.
 */
export function geoToLocalMeters(
  ref: { latitude: number; longitude: number },
  p: { latitude: number; longitude: number },
): { x: number; z: number } {
  const lat0 = ref.latitude;
  const lng0 = ref.longitude;
  const lat1 = p.latitude;
  const lng1 = p.longitude;

  const dLatRad = toRad(lat1 - lat0);
  const dLngRad = toRad(lng1 - lng0);
  const cosMid = Math.cos((toRad(lat0) + toRad(lat1)) / 2);

  return {
    x: dLngRad * EARTH_RADIUS_M * Math.max(Math.abs(cosMid), MIN_COS_LAT),
    z: -(dLatRad * EARTH_RADIUS_M),
  };
}

export function isVerticalConnector(a: RouteCoordinate, b: RouteCoordinate): boolean {
  return !!(a.floorId && b.floorId && a.floorId !== b.floorId);
}

/** Horizontal segment length - zero for inter-floor connectors. */
export function segmentHorizontalMeters(a: RouteCoordinate, b: RouteCoordinate): number {
  if (isVerticalConnector(a, b)) return 0;
  return haversineMeters(a, b);
}

export function pathGeometryHash(path: RouteCoordinate[]): string {
  return computeGeometryHash({ pathCoordinates: path });
}
