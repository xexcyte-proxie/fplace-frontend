/** Treat compass as live if a sample arrived within this window. */
export const COMPASS_FRESH_MS = 4000;

/** iOS reports -1 when the magnetometer is uncalibrated. */
export const COMPASS_UNRELIABLE_ACCURACY_DEG = 40;

export function normalizeHeadingDegrees(heading: number): number {
  return ((heading % 360) + 360) % 360;
}

export function shortestHeadingDelta(fromDeg: number, toDeg: number): number {
  let delta = normalizeHeadingDegrees(toDeg) - normalizeHeadingDegrees(fromDeg);
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
}

/**
 * Prefer a fresh phone compass so the 2D glow turns in place.
 * Fall back to path/GPS bearing so the cone still points along the route
 * when orientation is missing or stale.
 */
export function resolveNavigationConeHeading(options: {
  compassHeading?: number | null;
  compassAgeMs?: number | null;
  pathHeading?: number | null;
  freshMs?: number;
}): number | undefined {
  const freshMs = options.freshMs ?? COMPASS_FRESH_MS;
  const age = options.compassAgeMs;
  const compass =
    options.compassHeading != null && Number.isFinite(options.compassHeading)
      ? normalizeHeadingDegrees(options.compassHeading)
      : undefined;
  if (compass != null && (age == null || age <= freshMs)) {
    return compass;
  }

  if (options.pathHeading != null && Number.isFinite(options.pathHeading)) {
    return normalizeHeadingDegrees(options.pathHeading);
  }

  return compass;
}

export function isCompassAccuracyReliable(
  accuracy: number | null | undefined,
): boolean {
  if (accuracy == null || !Number.isFinite(accuracy)) return true;
  if (accuracy < 0) return false;
  return accuracy <= COMPASS_UNRELIABLE_ACCURACY_DEG;
}

export function isAbsoluteOrientationEvent(event: {
  webkitCompassHeading?: number;
  absolute?: boolean;
}): boolean {
  return (
    typeof event.webkitCompassHeading === 'number' &&
    Number.isFinite(event.webkitCompassHeading)
  ) || event.absolute === true;
}

export function headingFromOrientationEvent(
  event: {
    webkitCompassHeading?: number;
    webkitCompassAccuracy?: number;
    alpha?: number | null;
    absolute?: boolean;
  },
  options?: { screenOrientationDeg?: number },
): number | null {
  if (!isCompassAccuracyReliable(event.webkitCompassAccuracy)) return null;

  const webkit = event.webkitCompassHeading;
  if (webkit != null && Number.isFinite(webkit)) {
    return normalizeHeadingDegrees(webkit);
  }

  const alpha = event.alpha;
  if (alpha == null || !Number.isFinite(alpha)) return null;
  const screen = options?.screenOrientationDeg ?? 0;
  return normalizeHeadingDegrees(360 - alpha + screen);
}

function circularSpreadDeg(samples: number[]): number {
  if (samples.length < 2) return 0;
  let max = 0;
  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) {
      max = Math.max(max, Math.abs(shortestHeadingDelta(samples[i], samples[j])));
    }
  }
  return max;
}

/**
 * Drop the first noisy compass samples and ignore relative `alpha` while a
 * true/`webkit` heading is flowing — those two formulas disagree on iOS.
 */
export function createCompassHeadingFilter(options?: {
  settleSamples?: number;
  maxSpreadDeg?: number;
  smoothAlpha?: number;
  ignoreRelativeIfAbsoluteWithinMs?: number;
}) {
  const settleSamples = options?.settleSamples ?? 4;
  const maxSpreadDeg = options?.maxSpreadDeg ?? 28;
  const smoothAlpha = options?.smoothAlpha ?? 0.38;
  const ignoreRelativeMs = options?.ignoreRelativeIfAbsoluteWithinMs ?? 1600;

  let lastAbsoluteAt = Number.NEGATIVE_INFINITY;
  let locked = false;
  const recent: number[] = [];
  let smoothed: number | null = null;

  function ingestHeading(heading: number): number | null {
    if (!Number.isFinite(heading)) return null;
    const deg = normalizeHeadingDegrees(heading);
    recent.push(deg);
    if (recent.length > Math.max(8, settleSamples)) recent.shift();

    if (!locked) {
      if (recent.length < settleSamples) return null;
      if (circularSpreadDeg(recent) > maxSpreadDeg) return null;
      locked = true;
      smoothed = deg;
      return deg;
    }

    const current = smoothed ?? deg;
    smoothed = normalizeHeadingDegrees(
      current + shortestHeadingDelta(current, deg) * smoothAlpha,
    );
    return smoothed;
  }

  function ingest(
    event: {
      webkitCompassHeading?: number;
      webkitCompassAccuracy?: number;
      alpha?: number | null;
      absolute?: boolean;
    },
    nowMs: number,
    screenOrientationDeg?: number,
  ): number | null {
    const heading = headingFromOrientationEvent(event, { screenOrientationDeg });
    if (heading == null) return null;

    const absolute = isAbsoluteOrientationEvent(event);
    if (absolute) {
      lastAbsoluteAt = nowMs;
    } else if (nowMs - lastAbsoluteAt < ignoreRelativeMs) {
      return null;
    }

    return ingestHeading(heading);
  }

  function reset(): void {
    lastAbsoluteAt = Number.NEGATIVE_INFINITY;
    locked = false;
    recent.length = 0;
    smoothed = null;
  }

  return {
    ingest,
    ingestHeading,
    reset,
    isLocked: () => locked,
  };
}

export function readScreenOrientationDeg(
  screenAngle?: number | null,
  windowOrientation?: number | null,
): number {
  if (typeof screenAngle === 'number' && Number.isFinite(screenAngle)) {
    return normalizeHeadingDegrees(screenAngle);
  }
  if (typeof windowOrientation === 'number' && Number.isFinite(windowOrientation)) {
    return normalizeHeadingDegrees(windowOrientation);
  }
  return 0;
}
