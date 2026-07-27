import { WALKING_SPEED_MPS } from './constants';

/** Ignore tiny GPS/snap jitter when adding off-route distance to the ETA. */
const OFF_ROUTE_ETA_THRESHOLD_M = 4;

/**
 * Live remaining walk distance: unfinished path + distance to get back on route.
 * Walking backward along the path increases path remaining; walking away increases off-route.
 */
export function computeLiveRemainingMeters(options: {
  totalPathMeters: number;
  alongPathMeters: number;
  offRouteMeters?: number | null;
  offRouteThresholdMeters?: number;
}): number {
  const total = Math.max(0, options.totalPathMeters);
  const along = Math.max(0, Math.min(total, options.alongPathMeters));
  const pathRemaining = Math.max(0, total - along);
  const off = options.offRouteMeters ?? 0;
  const threshold = options.offRouteThresholdMeters ?? OFF_ROUTE_ETA_THRESHOLD_M;
  const effectiveOff = Number.isFinite(off) && off > threshold ? off : 0;
  return pathRemaining + effectiveOff;
}

/**
 * ETA from live remaining meters, scaled to the route's original pace when available
 * (so a 2‑minute route grows past 2 minutes if the user goes the wrong way).
 */
export function estimateLiveWalkSeconds(options: {
  remainingMeters: number | null | undefined;
  totalPathMeters?: number | null;
  routeDurationSeconds?: number | null;
}): number | null {
  const remaining = options.remainingMeters;
  if (remaining == null || !Number.isFinite(remaining)) return null;
  if (remaining <= 0) return 0;

  const total = options.totalPathMeters;
  const duration = options.routeDurationSeconds;
  if (
    total != null &&
    total > 0 &&
    duration != null &&
    Number.isFinite(duration) &&
    duration > 0
  ) {
    return remaining * (duration / total);
  }

  return remaining / WALKING_SPEED_MPS;
}
