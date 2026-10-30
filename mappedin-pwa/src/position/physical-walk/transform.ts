/** Bounded, north-preserving local tangent approximation. No map mutation. */
export interface GeoPoint { latitude: number; longitude: number }
export interface Displacement { east: number; north: number }
const R = 6371000;
const RAD = Math.PI / 180;
export const MAX_DISPLACEMENT_M = 1000;
export function validatePoint(p: GeoPoint): void {
  if (!Number.isFinite(p.latitude) || Math.abs(p.latitude) > 80 ||
      !Number.isFinite(p.longitude) || Math.abs(p.longitude) > 180) {
    throw new Error('Invalid or unsupported geographic point');
  }
}
export function displacement(origin: GeoPoint, point: GeoPoint): Displacement {
  validatePoint(origin); validatePoint(point);
  const deltaLng = ((point.longitude - origin.longitude + 540) % 360) - 180;
  const result = {
    east: R * Math.cos(origin.latitude * RAD) * deltaLng * RAD,
    north: R * (point.latitude - origin.latitude) * RAD,
  };
  if (Math.hypot(result.east, result.north) > MAX_DISPLACEMENT_M) {
    throw new Error('Physical walk exceeds 1000 metre session radius');
  }
  return result;
}
export function offset(anchor: GeoPoint, delta: Displacement): GeoPoint {
  validatePoint(anchor);
  if (!Number.isFinite(delta.east) || !Number.isFinite(delta.north) ||
      Math.hypot(delta.east, delta.north) > MAX_DISPLACEMENT_M) throw new Error('Invalid displacement');
  const latitude = anchor.latitude + delta.north / R / RAD;
  const longitude = ((anchor.longitude + delta.east / (R * Math.cos(anchor.latitude * RAD)) / RAD + 540) % 360) - 180;
  const result = { latitude, longitude };
  validatePoint(result);
  return result;
}
