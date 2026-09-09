/**
 * Indoor GPS nearest-point snap is discontinuous on L-shaped paths: a fix
 * inside the corner is almost equally close to both legs, so the winner
 * flips from the start corridor to the destination corridor.
 *
 * Penalize candidates that jump farther along the polyline than a walking
 * step. Poor GPS accuracy must not enlarge this window. Geometry stays in
 * the snap service; this is the continuity policy.
 */

export const DEFAULT_MAX_ALONG_DELTA_METERS = 12;
const ALONG_JUMP_WEIGHT = 2;
/** Once a candidate leaves the walking window, it must lose a close far-leg snap. */
const MIN_ALONG_JUMP_PENALTY_METERS = 8;

/** Extra metres added to Euclidean snap distance when the candidate skips ahead. */
export function alongPathContinuityPenalty(
  candidateAlongMeters: number,
  previousAlongMeters?: number | null,
  maxAlongDelta = DEFAULT_MAX_ALONG_DELTA_METERS,
): number {
  if (previousAlongMeters == null || !Number.isFinite(previousAlongMeters)) {
    return 0;
  }
  if (!Number.isFinite(candidateAlongMeters)) return 0;
  const excess = Math.abs(candidateAlongMeters - previousAlongMeters) - maxAlongDelta;
  return excess > 0 ? MIN_ALONG_JUMP_PENALTY_METERS + excess * ALONG_JUMP_WEIGHT : 0;
}

export function scoreSnapWithAlongContinuity(options: {
  distToSegment: number;
  alongPathMeters: number;
  previousAlongMeters?: number | null;
  maxAlongDeltaMeters?: number;
}): number {
  return (
    options.distToSegment +
    alongPathContinuityPenalty(
      options.alongPathMeters,
      options.previousAlongMeters,
      options.maxAlongDeltaMeters ?? DEFAULT_MAX_ALONG_DELTA_METERS,
    )
  );
}
