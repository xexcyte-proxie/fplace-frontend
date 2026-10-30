/** Decision evidence only: never changes coordinates or manufactures sensor precision. */
export interface MotionSample { east: number; north: number; timestamp: number; accuracy: number }
export interface MotionEvidence {
  sustained: boolean; netMeters: number; residualMeters: number; efficiency: number;
  evidenceThreshold: number; windowSeconds: number; fittedSpeedMps: number;
}
export class MovementEvidenceWindow {
  private samples: MotionSample[] = [];
  reset(seed?: MotionSample): void { this.samples = seed ? [{ ...seed }] : []; }
  push(sample: MotionSample): MotionEvidence {
    this.samples.push({ ...sample });
    this.samples = this.samples.filter(p => sample.timestamp - p.timestamp <= 10000).slice(-16);
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
    const threshold = Math.max(2, accuracies[Math.floor(accuracies.length / 2)] * 0.2, residual * 3);
    const efficiency = path > 0 ? net / path : 0;
    const speed = Math.hypot(velocityE, velocityN);
    return { sustained: points.length >= 4 && span >= 3 && net >= threshold && efficiency >= 0.85 &&
      residual <= Math.max(0.5, net * 0.15) && speed >= 0.2 && speed <= 4,
      netMeters: net, residualMeters: residual, efficiency, evidenceThreshold: threshold,
      windowSeconds: span, fittedSpeedMps: speed };
  }
}
