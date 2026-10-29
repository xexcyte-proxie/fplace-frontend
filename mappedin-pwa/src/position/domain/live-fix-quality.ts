import type { FplacesPositionFrame } from '../types';

export const LIVE_FIX_MAX_AGE_MS = 15_000;
export const LIVE_FIX_MAX_ACCURACY_M = 30;
// Match the SDK's default display threshold; this never authorizes route progress.
export const DISPLAY_FIX_MAX_ACCURACY_M = 50;
export const LIVE_ROUTE_MAX_SNAP_M = 30;

/** Never turn missing, stale, or imprecise positioning into apparent movement. */
export function isUsableLiveFix(frame: FplacesPositionFrame, now = Date.now()): boolean {
  return isUsableDisplayFix(frame, now) && frame.accuracy <= LIVE_FIX_MAX_ACCURACY_M;
}

/** Fresh approximate display is separate from navigation/arrival evidence. */
export function isUsableDisplayFix(frame: FplacesPositionFrame, now = Date.now()): boolean {
  return Number.isFinite(frame.latitude) && Math.abs(frame.latitude) <= 90 &&
    Number.isFinite(frame.longitude) && Math.abs(frame.longitude) <= 180 &&
    Number.isFinite(frame.accuracy) && frame.accuracy >= 0 &&
    frame.accuracy <= DISPLAY_FIX_MAX_ACCURACY_M &&
    frame.timestamp != null && Number.isFinite(frame.timestamp) &&
    frame.timestamp <= now + 1_000 && now - frame.timestamp <= LIVE_FIX_MAX_AGE_MS;
}

export function isUsableRouteSnap(frame: FplacesPositionFrame): boolean {
  return frame.offRouteMeters != null && Number.isFinite(frame.offRouteMeters) &&
    frame.offRouteMeters >= 0 && frame.offRouteMeters <= LIVE_ROUTE_MAX_SNAP_M;
}


/** Explain eligibility without changing either gate or the stricter route arrival rules. */
export function describePositionFixQuality(frame: FplacesPositionFrame, now = Date.now()) {
  const displayEligible = isUsableDisplayFix(frame, now), navigationEligible = isUsableLiveFix(frame, now);
  const reason = !Number.isFinite(frame.latitude) || !Number.isFinite(frame.longitude) || Math.abs(frame.latitude) > 90 || Math.abs(frame.longitude) > 180
    ? 'invalid-coordinate' : !Number.isFinite(frame.accuracy) || frame.accuracy < 0 ? 'invalid-accuracy'
    : frame.timestamp == null || !Number.isFinite(frame.timestamp) ? 'missing-or-invalid-timestamp'
    : frame.timestamp > now + 1000 ? 'future-timestamp' : now - frame.timestamp > LIVE_FIX_MAX_AGE_MS ? 'stale-timestamp'
    : frame.accuracy > DISPLAY_FIX_MAX_ACCURACY_M ? 'accuracy-over-display-limit'
    : !navigationEligible ? 'display-only-accuracy-over-navigation-limit' : 'navigation-quality-fix';
  return { displayEligible, navigationEligible, arrivalFixEligible: navigationEligible && frame.accuracy <= 10,
    arrivalDecision: 'requires-existing-route-proximity-travel-and-snap-validation', reason,
    accuracy: frame.accuracy, timestamp: frame.timestamp ?? null, receivedAt: now,
    fixAgeMs: frame.timestamp == null ? null : now - frame.timestamp,
    displayAccuracyLimitM: DISPLAY_FIX_MAX_ACCURACY_M, navigationAccuracyLimitM: LIVE_FIX_MAX_ACCURACY_M };
}
