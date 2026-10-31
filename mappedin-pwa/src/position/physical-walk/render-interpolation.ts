import { RouteGuidedInterpolation, RouteGuidedWalk } from './route-guided';
import type { RouteCoordinate } from '../../types';
import { PHYSICAL_WALK_TUNING, type InterpolationTuning } from './tuning';
import type { GeoPoint } from './transform';
export interface RenderPoint extends GeoPoint { floorId?: string; distanceAlongRoute?: number }
/** Presentation only. This class has no route, distance, speed or sensor output. */
export class PositionInterpolation {
  private guided: RouteGuidedInterpolation | null = null;
  setRoute(path: RouteCoordinate[] | null): void { this.reset(); this.guided = path ? new RouteGuidedInterpolation(new RouteGuidedWalk(path)) : null; }
  private lastRendered: RenderPoint | null = null;
  constructor(private readonly config: InterpolationTuning = PHYSICAL_WALK_TUNING.interpolation) {}
  /** Acknowledge a coordinate only after the renderer submitted it successfully. */
  markRendered(point: RenderPoint): void { this.lastRendered = { ...point }; if (point.distanceAlongRoute != null) this.guided?.markRendered(point.distanceAlongRoute); }
  private from: RenderPoint | null = null;
  private target: RenderPoint | null = null;
  private startedAt = 0;
  private duration = 0;
  get durationMs(): number { return this.guided?.durationMs ?? this.duration; }
  reset(): void { this.from = null; this.target = null; this.lastRendered = null; this.duration = 0; this.startedAt = 0; }
  setTarget(target: RenderPoint, now: number): void {
    if (this.guided && target.distanceAlongRoute != null) this.guided.setTarget(target.distanceAlongRoute, now);
    if (this.target && this.target.latitude === target.latitude && this.target.longitude === target.longitude && this.target.floorId === target.floorId) return;
    const current = this.lastRendered;
    const interval = now - this.startedAt;
    this.from = current ?? { ...target }; this.target = { ...target };
    this.duration = current && current.floorId === target.floorId &&
      (Math.abs(current.latitude - target.latitude) > 1e-12 || Math.abs(current.longitude - target.longitude) > 1e-12) ? Math.max(this.config.animationMinMs, Math.min(this.config.animationMaxMs, interval * this.config.animationCadenceFactor)) : 0;
    this.startedAt = now;
  }
  sample(now: number): RenderPoint | null {
    if (this.guided) return this.guided.sample(now);
    if (!this.from || !this.target) return null;
    const t = this.duration > 0 ? Math.max(0, Math.min(1, (now - this.startedAt) / this.duration)) : 1;
    const longitudeDelta = ((this.target.longitude - this.from.longitude + 540) % 360) - 180;
    return { latitude: this.from.latitude + (this.target.latitude - this.from.latitude) * t,
      longitude: ((this.from.longitude + longitudeDelta * t + 540) % 360) - 180,
      floorId: this.target.floorId };
  }
  complete(now: number): boolean { return this.guided ? this.guided.complete(now) : now >= this.startedAt + this.duration; }
}
