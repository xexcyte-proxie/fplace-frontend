import type { FplacesPositionFrame } from '../types';

export const LIVE_FIX_MAX_AGE_MS = 15_000;
export const LIVE_FIX_MAX_ACCURACY_M = 30;
export const LIVE_ROUTE_MAX_SNAP_M = 30;

/** Never turn missing, stale, or imprecise positioning into apparent movement. */
export function isUsableLiveFix(frame: FplacesPositionFrame, now = Date.now()): boolean {
  return Number.isFinite(frame.latitude) && Math.abs(frame.latitude) <= 90 &&
    Number.isFinite(frame.longitude) && Math.abs(frame.longitude) <= 180 &&
    Number.isFinite(frame.accuracy) && frame.accuracy >= 0 &&
    frame.accuracy <= LIVE_FIX_MAX_ACCURACY_M &&
    frame.timestamp != null && Number.isFinite(frame.timestamp) &&
    frame.timestamp <= now + 1_000 && now - frame.timestamp <= LIVE_FIX_MAX_AGE_MS;
}

export function isUsableRouteSnap(frame: FplacesPositionFrame): boolean {
  return frame.offRouteMeters != null && Number.isFinite(frame.offRouteMeters) &&
    frame.offRouteMeters >= 0 && frame.offRouteMeters <= LIVE_ROUTE_MAX_SNAP_M;
}
