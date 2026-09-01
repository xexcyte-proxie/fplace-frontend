/**
 * Domain: decide when Live View lighting / visual tracking is too weak for SLAM.
 * Framework-agnostic — used by the camera sampler + compass prompt.
 */
(function (root) {
  const DEFAULT_THRESHOLDS = {
    darkLuma: 22,
    dimLuma: 48,
    lowContrast: 11,
    consecutivePoorMs: 1800,
    recoveredOkMs: 900,
    warmupMs: 2500,
    dismissCooldownMs: 90_000,
    maxDismissalsPerSession: 2,
  };

  function classifyLighting(sample, thresholds) {
    const t = thresholds || DEFAULT_THRESHOLDS;
    if (
      sample == null ||
      typeof sample.luma !== 'number' ||
      Number.isNaN(sample.luma)
    ) {
      return 'unknown';
    }
    if (sample.luma <= t.darkLuma) return 'dark';
    const contrast =
      typeof sample.contrast === 'number' && !Number.isNaN(sample.contrast)
        ? sample.contrast
        : Infinity;
    if (sample.luma <= t.dimLuma && contrast <= t.lowContrast) {
      return 'feature-poor';
    }
    return 'ok';
  }

  function promptReason(classification) {
    if (classification === 'dark') return 'dark';
    if (classification === 'feature-poor') return 'feature-poor';
    return null;
  }

  function compactThresholds(thresholds) {
    const out = {};
    if (!thresholds) return out;
    for (const [key, value] of Object.entries(thresholds)) {
      if (value == null || (typeof value === 'number' && Number.isNaN(value))) {
        continue;
      }
      out[key] = value;
    }
    return out;
  }

  function createLightingTracker(thresholds) {
    const t = { ...DEFAULT_THRESHOLDS, ...compactThresholds(thresholds) };
    let startedAt = null;
    let poorSince = null;
    let okSince = null;
    let lastReason = null;
    let dismissedUntil = 0;
    let dismissals = 0;
    let switched = false;
    let promptedOpen = false;

    function resetStreaks() {
      poorSince = null;
      okSince = null;
      lastReason = null;
    }

    return {
      start(nowMs) {
        startedAt = nowMs;
        resetStreaks();
        promptedOpen = false;
        switched = false;
      },

      ingest(sample, nowMs) {
        if (switched || promptedOpen) {
          return { shouldPrompt: false, shouldSwitch: false, reason: lastReason };
        }
        if (dismissals >= t.maxDismissalsPerSession) {
          return { shouldPrompt: false, shouldSwitch: false, reason: null };
        }
        if (nowMs < dismissedUntil) {
          return { shouldPrompt: false, shouldSwitch: false, reason: null };
        }
        if (startedAt == null) startedAt = nowMs;
        if (nowMs - startedAt < t.warmupMs) {
          return { shouldPrompt: false, shouldSwitch: false, reason: null };
        }

        const classification = classifyLighting(sample, t);
        if (classification === 'unknown') {
          return { shouldPrompt: false, shouldSwitch: false, reason: lastReason };
        }
        if (classification === 'ok' || classification === 'feature-poor') {
          poorSince = null;
          lastReason = null;
          if (classification === 'ok') {
            if (okSince == null) okSince = nowMs;
          }
          return { shouldPrompt: false, shouldSwitch: false, reason: null };
        }

        okSince = null;
        lastReason = promptReason(classification);
        if (poorSince == null) poorSince = nowMs;
        const shouldPrompt = nowMs - poorSince >= t.consecutivePoorMs;
        if (shouldPrompt) promptedOpen = true;
        return {
          shouldPrompt,
          shouldSwitch: shouldPrompt && lastReason === 'dark',
          reason: lastReason,
        };
      },

      dismiss(nowMs) {
        promptedOpen = false;
        dismissals += 1;
        dismissedUntil = nowMs + t.dismissCooldownMs;
        resetStreaks();
      },

      markSwitched() {
        switched = true;
        promptedOpen = false;
      },

      noteRecovered(nowMs) {
        if (okSince != null && nowMs - okSince >= t.recoveredOkMs) {
          resetStreaks();
        }
      },

      isPromptOpen() {
        return promptedOpen;
      },

      hasSwitched() {
        return switched;
      },

      isLightingOkLocked(nowMs) {
        return okSince != null && nowMs - okSince >= t.recoveredOkMs;
      },
    };
  }

  const api = {
    DEFAULT_THRESHOLDS,
    classifyLighting,
    promptReason,
    createLightingTracker,
  };

  root.FplacesVisualTrackingQuality = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
