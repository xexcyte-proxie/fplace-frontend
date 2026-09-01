/**
 * Domain: Live View heading cue — left/right of screen from alignment delta.
 * Pure; no DOM. Google Live View–style side arrow.
 */
(function (root) {
  const SHOW_DEG = 20;
  const HIDE_DEG = 12;
  const FULL_DEG = 90;
  const AROUND_DEG = 135;

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  /**
   * @param {number|null|undefined} deltaDeg heading error (path − device), +right / −left
   * @param {boolean} [wasVisible]
   */
  function resolveTurnCue(deltaDeg, wasVisible) {
    if (deltaDeg == null || !Number.isFinite(deltaDeg)) {
      return {
        visible: false,
        side: null,
        intensity: 0,
        scale: 0.82,
        tiltDeg: 0,
        label: '',
        symbol: 'chevron_left',
      };
    }

    const abs = Math.abs(deltaDeg);
    const visible = wasVisible ? abs >= HIDE_DEG : abs >= SHOW_DEG;
    if (!visible) {
      return {
        visible: false,
        side: null,
        intensity: 0,
        scale: 0.82,
        tiltDeg: 0,
        label: '',
        symbol: 'chevron_left',
      };
    }

    const around = abs >= AROUND_DEG;
    const side = around ? 'around' : deltaDeg > 0 ? 'right' : 'left';
    const intensity = around
      ? 1
      : clamp((abs - HIDE_DEG) / (FULL_DEG - HIDE_DEG), 0, 1);
    const scale = 0.84 + intensity * 0.28;
    const tiltDeg = around ? 0 : clamp(deltaDeg * 0.22, -28, 28);
    const label = around
      ? 'Turn around'
      : deltaDeg > 0
        ? 'Turn right'
        : 'Turn left';
    const symbol = around
      ? 'u_turn_left'
      : deltaDeg > 0
        ? 'chevron_right'
        : 'chevron_left';

    return {
      visible: true,
      side,
      intensity,
      scale,
      tiltDeg,
      label,
      symbol,
    };
  }

  const api = {
    SHOW_DEG,
    HIDE_DEG,
    FULL_DEG,
    AROUND_DEG,
    resolveTurnCue,
  };

  root.FplacesTurnCue = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
