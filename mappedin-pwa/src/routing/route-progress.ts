import { WALKING_SPEED_MPS } from './constants';

/** Ignore tiny GPS/snap jitter when adding off-route distance to the ETA. */
const OFF_ROUTE_ETA_THRESHOLD_M = 4;

/** Close enough to the path end to count as arrived. */
export const ARRIVAL_ALONG_PATH_TOLERANCE_M = 0.75;

/** Still counts as arrived only when not far off the route. */
export const ARRIVAL_OFF_ROUTE_MAX_M = 4;

/** Show the destination pin only when the remaining walk is this close. */
export const DESTINATION_MARKER_REVEAL_M = 20;

/** Ignore sub-step along-path wiggles from heading-only frames and snap noise. */
const ALONG_PATH_JITTER_M = 0.85;

/** Below this along-path rate the user is treated as standing still. */
const STATIONARY_ALONG_MPS = 0.28;

/** Cap how fast remaining can fall so a noisy fix cannot sprint the odometer. */
const MAX_WALK_MPS = 2.4;

/** Faster than a sprint along the polyline: indoor GPS jump, not a step. */
const GPS_JUMP_MPS = 3.5;

/** Consecutive forward samples required before leaving the standing-still hold. */
const FORWARD_UNLOCK_SAMPLES = 2;

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
 * ETA from remaining meters at the route's walking pace (default 1.4 m/s).
 * Indoor GPS speed is too noisy for a live "current pace" ETA; when the user
 * stops, remaining meters freeze so this time holds until they walk again.
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

/**
 * True when the walker is on/near the route and has reached the destination.
 */
export function hasArrivedAtDestination(options: {
  totalPathMeters: number;
  alongPathMeters: number;
  offRouteMeters?: number | null;
}): boolean {
  const total = Math.max(0, options.totalPathMeters);
  if (total <= 0) return false;
  const along = Math.max(0, options.alongPathMeters);
  const off = options.offRouteMeters ?? 0;
  return (
    along >= total - ARRIVAL_ALONG_PATH_TOLERANCE_M &&
    off <= ARRIVAL_OFF_ROUTE_MAX_M
  );
}

/**
 * Destination pin stays hidden until the remaining walk is short.
 */
export function shouldRevealDestinationMarker(options: {
  navigating: boolean;
  remainingMeters?: number | null;
  totalPathMeters?: number | null;
  alreadyRevealed?: boolean;
}): boolean {
  if (!options.navigating) return false;
  if (options.alreadyRevealed) return true;
  const total = options.totalPathMeters;
  if (total != null && Number.isFinite(total) && total <= DESTINATION_MARKER_REVEAL_M) {
    return true;
  }
  const remaining = options.remainingMeters;
  if (remaining == null || !Number.isFinite(remaining)) return false;
  return remaining <= DESTINATION_MARKER_REVEAL_M;
}

/**
 * Holds along-path meters while the user is standing still so remaining
 * distance/time do not drift with indoor GPS / snap jitter.
 */
export class LiveAlongPathStabilizer {
  private alongMeters = 0;
  private atMs: number | null = null;
  private forwardStreak = 0;

  reset(alongMeters = 0): void {
    this.alongMeters = Math.max(0, alongMeters);
    this.atMs = null;
    this.forwardStreak = 0;
  }

  update(options: {
    nextAlongMeters: number;
    offRouteMeters?: number | null;
    nowMs?: number;
  }): number {
    const next = Math.max(0, options.nextAlongMeters);
    const now =
      options.nowMs ??
      (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const off = options.offRouteMeters ?? 0;

    if (this.atMs == null) {
      this.alongMeters = next;
      this.atMs = now;
      return this.alongMeters;
    }

    const dt = Math.max(0.05, Math.min(4, (now - this.atMs) / 1000));
    this.atMs = now;

    if (Number.isFinite(off) && off > OFF_ROUTE_ETA_THRESHOLD_M) {
      this.alongMeters = next;
      this.forwardStreak = 0;
      return this.alongMeters;
    }

    const delta = next - this.alongMeters;
    if (Math.abs(delta) < ALONG_PATH_JITTER_M) {
      this.forwardStreak = 0;
      return this.alongMeters;
    }

    const rate = delta / dt;
    if (Math.abs(rate) > GPS_JUMP_MPS) {
      this.forwardStreak = 0;
      return this.alongMeters;
    }

    if (Math.abs(rate) < STATIONARY_ALONG_MPS) {
      this.forwardStreak = 0;
      return this.alongMeters;
    }

    if (delta > 0) {
      this.forwardStreak += 1;
      if (this.forwardStreak < FORWARD_UNLOCK_SAMPLES) {
        return this.alongMeters;
      }
      this.alongMeters += Math.min(delta, MAX_WALK_MPS * dt);
      return this.alongMeters;
    }

    this.forwardStreak = 0;
    this.alongMeters = next;
    return this.alongMeters;
  }
}
