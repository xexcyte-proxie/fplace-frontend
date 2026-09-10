import { WALKING_SPEED_MPS } from './constants';

/** Ignore tiny GPS/snap jitter when adding off-route distance to the ETA. */
const OFF_ROUTE_ETA_THRESHOLD_M = 4;

/**
 * Beyond this, off-route is treated as an unusable outdoor/cached GPS fix
 * (not a walkable detour). Common indoors when WGS84 GPS is kilometers from
 * the Mappedin polyline: do not inflate ETA or block arrival.
 */
export const OFF_ROUTE_PLAUSIBLE_MAX_M = 250;

/** Close enough to the path end to count as arrived. */
export const ARRIVAL_ALONG_PATH_TOLERANCE_M = 0.75;

/** Still counts as arrived only when not far off the route. */
export const ARRIVAL_OFF_ROUTE_MAX_M = 4;

/** True when off-route looks like a real nearby detour, not a multi-km GPS miss. */
export function isPlausibleOffRouteMeters(
  offRouteMeters?: number | null,
): boolean {
  if (offRouteMeters == null || !Number.isFinite(offRouteMeters)) return false;
  return offRouteMeters >= 0 && offRouteMeters <= OFF_ROUTE_PLAUSIBLE_MAX_M;
}

/** Show the destination pin only when the remaining walk is this close. */
export const DESTINATION_MARKER_REVEAL_M = 8;

/** Ignore sub-step along-path wiggles from heading-only frames and snap noise. */
const ALONG_PATH_JITTER_M = 0.85;

/** Poor accuracy widens the hold slightly; it must not unlock a corridor jump. */
const ACCURACY_JITTER_FRACTION = 0.06;
const MAX_ACCURACY_JITTER_M = 2.5;

function alongPathJitterMeters(accuracyMeters?: number | null): number {
  if (accuracyMeters == null || !Number.isFinite(accuracyMeters) || accuracyMeters <= 0) {
    return ALONG_PATH_JITTER_M;
  }
  return Math.max(
    ALONG_PATH_JITTER_M,
    Math.min(MAX_ACCURACY_JITTER_M, accuracyMeters * ACCURACY_JITTER_FRACTION),
  );
}

/** Below this along-path rate the user is treated as standing still. */
const STATIONARY_ALONG_MPS = 0.28;

/** Cap how fast remaining can fall so a noisy fix cannot sprint the odometer. */
const MAX_WALK_MPS = 2.4;

/** Instant teleports along the polyline, not a walking step. */
const GPS_JUMP_MPS = 8;

/** Consecutive forward samples required before leaving the standing-still hold. */
const FORWARD_UNLOCK_SAMPLES = 2;

/**
 * Prefer the geometric path length used by live snap progress over Mappedin's
 * reported `directions.distance`, which can include vertical connectors.
 */
export function resolveCanonicalRouteDistanceMeters(
  pathMeters: number,
  mappedinDistance?: number | null,
): number | null {
  if (Number.isFinite(pathMeters) && pathMeters > 0) return pathMeters;
  if (
    mappedinDistance != null &&
    Number.isFinite(mappedinDistance) &&
    mappedinDistance > 0
  ) {
    return mappedinDistance;
  }
  return null;
}

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
  const effectiveOff =
    isPlausibleOffRouteMeters(off) && off > threshold ? off : 0;
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
  const rawOff = options.offRouteMeters ?? 0;
  // Implausible GPS (multi-km) must not block arrival forever indoors.
  const off = isPlausibleOffRouteMeters(rawOff) ? rawOff : 0;
  // A brand-new route with along=0 can satisfy `along >= total - 0.75` when
  // the path is shorter than the tolerance. Require real progress first.
  const minTravel = Math.min(3, Math.max(ARRIVAL_ALONG_PATH_TOLERANCE_M, total * 0.35));
  return (
    along >= total - ARRIVAL_ALONG_PATH_TOLERANCE_M &&
    along >= minTravel &&
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
  /** When the published baseline last moved; caps unlock catch-up speed. */
  private baselineMovedAtMs: number | null = null;
  /** Previous raw snap; motion checks compare consecutive samples, not the held baseline. */
  private lastRawAlongMeters: number | null = null;
  private forwardStreak = 0;

  reset(alongMeters = 0): void {
    this.alongMeters = Math.max(0, alongMeters);
    this.atMs = null;
    this.baselineMovedAtMs = null;
    this.lastRawAlongMeters = null;
    this.forwardStreak = 0;
  }

  update(options: {
    nextAlongMeters: number;
    /** Ignored for the odometer: remaining metres add this separately. */
    offRouteMeters?: number | null;
    /** Reported fix accuracy; poor accuracy widens the jitter deadband. */
    accuracyMeters?: number | null;
    nowMs?: number;
  }): number {
    const next = Math.max(0, options.nextAlongMeters);
    const now =
      options.nowMs ??
      (typeof performance !== 'undefined' ? performance.now() : Date.now());

    if (this.atMs == null) {
      this.atMs = now;
      this.baselineMovedAtMs = now;
      this.lastRawAlongMeters = next;
      // Keep the reset baseline (0 at Begin). The first indoor GPS snap is
      // often the nearest point on a short path; adopting it teleports the
      // odometer to the destination while the user is still standing still.
      return this.alongMeters;
    }

    const dt = Math.max(0.05, Math.min(4, (now - this.atMs) / 1000));
    this.atMs = now;

    const previousRaw = this.lastRawAlongMeters ?? this.alongMeters;
    this.lastRawAlongMeters = next;

    // Off-route distance belongs on remaining metres (`computeLiveRemainingMeters`),
    // not this odometer. Adopting `next` when off-route is what teleported the
    // avatar to the destination on short L-shaped indoor paths.

    // Judge motion from consecutive raw samples: while the baseline is held,
    // a walker's delta-to-baseline keeps growing and would read as a fake
    // "GPS jump" even though each step is perfectly plausible.
    const sampleRate = (next - previousRaw) / dt;
    if (Math.abs(sampleRate) > GPS_JUMP_MPS) {
      this.forwardStreak = 0;
      return this.alongMeters;
    }
    if (Math.abs(sampleRate) < STATIONARY_ALONG_MPS) {
      this.forwardStreak = 0;
      return this.alongMeters;
    }
    this.forwardStreak = sampleRate > 0 ? this.forwardStreak + 1 : 0;

    const delta = next - this.alongMeters;
    const jitter = alongPathJitterMeters(options.accuracyMeters);
    if (Math.abs(delta) < jitter) {
      return this.alongMeters;
    }

    if (delta > 0) {
      if (this.forwardStreak < FORWARD_UNLOCK_SAMPLES) {
        return this.alongMeters;
      }
      const heldSeconds = Math.max(
        dt,
        (now - (this.baselineMovedAtMs ?? now)) / 1000,
      );
      this.acceptBaseline(
        this.alongMeters + Math.min(delta, MAX_WALK_MPS * heldSeconds),
        now,
      );
      return this.alongMeters;
    }

    // Walking backward beyond the deadband: accept so remaining grows honestly.
    this.acceptBaseline(next, now);
    return this.alongMeters;
  }

  private acceptBaseline(alongMeters: number, nowMs: number): void {
    this.alongMeters = Math.max(0, alongMeters);
    this.baselineMovedAtMs = nowMs;
  }
}
