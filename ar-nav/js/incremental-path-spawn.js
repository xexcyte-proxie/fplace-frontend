/**
 * Domain: where incremental AR trail chevrons may spawn.
 * Pure; no DOM / Three.js.
 *
 * Mid-route density matches the last working trail (commit 68be249):
 * start ~0.8 m ahead, reveal 8 m, 4 m spacing — so the opening stretch is
 * not empty (pin-only). Near-camera still caps count/scale so the first
 * viewport does not clog into a teal pile.
 */
(function (root) {
  const DEFAULTS = {
    incrementalPathHorizonM: 22,
    incrementalPathRevealAheadM: 8,
    incrementalPathSpacingM: 4,
    incrementalPathMaxVisible: 6,
    arrivalClearRemainingM: 1.8,
    leadingArrowDistanceM: 2.2,
    floorArrowSpacingM: 3,
    nearFieldStartM: 6,
    nearFieldSpacingM: 4.5,
    nearFieldMaxArrows: 3,
    nearFieldArrowScale: 0.75,
  };

  function num(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  function resolveTrailSpawnWindow(alongM, totalLen, cfg) {
    const c = cfg || {};
    const along = Math.max(0, num(alongM, 0));
    const total = Math.max(0, num(totalLen, 0));
    const remaining = Math.max(0, total - along);

    const arrivalClearM = num(
      c.arrivalClearRemainingM,
      DEFAULTS.arrivalClearRemainingM,
    );
    const horizonM = num(c.incrementalPathHorizonM, DEFAULTS.incrementalPathHorizonM);
    const leadM = num(c.leadingArrowDistanceM, DEFAULTS.leadingArrowDistanceM);
    const floorSpacing = num(c.floorArrowSpacingM, DEFAULTS.floorArrowSpacingM);
    let spacing = num(
      c.incrementalPathSpacingM,
      DEFAULTS.incrementalPathSpacingM,
    );
    const revealAheadM = Math.min(
      horizonM,
      num(c.incrementalPathRevealAheadM, DEFAULTS.incrementalPathRevealAheadM),
    );
    let maxVisible = num(
      c.incrementalPathMaxVisible,
      DEFAULTS.incrementalPathMaxVisible,
    );
    let nearScale = 1;

    const nearFieldM = num(c.nearFieldStartM, DEFAULTS.nearFieldStartM);
    if (along < nearFieldM) {
      spacing = Math.max(
        spacing,
        num(c.nearFieldSpacingM, DEFAULTS.nearFieldSpacingM),
      );
      maxVisible = Math.min(
        maxVisible,
        num(c.nearFieldMaxArrows, DEFAULTS.nearFieldMaxArrows),
      );
      nearScale = num(c.nearFieldArrowScale, DEFAULTS.nearFieldArrowScale);
    }

    // Same rule as 2D arrival: a brand-new short path is not "arrived".
    const minTravel = Math.min(3, Math.max(arrivalClearM, total * 0.35));
    const clearTrail = remaining < arrivalClearM && along >= minTravel;

    const leadGap = leadM + floorSpacing * 0.35;
    // Keep first chevron in view (~0.8 m); thinning is count/scale, not gap.
    const spawnFrom = along + leadGap * 0.25;
    const spawnTo = Math.min(Math.max(0, total - 0.2), along + revealAheadM);

    const canSpawn =
      !clearTrail && maxVisible > 0 && spawnTo > spawnFrom + 0.3 && total > along + 0.6;

    return {
      spacing,
      revealAheadM: clearTrail ? 0 : revealAheadM,
      maxVisible: clearTrail ? 0 : maxVisible,
      nearScale: clearTrail ? 1 : nearScale,
      remaining,
      clearTrail,
      spawnFrom: clearTrail ? along : spawnFrom,
      spawnTo: clearTrail ? along : spawnTo,
      canSpawn,
    };
  }

  const api = {
    DEFAULTS,
    resolveTrailSpawnWindow,
  };

  root.FplacesIncrementalPathSpawn = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
