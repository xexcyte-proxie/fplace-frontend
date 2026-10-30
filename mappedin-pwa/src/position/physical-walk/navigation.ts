import { PositionPipelineAudit, positionDiagnosticsEnabled } from './position-diagnostics';
import { PhysicalWalkSession, type VenueFix, type SessionOptions } from './session';
import { PhysicalWalkRecorder } from './recorder';
import { displacement } from './transform';
import { coordinateTransformationService as geometry } from '../../routing/coordinate-transformation-service';
import { computeLiveRemainingMeters, estimateLiveWalkSeconds, hasArrivedAtDestination } from '../../routing/route-progress';
import type { RoutePayload, RouteCoordinate } from '../../types';
import { isUsableLiveFix } from '../domain/live-fix-quality';

export interface WalkMetrics {
  physicalMeters: number; alongMeters: number; remainingMeters: number;
  percent: number; speedMps: number; elapsedSeconds: number; remainingSeconds: number | null;
  eta: number | null; offRouteMeters: number; arrived: boolean;
}
export interface WalkHost {
  acquire(): void;
  release(): void;
  render(position: VenueFix): void;
  progress(metrics: WalkMetrics, projected: RouteCoordinate | null): void;
}
/** 2D-only orchestration. Timers maintain freshness/time displays, never motion. */
export class PhysicalWalkNavigation {
  readonly recorder = new PhysicalWalkRecorder();
  readonly positionAudit: PositionPipelineAudit | null;
  private session = new PhysicalWalkSession(true, this.recorder);
  private route: RoutePayload | null = null;
  private startedAt = 0;
  private captureAt = 0;
  private recoveryNoticeUntil = 0;
  private observationAt = -1;
  private movementAt = -1;
  private previous: VenueFix | null = null;
  private continuity = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  running = false;
  status = 'Select start and destination — physical demo starts automatically';
  metrics: WalkMetrics | null = null;
  get sessionState(): string { return this.session.state; }
  constructor(private readonly host: WalkHost, private readonly clock = () => Date.now()) {
    this.positionAudit = positionDiagnosticsEnabled() ? new PositionPipelineAudit(this.recorder, clock) : null;
  }
  start(options: SessionOptions, route: RoutePayload, geo: Geolocation = navigator.geolocation): void {
    this.end();
    this.session = new PhysicalWalkSession(true, this.recorder);
    this.positionAudit?.begin(options, route);
    this.session.start(options, this.clock()); this.route = route;
    this.captureAt = this.clock(); this.startedAt = 0; this.recoveryNoticeUntil = 0;
    this.observationAt = -1; this.movementAt = -1; this.previous = null; this.continuity = false;
    const total = geometry.totalPathLengthMeters(route.pathCoordinates);
    this.metrics = { physicalMeters: 0, alongMeters: 0, remainingMeters: total, percent: 0,
      speedMps: 0, elapsedSeconds: 0, remainingSeconds: estimateLiveWalkSeconds({ remainingMeters: total, totalPathMeters: total, routeDurationSeconds: route.durationSeconds }), eta: null, offRouteMeters: 0, arrived: false };
    this.running = true;
    try {
      this.host.acquire();
      this.host.render({ ...options.anchor, east: 0, north: 0, floorId: options.floorId,
        source: 'physical-gps-transformed', physicalSource: 'gps', sessionId: options.sessionId,
        timestamp: this.clock(), accuracy: 30 }); // Explicit preview placement, never movement evidence.
      this.recorder.record('blue-dot.preview', { venueLatitude: options.anchor.latitude, venueLongitude: options.anchor.longitude, reason: 'selected-start-not-gps-evidence' }, this.clock());
      this.status = 'Capturing physical origin (up to 30 seconds)…';
      this.session.watch(geo, () => this.update());
      this.timer = setInterval(() => this.update(), 250);
      this.update();
    } catch {
      this.end(); this.status = 'GPS unavailable — check permission and retry';
    }
  }
  end(): void {
    const owned = this.running; this.running = false;
    if (this.timer) clearInterval(this.timer); this.timer = null;
    this.session.end(this.clock());
    if (owned) { this.recorder.record('provider.release', { provider: 'physical-walk' }, this.clock()); this.host.release(); this.status = 'Ended — start again to reset'; }
  }
  /** Public deterministic entry point; hardware and fixtures share the same session contract. */
  ingest(fix: Parameters<PhysicalWalkSession['ingest']>[0]): void {
    if (!this.running) return;
    this.session.ingest(fix, this.clock()); this.update();
  }
  update(): void {
    if (!this.running || !this.route || !this.metrics) return;
    const now = this.clock(); this.session.checkFreshness(now);
    const snapshot = this.session.snapshot(now);
    if (!snapshot.acceptedPosition && now - this.captureAt >= 30000) {
      this.end(); this.status = 'Origin capture timed out — hold still outdoors and Retry'; return;
    }
    this.status = snapshot.acceptedPosition ? (snapshot.positionFresh ? 'Physical walk active' : 'GPS degraded — position retained') : `Capturing physical origin… ${snapshot.originSamples}/3 samples (stable for 2 seconds)`;
    if (!snapshot.acceptedPosition && snapshot.sensorHealth === 'degraded') this.status = 'GPS unavailable during origin capture — Retry or Cancel';
    if (snapshot.positionFresh && now < this.recoveryNoticeUntil) this.status = 'GPS recovered — position reconciled; outage distance excluded';
    if (!snapshot.positionFresh) { this.previous = null; this.continuity = false; this.metrics.speedMps = 0; }
    const observation = snapshot.observation;
    if (observation && observation.timestamp !== this.observationAt) {
      this.observationAt = observation.timestamp;
      if (snapshot.lastMovementTimestamp == null || observation.timestamp - snapshot.lastMovementTimestamp >= 5000) this.metrics.speedMps = 0;
      this.recorder.record('navigation.metrics', { physicalMeters: this.metrics.physicalMeters, alongMeters: this.metrics.alongMeters,
        remainingMeters: this.metrics.remainingMeters, speedMps: this.metrics.speedMps, remainingSeconds: this.metrics.remainingSeconds,
        elapsedSeconds: this.metrics.elapsedSeconds, eta: this.metrics.eta }, now);
      this.recorder.record('navigation.observation', { fixTimestamp: observation.timestamp,
        accuracy: observation.accuracy, venueLatitude: observation.venuePosition.latitude, venueLongitude: observation.venuePosition.longitude, observationFresh: snapshot.observationFresh,
        positionFresh: snapshot.positionFresh, sensorHealth: snapshot.sensorHealth,
        movementEvidence: snapshot.movementEvidence }, now);
    }
    let projection: RouteCoordinate | null = null;
    const position = snapshot.acceptedPosition;
    if (position && position.timestamp !== this.movementAt && snapshot.positionFresh && !this.metrics.arrived) {
      this.movementAt = position.timestamp;
      if (!this.startedAt) this.startedAt = now;
      const initial = snapshot.lastMovementTimestamp == null;
      if (initial || snapshot.movementEvidence === 'accepted') {
        const fresh = isUsableLiveFix(position, now);
        if (fresh) {
          // Outage distance is unknown; never integrate across a continuity break.
          if (this.previous && this.continuity) {
            const d = displacement(this.previous, position);
            const meters = Math.hypot(d.east, d.north);
            this.metrics.physicalMeters += meters;
            this.metrics.speedMps = meters / Math.max(0.001, (position.timestamp - this.previous.timestamp) / 1000);
          }
          if (!initial && !this.continuity) {
            this.recoveryNoticeUntil = now + 5000;
            this.status = 'GPS recovered — position reconciled; outage distance excluded';
            this.recorder.record('navigation.continuity-break', { reason: 'outage-distance-excluded' }, now);
          }
          this.previous = position; this.continuity = true;
          this.host.render(position);
          this.recorder.record('blue-dot.request', { venueLatitude: position.latitude, venueLongitude: position.longitude, fixTimestamp: position.timestamp }, now);
          if (!initial && !this.metrics.arrived) projection = this.project(position);
        }
      }
    }
    // Fresh stationary observations change readiness, not movement-dependent metrics.
    // No timer-derived speed, distance or progress. Stationary observations set speed to zero above.
    this.metrics.elapsedSeconds = this.startedAt ? (now - this.startedAt) / 1000 : 0;
    this.metrics.eta = snapshot.positionFresh && this.metrics.offRouteMeters <= 30 && this.metrics.remainingSeconds != null ? now + this.metrics.remainingSeconds * 1000 : null;
    this.host.progress({ ...this.metrics }, projection);
    this.positionAudit?.sample(this.metrics);
  }
  private project(position: VenueFix): RouteCoordinate | null {
    const route = this.route!; const metrics = this.metrics!;
    const snap = geometry.snapToRoute(route.pathCoordinates, position.latitude, position.longitude,
      { floorId: position.floorId, previousAlongMeters: metrics.alongMeters, preferVenue: true });
    if (!snap) return null;
    const total = geometry.totalPathLengthMeters(route.pathCoordinates);
    this.positionAudit?.projection(snap, (snap.offRouteMeters ?? Infinity) <= 30, position.timestamp);
    metrics.offRouteMeters = snap.offRouteMeters ?? Infinity;
    // Existing 30m route quality bound. Keep unsnapped dot even outside it.
    if (metrics.offRouteMeters <= 30) {
      metrics.alongMeters = snap.distanceAlongPathMeters;
      metrics.remainingMeters = computeLiveRemainingMeters({ totalPathMeters: total, alongPathMeters: metrics.alongMeters, offRouteMeters: metrics.offRouteMeters });
      metrics.percent = total ? Math.min(100, metrics.alongMeters / total * 100) : 0;
      metrics.remainingSeconds = estimateLiveWalkSeconds({ remainingMeters: metrics.remainingMeters, totalPathMeters: total, routeDurationSeconds: route.durationSeconds });
      metrics.arrived = metrics.arrived || (position.accuracy <= 10 && hasArrivedAtDestination({ totalPathMeters: total, alongPathMeters: metrics.alongMeters, offRouteMeters: metrics.offRouteMeters }));

    }
    if (metrics.arrived) { metrics.remainingMeters = 0; metrics.remainingSeconds = 0; metrics.speedMps = 0; }
    this.recorder.record('route.projection', { reason: metrics.offRouteMeters <= 30 ? 'qualified-projection' : 'off-route-quality-gate-progress-held', fixTimestamp: position.timestamp, alongMeters: metrics.alongMeters, remainingMeters: metrics.remainingMeters,
      offRouteMeters: metrics.offRouteMeters, physicalMeters: metrics.physicalMeters, speedMps: metrics.speedMps,
      remainingSeconds: metrics.remainingSeconds, arrived: metrics.arrived }, this.clock());
    return metrics.offRouteMeters <= 30 ? snap : null;
  }
}
