/**
 * Domain: Live View primary instruction from heading alignment + progress.
 * Pure; no DOM. Main instructions correct facing relative to the current path.
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
  function straightDistanceLabel(meters) {
    if (meters == null) return 'Follow the route';
    // Reaching a guidance target does not itself confirm destination arrival.
    if (meters < 1) return 'Follow the path';
    return `Continue for ${Math.round(meters)} m`;
  }

  function resolveLiveGuidance(input) {
    const destinationName = input.destinationName || 'destination';
    const distRaw = input.distanceToTargetMeters;
    const dist = distRaw != null && Number.isFinite(distRaw) ? Math.max(0, distRaw) : null;
    const delta =
      input.alignmentDeltaDeg != null && Number.isFinite(input.alignmentDeltaDeg)
        ? input.alignmentDeltaDeg
        : null;
    const alignThreshold =
      input.alignThresholdDeg != null ? input.alignThresholdDeg : ALIGN_THRESHOLD_DEG;

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

    const uncertain = input.positionReliable === false || input.offRoute;
    const unavailable = uncertain || delta == null;
    const alignment = delta == null ? null : Math.abs(delta) >= AROUND_DEG
      ? 'Turn your phone around toward the path'
      : Math.abs(delta) >= alignThreshold
        ? `Point your phone ${delta > 0 ? 'right' : 'left'} toward the path` : null;
    const primary = unavailable
      ? { label: input.offRoute ? 'Return to the route' : uncertain ? 'Position uncertain' : 'Face the route', symbol: 'explore' }
      : Math.abs(delta) >= AROUND_DEG ? { label: 'Turn around', symbol: 'u_turn_right' }
      : Math.abs(delta) >= alignThreshold ? (delta > 0
        ? { label: 'Turn right', symbol: 'turn_right' } : { label: 'Turn left', symbol: 'turn_left' })
      : { label: 'Head straight', symbol: 'straight' };
    const turn = !unavailable && primary.symbol !== 'straight';
    return {
      primary,
      then: null,
      distanceLabel: unavailable
        ? (uncertain ? 'Check your location on the map' : 'Point your phone toward the path, then tap Align route')
        : turn ? 'Face the path'
        : straightDistanceLabel(dist),
      distanceMeters: dist,
      alignmentDelta: delta,
      alignmentPrompt: unavailable ? null : alignment,
      uncertain: unavailable,
      requiresAlignment: !uncertain && delta == null,
      distToTurn: distRaw,
    };
  }

  // Separate entry/exit thresholds and dwell keep the main instruction stable.
  function createGuidanceTracker() {
    let current = null, pending = null, pendingAt = 0;
    return {
      update(input, now) {
        const delta = input.alignmentDeltaDeg;
        if (!Number.isFinite(delta) || input.positionReliable === false || input.offRoute || input.arrived) {
          current = pending = null;
          return resolveLiveGuidance(input);
        }
        const magnitude = Math.abs(delta);
        const threshold = current ? 12 : 22;
        const candidate = magnitude < threshold ? null : magnitude >= (current === 'around' ? 125 : 140)
          ? 'around' : delta > 0 ? 'right' : 'left';
        if (candidate !== current) {
          if (candidate !== pending) { pending = candidate; pendingAt = now; }
          if (now - pendingAt >= 350) { current = candidate; pending = candidate; }
        } else { pending = current; pendingAt = now; }
        const result = resolveLiveGuidance(input);
        result.primary = current === 'around' ? { label: 'Turn around', symbol: 'u_turn_right' }
          : current === 'right' ? { label: 'Turn right', symbol: 'turn_right' }
          : current === 'left' ? { label: 'Turn left', symbol: 'turn_left' }
          : { label: 'Head straight', symbol: 'straight' };
        result.distanceLabel = current ? 'Face the path'
          : straightDistanceLabel(result.distanceMeters);
        result.alignmentPrompt = current === 'around' ? 'Turn your phone around toward the path'
          : current ? `Point your phone ${current} toward the path` : null;
        return result;
      },
    };
  }

  const api = {
    ALIGN_THRESHOLD_DEG,
    AROUND_DEG,
    ARRIVE_THRESHOLD_M,
    resolveLiveGuidance,
    createGuidanceTracker,
  };

  root.FplacesLiveGuidance = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
