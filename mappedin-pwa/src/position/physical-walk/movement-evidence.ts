import { PHYSICAL_WALK_TUNING, type MovementTuning } from './tuning';
/** Decision evidence only: never changes coordinates or manufactures sensor precision. */
export interface MotionSample { east: number; north: number; timestamp: number; accuracy: number }
export interface MotionEvidence {
  consistent: boolean; sampleCount: number; sustained: boolean; netMeters: number; residualMeters: number; efficiency: number;
  evidenceThreshold: number; windowSeconds: number; fittedSpeedMps: number;
}
export class MovementEvidenceWindow {
  private samples: MotionSample[] = [];
  constructor(private readonly config: MovementTuning = PHYSICAL_WALK_TUNING.movement) {}
  reset(seed?: MotionSample): void { this.samples = seed ? [{ ...seed }] : []; }
  push(sample: MotionSample): MotionEvidence {
    const c = this.config;
    this.samples.push({ ...sample });
    this.samples = this.samples.filter(p => sample.timestamp - p.timestamp <= c.evidenceWindowMs).slice(-c.evidenceMaxSamples);
    const points = this.samples;
    const first = points[0];
    const span = (sample.timestamp - first.timestamp) / 1000;
    let path = 0;
    for (let i = 1; i < points.length; i++) path += Math.hypot(points[i].east - points[i - 1].east, points[i].north - points[i - 1].north);
    const net = Math.hypot(sample.east - first.east, sample.north - first.north);
    const meanT = points.reduce((sum, p) => sum + (p.timestamp - first.timestamp) / 1000, 0) / points.length;
    const meanE = points.reduce((sum, p) => sum + p.east, 0) / points.length;
    const meanN = points.reduce((sum, p) => sum + p.north, 0) / points.length;
    let variance = 0; let covE = 0; let covN = 0;
    for (const p of points) {
      const dt = (p.timestamp - first.timestamp) / 1000 - meanT;
      variance += dt * dt; covE += dt * (p.east - meanE); covN += dt * (p.north - meanN);
    }
    const velocityE = variance ? covE / variance : 0;
    const velocityN = variance ? covN / variance : 0;
    const residual = Math.sqrt(points.reduce((sum, p) => {
      const dt = (p.timestamp - first.timestamp) / 1000 - meanT;
      return sum + (p.east - meanE - velocityE * dt) ** 2 + (p.north - meanN - velocityN * dt) ** 2;
    }, 0) / points.length);
    const accuracies = points.map(p => p.accuracy).sort((a, b) => a - b);
    const threshold = Math.max(c.evidenceMinMeters, accuracies[Math.floor(accuracies.length / 2)] * c.evidenceAccuracyFactor, residual * c.evidenceResidualFactor);
    const efficiency = path > 0 ? net / path : 0;
    const speed = Math.hypot(velocityE, velocityN);
    const consistent = points.length >= c.evidenceMinSamples && span >= c.evidenceMinSpanSeconds &&
      efficiency >= c.evidenceMinEfficiency && residual <= Math.max(c.evidenceResidualFloorMeters, net * c.evidenceResidualNetFactor) &&
      speed >= c.evidenceMinSpeedMps && speed <= c.evidenceMaxSpeedMps;
    return { consistent, sampleCount: points.length, sustained: consistent && net >= threshold,
      netMeters: net, residualMeters: residual, efficiency, evidenceThreshold: threshold,
      windowSeconds: span, fittedSpeedMps: speed };
  }
}
