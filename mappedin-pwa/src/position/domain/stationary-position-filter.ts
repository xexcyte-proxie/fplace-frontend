import { haversineMeters } from '../../utils/geo-math';

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
}

export interface StationaryFilterResult {
  /** Position to display: the incoming fix, or the anchor when held. */
  fix: PositionFixSample;
  /** True when the incoming fix was clamped to the anchored position. */
  held: boolean;
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

  function effectiveAccuracy(fix: PositionFixSample): number {
    return fix.accuracy != null && Number.isFinite(fix.accuracy) && fix.accuracy > 0
      ? fix.accuracy
      : defaultAccuracy;
  }

  function process(incoming: PositionFixSample): StationaryFilterResult {
    if (
      !Number.isFinite(incoming.latitude) ||
      !Number.isFinite(incoming.longitude)
    ) {
      // Malformed fix: keep whatever we have.
      if (anchor) return { fix: anchor, held: true };
      return { fix: incoming, held: false };
    }

    if (!anchor) {
      anchor = incoming;
      return { fix: incoming, held: false };
    }

    const distance = haversineMeters(anchor, incoming);
    const threshold = significantMoveThresholdMeters(
      effectiveAccuracy(incoming),
      options,
    );

    const movedSignificantly = distance >= threshold;
    const accuracyImproved =
      effectiveAccuracy(incoming) < effectiveAccuracy(anchor) * improvementRatio;

    if (movedSignificantly || accuracyImproved) {
      anchor = incoming;
      return { fix: incoming, held: false };
    }

    // Hold both position and accuracy so the ring does not pulse with GPS noise.
    return { fix: anchor, held: true };
  }

  function reset(): void {
    anchor = null;
  }

  return { process, reset };
}
