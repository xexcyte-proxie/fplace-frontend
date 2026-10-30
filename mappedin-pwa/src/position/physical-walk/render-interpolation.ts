import type { GeoPoint } from './transform';
export interface RenderPoint extends GeoPoint { floorId?: string }
/** Presentation only. This class has no route, distance, speed or sensor output. */
export class PositionInterpolation {
  private from: RenderPoint | null = null;
  private target: RenderPoint | null = null;
  private startedAt = 0;
  private duration = 0;
  get durationMs(): number { return this.duration; }
  reset(): void { this.from = null; this.target = null; this.duration = 0; }
  setTarget(target: RenderPoint, now: number): void {
    const current = this.sample(now);
    const interval = now - this.startedAt;
    this.from = current ?? { ...target }; this.target = { ...target };
    this.duration = current && current.floorId === target.floorId &&
      (Math.abs(current.latitude - target.latitude) > 1e-12 || Math.abs(current.longitude - target.longitude) > 1e-12) ? Math.max(180, Math.min(800, interval * 0.8)) : 0;
    this.startedAt = now;
  }
  sample(now: number): RenderPoint | null {
    if (!this.from || !this.target) return null;
    const t = this.duration > 0 ? Math.max(0, Math.min(1, (now - this.startedAt) / this.duration)) : 1;
    const longitudeDelta = ((this.target.longitude - this.from.longitude + 540) % 360) - 180;
    return { latitude: this.from.latitude + (this.target.latitude - this.from.latitude) * t,
      longitude: ((this.from.longitude + longitudeDelta * t + 540) % 360) - 180,
      floorId: this.target.floorId };
  }
  complete(now: number): boolean { return now >= this.startedAt + this.duration; }
}
