import type { NavigationProgressSnapshot } from '../types';
import { RouteGuidedWalk, ROUTE_GUIDED_WALK_SPEED_MPS, type PhysicalWalkMode } from './route-guided';
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
  isCurrentRoute?(route: RoutePayload): boolean;
  acquire(): void;
  release(): void;
  render(position: VenueFix): void;
  progress(metrics: WalkMetrics, projected: RouteCoordinate | null): void;
}
/** Physical-walk orchestration shared by 2D and AR. Timers maintain freshness/time displays, never motion. */
export class PhysicalWalkNavigation {
  readonly recorder = new PhysicalWalkRecorder();
  readonly positionAudit: PositionPipelineAudit | null;
  private session = new PhysicalWalkSession(true, this.recorder);
  private route: RoutePayload | null = null;
  mode: PhysicalWalkMode = 'raw';
  private guided: RouteGuidedWalk | null = null;
  private guidedSequence = 0;
  private sessionId = '';
  private routeSignature = '';
  private visibilityHandler = () => {
    if (this.mode === 'route-guided' && document.visibilityState === 'hidden') {
      this.end(); this.status = 'Route-Guided Physical Walk Demo paused in background — restart to capture a new origin';
    }
  };
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
  /** Committed authority, never a rendered/interpolated dot or a second GPS projection. */
  get progressSnapshot(): NavigationProgressSnapshot | null {
    if (!this.running || !this.guided || !this.route) return null;
    const point = this.guided.at();
    return { alongPathMeters: this.guided.progress, routeTraveledMeters: this.guided.progress,
      routeRemainingMeters: this.guided.remaining, routeSimulating: false,
      routeSimulationComplete: this.guided.arrived, latitude: point.latitude, longitude: point.longitude,
      floorId: point.floorId, source: 'physical-gps-transformed', navigationAuthority: 'parent-physical-walk',
      simulationSessionId: this.sessionId, simulationSequence: this.guidedSequence,
      routeId: this.route.routeId, routeVersion: this.route.routeVersion };
  }
  constructor(private readonly host: WalkHost, private readonly clock = () => Date.now()) {
    this.positionAudit = positionDiagnosticsEnabled() ? new PositionPipelineAudit(this.recorder, clock) : null;
  }
  start(options: SessionOptions, route: RoutePayload, geo: Geolocation = navigator.geolocation, mode: PhysicalWalkMode = this.mode): void {
    this.end();
    this.sessionId = options.sessionId;
    this.mode = mode;
    this.guided = mode === 'route-guided' ? new RouteGuidedWalk(route.pathCoordinates) : null;
    if (this.guided && typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      this.status = 'Route-Guided Physical Walk Demo requires a visible page — restart when foregrounded'; return;
    }
    this.guidedSequence = 0;
    this.routeSignature = JSON.stringify(route.pathCoordinates);
    if (this.guided) options = { ...options, anchor: this.guided.path[0] };
    this.session = new PhysicalWalkSession(true, this.recorder, undefined, this.guided ? 3000 : undefined);
    this.recorder.record('demo.mode', { mode, buildFingerprint: import.meta.env.VITE_BUILD_FINGERPRINT ?? __WALK_BUILD_FINGERPRINT__, speedMps: this.guided ? ROUTE_GUIDED_WALK_SPEED_MPS : 0 }, this.clock());
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
        timestamp: this.clock(), accuracy: 30, ...(this.guided ? { distanceAlongRoute: 0 } : {}) }); // Explicit preview placement, never movement evidence.
      this.recorder.record('blue-dot.preview', { venueLatitude: options.anchor.latitude, venueLongitude: options.anchor.longitude, reason: 'selected-start-not-gps-evidence' }, this.clock());
      this.status = 'Capturing physical origin (up to 30 seconds)…';
      if (this.guided && typeof document !== 'undefined') document.addEventListener('visibilitychange', this.visibilityHandler);
      this.session.watch(geo, () => this.update());
      this.timer = setInterval(() => this.update(), 250);
      this.update();
    } catch {
      this.end(); this.status = 'GPS unavailable — check permission and retry';
    }
  }
  end(): void {
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.visibilityHandler);
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
    if (this.guided && (this.host.isCurrentRoute?.(this.route) === false || JSON.stringify(this.route.pathCoordinates) !== this.routeSignature)) {
      this.end(); this.status = 'Route geometry changed — restart Route-Guided Physical Walk Demo'; return;
    }
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
    if (this.guided) { this.updateGuided(snapshot, now); return; }
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
  private updateGuided(snapshot: ReturnType<PhysicalWalkSession['snapshot']>, now: number): void {
    const engine = this.guided!; const metrics = this.metrics!;
    const event = snapshot.walkingIncrement;
    let committed = 0;
    const newlyAccepted = event != null && event.sequence !== this.guidedSequence;
    if (event && snapshot.positionFresh && snapshot.movementEvidence === 'accepted' && now - event.timestamp <= 3000) committed = engine.commit(event);
    if (newlyAccepted) this.guidedSequence = event!.sequence;
    const point = engine.at();
    metrics.physicalMeters = engine.totalWalked; metrics.alongMeters = engine.progress;
    metrics.remainingMeters = engine.remaining; metrics.percent = engine.progress / engine.length * 100;
    metrics.offRouteMeters = 0; metrics.arrived = engine.arrived;
    metrics.remainingSeconds = engine.remaining / ROUTE_GUIDED_WALK_SPEED_MPS;
    metrics.speedMps = !engine.arrived && snapshot.positionFresh ? ROUTE_GUIDED_WALK_SPEED_MPS : 0;
    metrics.eta = snapshot.positionFresh ? now + metrics.remainingSeconds * 1000 : null;
    if (!this.startedAt && snapshot.acceptedPosition) this.startedAt = now;
    metrics.elapsedSeconds = this.startedAt ? (now - this.startedAt) / 1000 : 0;
    if (newlyAccepted) this.recorder.record('route-guided.distance', {
      candidateMeters: event?.meters, committedMeters: committed, physicalMeters: engine.totalWalked,
      alongMeters: engine.progress, routeLength: engine.length, remainingMeters: engine.remaining,
      accuracy: snapshot.observation?.accuracy, observationFresh: snapshot.observationFresh,
      fixTimestamp: event?.timestamp, fixAgeMs: event ? now - event.timestamp : null,
      movementEvidence: snapshot.movementEvidence }, now);
    if (committed > 0 && snapshot.acceptedPosition) {
      this.host.render({ ...snapshot.acceptedPosition, ...point });
      this.recorder.record('route-guided.commit', { candidateMeters: event?.meters, committedMeters: committed,
        physicalMeters: engine.totalWalked, alongMeters: engine.progress, routeLength: engine.length,
        remainingMeters: engine.remaining, segmentIndex: point.segmentIndex, venueLatitude: point.latitude,
        venueLongitude: point.longitude, accuracy: snapshot.observation?.accuracy, observationFresh: snapshot.observationFresh,
        movementEvidence: snapshot.movementEvidence, arrived: engine.arrived,
        reason: engine.arrived ? 'credible-walking-distance-reached-route-end' : 'accepted-walking-distance' }, now);
    }
    if (engine.arrived) { this.session.end(now); if (this.timer) clearInterval(this.timer); this.timer = null; this.status = 'Route-Guided Physical Walk Demo arrived — held at route end'; }
    else this.status = `Route-Guided Physical Walk Demo · simulated route-guided walk · ${this.status}`;
    this.host.progress({ ...metrics }, point);
    this.positionAudit?.sample(metrics);
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
