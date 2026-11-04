import type { RouteCoordinate } from '../../types';
import { coordinateTransformationService as geometry } from '../../routing/coordinate-transformation-service';
import { segmentHorizontalMeters } from '../../utils/geo-math';
import { validatePoint } from './transform';

export type PhysicalWalkMode = 'raw' | 'route-guided';
/** Explicit demo ETA policy; not an estimate of measured physical speed. */
export const ROUTE_GUIDED_WALK_SPEED_MPS = 1.2;
export interface WalkingDistanceIncrement { sequence: number; meters: number; timestamp: number }
/** Replaceable estimator boundary: increments are accepted once, never GPS positions/bearings. */
export interface WalkingDistanceSource { walkingIncrement: WalkingDistanceIncrement | null }
export class RouteGuidedWalk {
  readonly path: RouteCoordinate[];
  readonly cumulative: number[] = [0];
  readonly length: number;
  progress = 0;
  totalWalked = 0;
  private sequence = 0;
  constructor(path: RouteCoordinate[]) {
    if (path.length < 2) throw new Error('Route-guided walk requires a route polyline');
    this.path = path.map(p => { validatePoint(p); return { ...p }; });
    if (!this.path[0].floorId || this.path[0].floorId === 'unknown' || this.path.some(p => p.floorId !== this.path[0].floorId)) throw new Error('Route-guided walk requires one known floor');
    for (let i = 1; i < this.path.length; i++) this.cumulative.push(this.cumulative[i - 1] + segmentHorizontalMeters(this.path[i - 1], this.path[i]));
    this.length = this.cumulative.at(-1)!;
    if (!Number.isFinite(this.length) || this.length <= 0) throw new Error('Route-guided walk requires a nonzero route');
  }
  commit(event: WalkingDistanceIncrement): number {
    if (!Number.isInteger(event.sequence) || event.sequence <= this.sequence || !Number.isFinite(event.meters) || event.meters < 0) return 0;
    this.sequence = event.sequence;
    if (this.arrived) return 0;
    this.totalWalked += event.meters;
    const before = this.progress;
    this.progress = Math.min(this.length, this.progress + event.meters);
    return this.progress - before;
  }
  get arrived(): boolean { return this.progress >= this.length; }
  get remaining(): number { return Math.max(0, this.length - this.progress); }
  at(meters = this.progress): RouteCoordinate & { segmentIndex: number; distanceAlongRoute: number } {
    const distance = Math.max(0, Math.min(this.length, meters));
    let i = 0;
    while (i < this.path.length - 2 && this.cumulative[i + 1] <= distance) i++;
    const length = this.cumulative[i + 1] - this.cumulative[i];
    return { ...geometry.interpolateCoordinate(this.path[i], this.path[i + 1], length ? (distance - this.cumulative[i]) / length : 0), segmentIndex: i, distanceAlongRoute: distance };
  }
}
/** Interpolate metres along the polyline, so animation never cuts across a corner. */
export class RouteGuidedInterpolation {
  private from = 0;
  private target = 0;
  private drawn = 0;
  private started = 0;
  constructor(readonly route: RouteGuidedWalk, readonly durationMs = 600) {}
  setTarget(meters: number, now: number): void {
    if (meters === this.target) return;
    this.from = this.drawn; this.target = Math.max(0, Math.min(this.route.length, meters)); this.started = now;
  }
  sample(now: number): ReturnType<RouteGuidedWalk['at']> {
    return this.route.at(this.from + (this.target - this.from) * Math.max(0, Math.min(1, (now - this.started) / this.durationMs)));
  }
  markRendered(meters: number): void { this.drawn = meters; }
  complete(now: number): boolean { return now >= this.started + this.durationMs; }
}
