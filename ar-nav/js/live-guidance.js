/**
 * Domain: Live View primary instruction from heading alignment + progress.
 * Pure; no DOM. Do not announce route turns in advance, only correct
 * misalignment, or stay on head-straight until arrival.
 */
(function (root) {
  const ALIGN_THRESHOLD_DEG = 18;
  const AROUND_DEG = 135;
  const ARRIVE_THRESHOLD_M = 3;

  /**
   * @param {{
   *   arrived?: boolean,
   *   destinationName?: string | null,
   *   alignmentDeltaDeg?: number | null,
   *   distanceToTargetMeters?: number | null,
   *   remainingMeters?: number | null,
   *   alignThresholdDeg?: number,
   *   arriveThresholdM?: number,
   * }} input
   */
  function resolveLiveGuidance(input) {
    const destinationName = input.destinationName || 'destination';
    const distRaw = input.distanceToTargetMeters;
    const dist = distRaw != null && Number.isFinite(distRaw) ? Math.max(0, distRaw) : null;
    const rem =
      input.remainingMeters != null && Number.isFinite(input.remainingMeters)
        ? Math.max(0, input.remainingMeters)
        : null;
    const delta =
      input.alignmentDeltaDeg != null && Number.isFinite(input.alignmentDeltaDeg)
        ? input.alignmentDeltaDeg
        : null;
    const alignThreshold =
      input.alignThresholdDeg != null ? input.alignThresholdDeg : ALIGN_THRESHOLD_DEG;
    const arriveThreshold =
      input.arriveThresholdM != null ? input.arriveThresholdM : ARRIVE_THRESHOLD_M;

    if (input.arrived) {
      return {
        primary: {
          label: `Arrived at ${destinationName}`,
          symbol: 'flag',
        },
        then: null,
        distanceLabel: 'You have reached your destination',
        distanceMeters: 0,
        alignmentDelta: null,
        distToTurn: distRaw ?? 0,
      };
    }

    const aligned = delta == null || Math.abs(delta) < alignThreshold;

    if (delta != null && !aligned) {
      let primary;
      if (Math.abs(delta) >= AROUND_DEG) {
        primary = { label: 'Turn around', symbol: 'u_turn_right' };
      } else if (delta > 0) {
        primary = { label: 'Turn right', symbol: 'turn_right' };
      } else {
        primary = { label: 'Turn left', symbol: 'turn_left' };
      }
      return {
        primary,
        then: null,
        distanceLabel: dist != null ? `${Math.round(dist)} m` : 'Face the path',
        distanceMeters: dist,
        alignmentDelta: delta,
        distToTurn: distRaw,
      };
    }

    if (rem != null && rem <= arriveThreshold) {
      return {
        primary: { label: 'Arrive', symbol: 'flag' },
        then: null,
        distanceLabel: `${rem.toFixed(1)} m`,
        distanceMeters: dist,
        alignmentDelta: delta,
        distToTurn: distRaw,
      };
    }

    let distanceLabel = '';
    if (dist != null) {
      distanceLabel =
        dist >= 10 ? `In ${Math.round(dist)} m` : `${Math.round(dist)} m`;
    } else if (rem != null) {
      distanceLabel = `${rem.toFixed(1)} m`;
    }

    return {
      primary: { label: 'Head straight', symbol: 'straight' },
      then: null,
      distanceLabel,
      distanceMeters: dist,
      alignmentDelta: delta,
      distToTurn: distRaw,
    };
  }

  const api = {
    ALIGN_THRESHOLD_DEG,
    AROUND_DEG,
    ARRIVE_THRESHOLD_M,
    resolveLiveGuidance,
  };

  root.FplacesLiveGuidance = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
