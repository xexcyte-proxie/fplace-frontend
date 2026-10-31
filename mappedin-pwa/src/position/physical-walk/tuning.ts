/** Physical Walk Demo only. Production GPS, routing and arrival do not import this. */
export const PHYSICAL_WALK_TUNING = Object.freeze({
  movement: Object.freeze({
    deadbandMinMeters: 1.2, // Previously 2m; 40% reduction.
    deadbandAccuracyFactor: 0.3, // Previously 0.5; 40% reduction.
    evidenceWindowMs: 5000, // Previously 10000.
    evidenceMaxSamples: 16,
    evidenceMinSamples: 4,
    evidenceMinSpanSeconds: 3,
    evidenceMinMeters: 1.4, // Previously 2m; 30% reduction.
    evidenceAccuracyFactor: 0.14, // Previously 0.2; 30% reduction.
    evidenceResidualFactor: 3, // Keep the noise-derived requirement intact.
    evidenceMinEfficiency: 0.85,
    evidenceResidualFloorMeters: 0.5,
    evidenceResidualNetFactor: 0.15,
    evidenceMinSpeedMps: 0.2,
    evidenceMaxSpeedMps: 4,
    incrementalMinMeters: 0.35, // Previously 0.5; 30% reduction.
    incrementalAccuracyFactor: 0.035, // Previously 0.05; 30% reduction.
    continuationNetFactor: 0.7, // Only after accepted walking, with all consistency gates.
    continuationMaxGapMs: 5000,
    confirmationRadiusMeters: 3,
  }),
  interpolation: Object.freeze({
    animationMinMs: 180,
    animationMaxMs: 800,
    animationCadenceFactor: 0.8,
  }),
});
// Numeric mapped types allow tests/experiments to inject a complete tuning profile.
export type MovementTuning = { readonly [K in keyof typeof PHYSICAL_WALK_TUNING.movement]: number };
export type InterpolationTuning = { readonly [K in keyof typeof PHYSICAL_WALK_TUNING.interpolation]: number };
export interface PhysicalWalkTuning { readonly movement: MovementTuning; readonly interpolation: InterpolationTuning }
