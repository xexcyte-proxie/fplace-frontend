/**
 * Map taps raycast 3D booth roofs before the floor. Snap to the walkable
 * node network so start/end pins sit in corridors, not on furniture tops.
 *
 * Keep this tight: a large radius pulls the pin to a distant corridor node
 * and feels like the tap landed somewhere else entirely.
 */
export const MAP_TAP_SNAP_MAX_METERS = 6;

export type NearestSnapHit<T> = {
  distance: number;
  feature: T;
};

/** First hit within maxDistance, or null. */
export function pickNearestSnapFeature<T>(
  results: NearestSnapHit<T>[] | null | undefined,
  maxDistanceM: number = MAP_TAP_SNAP_MAX_METERS,
): T | null {
  const best = results?.[0];
  if (!best || !Number.isFinite(best.distance)) return null;
  if (best.distance < 0 || best.distance > maxDistanceM) return null;
  return best.feature;
}
