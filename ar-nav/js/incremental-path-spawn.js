/**
 * Domain: which AR trail chevrons may exist.
 * Pure; no DOM / Three.js.
 *
 * Sliding window of at most `maxVisible` slots (default 2). As the user
 * passes a chevron it leaves the set and the next grid mark ahead enters.
 * Occupancy (`occupyTrailSlots`) refuses any candidate closer in XZ than
 * minSeparation — stacking is structurally impossible.
 */
(function (root) {
  const DEFAULTS = {
    incrementalPathHorizonM: 22,
    incrementalPathSpacingM: 4,
    incrementalPathMaxVisible: 2,
    incrementalPathPassM: 0.8,
    incrementalPathMinSeparationM: 2.4,
    arrivalClearRemainingM: 1.8,
    nearFieldSpacingM: 4,
    nearFieldMaxArrows: 2,
    nearFieldArrowScale: 0.9,
    /** Meters ahead of progress before the first opening chevron may spawn. */
    nearFieldLeadGapM: 2.5,
  };

  function finiteAlong(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  function num(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  function firstGridMark(fromM, spacingM) {
    const spacing = num(spacingM, 0);
    const from = Math.max(0, num(fromM, 0));
    if (!(spacing > 0)) return from;
    let mark = Math.ceil(from / spacing) * spacing;
    if (mark < from - 1e-9) mark += spacing;
    return mark;
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
    const spacing = Math.max(
      num(c.incrementalPathSpacingM, DEFAULTS.incrementalPathSpacingM),
      num(c.nearFieldSpacingM, DEFAULTS.nearFieldSpacingM),
    );
    const slotCap = Math.max(
      0,
      Math.min(
        num(c.incrementalPathMaxVisible, DEFAULTS.incrementalPathMaxVisible),
        num(c.nearFieldMaxArrows, DEFAULTS.nearFieldMaxArrows),
      ),
    );
    const passM = Math.max(0, num(c.incrementalPathPassM, DEFAULTS.incrementalPathPassM));
    const nearLead = num(c.nearFieldLeadGapM, DEFAULTS.nearFieldLeadGapM);
    const nearScale = num(c.nearFieldArrowScale, DEFAULTS.nearFieldArrowScale);

    // Same rule as 2D arrival: a brand-new short path is not "arrived".
    const minTravel = Math.min(3, Math.max(arrivalClearM, total * 0.35));
    const clearTrail = remaining < arrivalClearM && along >= minTravel;

    // Opening: keep the first chevron in view, not in the user's face.
    // After that: drop a chevron only once the user has almost reached it.
    const spawnFrom = along + (along < 1 ? nearLead : passM);
    const revealAheadM = Math.min(horizonM, spacing * slotCap);
    const spawnTo = Math.min(
      Math.max(0, total - 0.2),
      spawnFrom + revealAheadM,
    );

    const canSpawn =
      !clearTrail && slotCap > 0 && spawnTo > spawnFrom + 0.3 && total > along + 0.6;

    return {
      spacing,
      revealAheadM: clearTrail ? 0 : revealAheadM,
      maxVisible: clearTrail ? 0 : slotCap,
      nearScale: clearTrail ? 1 : nearScale,
      remaining,
      clearTrail,
      spawnFrom: clearTrail ? along : spawnFrom,
      spawnTo: clearTrail ? along : spawnTo,
      canSpawn,
      minSeparationM: num(
        c.incrementalPathMinSeparationM,
        DEFAULTS.incrementalPathMinSeparationM,
      ),
    };
  }

  /**
   * Trail slots follow the SLAM camera on the world path. Map/GPS along is
   * only a fallback — it often sits still while the user walks past the
   * chevrons, which empties the road ahead.
   */
  function resolveTrailAlongM(cameraAlongM, navigatorAlongM) {
    const cam = finiteAlong(cameraAlongM);
    if (cam != null) return Math.max(0, cam);
    const nav = finiteAlong(navigatorAlongM);
    if (nav != null) return Math.max(0, nav);
    return 0;
  }

  /**
   * Exact along-path marks for the sliding window, plus extra grid candidates
   * so occupancy can refill a slot when a hairpin would stack two chevrons.
   */
  function resolveTrailMarks(alongM, totalLen, cfg) {
    const window = resolveTrailSpawnWindow(alongM, totalLen, cfg);
    const marks = [];
    const candidates = [];
    const total = Math.max(0, num(totalLen, 0));
    if (!window.canSpawn || window.maxVisible <= 0 || !(window.spacing > 0)) {
      return { ...window, marks, candidates };
    }

    const hardEnd = Math.min(
      total - 0.2,
      window.spawnTo + window.spacing * window.maxVisible * 3,
    );
    let mark = firstGridMark(window.spawnFrom, window.spacing);
    const budget = window.maxVisible * 4;
    while (mark <= hardEnd + 1e-9 && candidates.length < budget) {
      candidates.push(mark);
      if (marks.length < window.maxVisible && mark <= window.spawnTo + 1e-9) {
        marks.push(mark);
      }
      mark += window.spacing;
    }

    return { ...window, marks, candidates };
  }

  /**
   * Keep candidates in path order until `maxVisible`, skipping any whose XZ
   * is closer than `minSepM` to one already kept. Never returns more than cap.
   */
  function occupyTrailSlots(candidates, maxVisible, minSepM) {
    const cap = Math.max(0, Math.floor(num(maxVisible, 0)));
    const minSep = Math.max(0, num(minSepM, 0));
    const kept = [];
    if (!Array.isArray(candidates) || cap === 0) return kept;

    for (let i = 0; i < candidates.length; i++) {
      if (kept.length >= cap) break;
      const c = candidates[i];
      if (!c || !Number.isFinite(c.x) || !Number.isFinite(c.z)) continue;
      let clash = false;
      for (let k = 0; k < kept.length; k++) {
        const dx = kept[k].x - c.x;
        const dz = kept[k].z - c.z;
        if (Math.hypot(dx, dz) < minSep) {
          clash = true;
          break;
        }
      }
      if (clash) continue;
      kept.push(c);
    }
    return kept;
  }

  const api = {
    DEFAULTS,
    firstGridMark,
    resolveTrailSpawnWindow,
    resolveTrailMarks,
    occupyTrailSlots,
    resolveTrailAlongM,
  };

  root.FplacesIncrementalPathSpawn = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
