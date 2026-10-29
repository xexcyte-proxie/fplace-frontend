import { geoToLocalMeters, haversineMeters } from '../../utils/geo-math';

/**
 * Raw GPS fixes scatter by tens of metres indoors even while the phone is
 * stationary (multipath). Applying every fix makes the 2D blue dot wander.
 *
 * This filter anchors the displayed position and only moves it when the
 * incoming fix differs by more than its own uncertainty justifies:
 * - movement beyond max(minMoveMeters, accuracyFraction × accuracy), or
 * - a fix whose accuracy is markedly better than the anchor's.
 *
 * Held fixes are returned clamped to the anchor (not dropped) so consumers
 * that treat updates as a liveness signal keep receiving them.
 */

export interface PositionFixSample {
  latitude: number;
  longitude: number;
  /** Reported accuracy radius in meters. */
  accuracy?: number | null;
  /** Original sample time; never substituted with receipt time. */
  timestamp?: number;
}

export interface StationaryPositionFilterOptions {
  /** Never treat movement below this many meters as significant. */
  minMoveMeters?: number;
  /** Fraction of the fix accuracy that counts as real movement. */
  accuracyFraction?: number;
  /**
   * Re-anchor when a new fix's accuracy is below
   * `anchor accuracy × accuracyImprovementRatio`.
   */
  accuracyImprovementRatio?: number;
  /** Accuracy assumed when a fix reports none. */
  defaultAccuracyMeters?: number;
  /** Confirm borderline displacements using separate, consistent timed fixes. */
  confirmationSamples?: number;
}

export interface StationaryFilterResult {
  /** Position to display: the incoming fix, or the anchor when held. */
  fix: PositionFixSample;
  /** True when the incoming fix was clamped to the anchored position. */
  held: boolean;
  reason: string;
  classification: 'stationary' | 'moving' | 'uncertain';
  displacementM: number | null;
  thresholdM: number | null;
  elapsedMs: number | null;
  impliedSpeedMps: number | null;
  physicalMovementProven: false;
}

export interface StationaryPositionFilter {
  process(incoming: PositionFixSample): StationaryFilterResult;
  reset(): void;
}

const DEFAULT_MIN_MOVE_METERS = 5;
const DEFAULT_ACCURACY_FRACTION = 0.5;
const DEFAULT_ACCURACY_IMPROVEMENT_RATIO = 0.7;
const DEFAULT_ACCURACY_METERS = 30;

export function significantMoveThresholdMeters(
  accuracyMeters: number,
  options?: Pick<StationaryPositionFilterOptions, 'minMoveMeters' | 'accuracyFraction'>,
): number {
  const minMove = options?.minMoveMeters ?? DEFAULT_MIN_MOVE_METERS;
  const fraction = options?.accuracyFraction ?? DEFAULT_ACCURACY_FRACTION;
  return Math.max(minMove, accuracyMeters * fraction);
}

export function createStationaryPositionFilter(
  options?: StationaryPositionFilterOptions,
): StationaryPositionFilter {
  const defaultAccuracy = options?.defaultAccuracyMeters ?? DEFAULT_ACCURACY_METERS;
  const improvementRatio =
    options?.accuracyImprovementRatio ?? DEFAULT_ACCURACY_IMPROVEMENT_RATIO;

  let anchor: PositionFixSample | null = null;
  let candidate: { point: PositionFixSample; count: number } | null = null;
  let lastTimestamp: number | null = null;
  const confirmations = Math.max(1, options?.confirmationSamples ?? 1);

  function effectiveAccuracy(fix: PositionFixSample): number {
    return fix.accuracy != null && Number.isFinite(fix.accuracy) && fix.accuracy > 0
      ? fix.accuracy
      : defaultAccuracy;
  }

  function process(incoming: PositionFixSample): StationaryFilterResult {
    const valid = Number.isFinite(incoming.latitude) && Number.isFinite(incoming.longitude);
    const distance = anchor && valid ? haversineMeters(anchor, incoming) : null;
    const threshold = significantMoveThresholdMeters(effectiveAccuracy(incoming), options);
    const elapsed = anchor?.timestamp != null && incoming.timestamp != null ? incoming.timestamp - anchor.timestamp : null;
    const result = (held: boolean, reason: string, classification: StationaryFilterResult['classification']): StationaryFilterResult => ({
      fix: held && anchor ? anchor : incoming, held, reason, classification, displacementM: distance,
      thresholdM: threshold, elapsedMs: elapsed, impliedSpeedMps: elapsed != null && elapsed > 0 && distance != null ? distance / (elapsed / 1000) : null,
      physicalMovementProven: false,
    });
    if (!valid) return result(!!anchor, 'invalid-coordinate', 'uncertain');
    if (incoming.timestamp != null && lastTimestamp != null && incoming.timestamp <= lastTimestamp) {
      return result(true, 'non-increasing-timestamp', 'uncertain');
    }
    if (incoming.timestamp != null) lastTimestamp = incoming.timestamp;
    if (!anchor) { anchor = incoming; return result(false, 'first-fix-not-movement-evidence', 'uncertain'); }
    const improved = effectiveAccuracy(incoming) < effectiveAccuracy(anchor) * improvementRatio;
    const moved = distance! >= threshold;
    const timedConfirmation = confirmations > 1 && incoming.timestamp != null && anchor.timestamp != null;
    // Better precision alone is not evidence for sub-minimum geographic movement.
    if (timedConfirmation && improved && distance! < (options?.minMoveMeters ?? DEFAULT_MIN_MOVE_METERS)) {
      candidate = null; return result(true, 'accuracy-improved-without-significant-displacement', 'stationary');
    }
    if (!moved && !improved) { candidate = null; return result(true, 'inside-accuracy-scaled-deadband', 'stationary'); }
    const strong = distance! >= Math.max(threshold * 2, effectiveAccuracy(anchor) + effectiveAccuracy(incoming));
    if (timedConfirmation && !strong) {
      const gap = candidate?.point.timestamp != null ? incoming.timestamp! - candidate.point.timestamp : null;
      const a = geoToLocalMeters(anchor, incoming), b = candidate ? geoToLocalMeters(anchor, candidate.point) : null;
      const cosine = b ? (a.x * b.x + a.z * b.z) / Math.max(.0001, Math.hypot(a.x, a.z) * Math.hypot(b.x, b.z)) : -1;
      const consistent = gap != null && gap >= 250 && gap <= 5000 && cosine >= .8;
      candidate = { point: incoming, count: consistent ? candidate!.count + 1 : 1 };
      if (candidate.count < confirmations) return result(true, 'waiting-for-consistent-timed-displacement', 'uncertain');
    }
    const accepted = result(false, improved ? 'accuracy-refinement-with-displacement' : strong ? 'displacement-beyond-combined-uncertainty' : 'consistent-timed-displacement',
      elapsed != null && elapsed > 0 ? 'moving' : 'uncertain');
    anchor = incoming; candidate = null; return accepted;
  }

  function reset(): void {
    anchor = null; candidate = null; lastTimestamp = null;
  }

  return { process, reset };
}
