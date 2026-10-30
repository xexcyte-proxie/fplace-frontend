import { positionDiagnosticsEnabled } from './position-diagnostics';
import { MovementEvidenceWindow } from './movement-evidence';
import { displacement, offset, validatePoint, type GeoPoint } from './transform';
import { PhysicalWalkRecorder } from './recorder';

export function physicalWalkEnabled(): boolean {
  return import.meta.env.VITE_PHYSICAL_WALK_DEMO === '1';
}
export interface PhysicalFix extends GeoPoint {
  accuracy: number; timestamp: number; source: 'gps';
}
export interface VenueFix extends GeoPoint {
  accuracy: number; timestamp: number; source: 'physical-gps-transformed';
  physicalSource: 'gps'; sessionId: string; floorId: string;
  east: number; north: number;
}
export interface ObservationEvidence {
  timestamp: number; accuracy: number; source: 'gps'; venuePosition: GeoPoint;
}
export interface PositionEvidenceSnapshot {
  observation: ObservationEvidence | null;
  acceptedPosition: VenueFix | null;
  displayedPosition: GeoPoint | null;
  lastMovementTimestamp: number | null;
  observationFresh: boolean;
  positionFresh: boolean;
  movementEvidence: 'none' | 'held' | 'accepted';
  sensorHealth: 'waiting' | 'healthy' | 'degraded' | 'stopped';
  recoveryObservations: number;
  originSamples: number;
}
export type WalkState = 'idle' | 'capturing-origin' | 'active' | 'degraded' | 'ended';
export interface SessionOptions { sessionId: string; mapId: string; floorId: string; anchor: GeoPoint }
const MAX_AGE = 15000;
const MAX_ACCURACY = 30;
/** Foundation only: no map, routing, compass or AR imports/subscriptions. */
export class PhysicalWalkSession {
  private currentState: WalkState = 'idle';
  private options: SessionOptions | null = null;
  private origin: PhysicalFix | null = null;
  private candidates: PhysicalFix[] = [];
  private lastRaw: PhysicalFix | null = null;
  private rejectedFix: PhysicalFix | null = null;
  private baseline: { east: number; north: number } = { east: 0, north: 0 };
  private pending: { east: number; north: number } | null = null;
  private lastOutput: VenueFix | null = null;
  private recoverySamples = 0;
  private readonly motionWindow = new MovementEvidenceWindow();
  private recoveryMovementAnchor: { east: number; north: number } | null = null;
  private observation: ObservationEvidence | null = null;
  private lastMovementTimestamp: number | null = null;
  private movementEvidence: PositionEvidenceSnapshot['movementEvidence'] = 'none';
  private stopWatch: (() => void) | null = null;
  constructor(private readonly enabled: boolean = physicalWalkEnabled(),
    readonly recorder = new PhysicalWalkRecorder()) {}
  get state(): WalkState { return this.currentState; }
  get position(): VenueFix | null { return this.lastOutput ? { ...this.lastOutput } : null; }
  /** Fresh observations do not grant movement, speed or arrival evidence. */
  snapshot(now = Date.now()): PositionEvidenceSnapshot {
    const observation = this.observation;
    const observationFresh = observation != null && now - observation.timestamp <= MAX_AGE && observation.timestamp <= now + 1000;
    return {
      observation: observation ? { ...observation, venuePosition: { ...observation.venuePosition } } : null,
      acceptedPosition: this.position,
      displayedPosition: this.lastOutput ? { latitude: this.lastOutput.latitude, longitude: this.lastOutput.longitude } : null,
      lastMovementTimestamp: this.lastMovementTimestamp,
      observationFresh,
      positionFresh: observationFresh && this.state === 'active',
      movementEvidence: this.movementEvidence,
      sensorHealth: this.state === 'ended' ? 'stopped' : this.state === 'degraded' ? 'degraded' :
        this.state === 'active' && observationFresh ? 'healthy' : 'waiting',
      recoveryObservations: this.recoverySamples,
      originSamples: this.candidates.length,
    };
  }
  private interrupt(now: number): void {
    this.motionWindow.reset();
    this.recoverySamples = 0; this.pending = null; this.candidates = [];
    this.movementEvidence = 'none'; this.transition('degraded', now);
  }
  private transition(state: WalkState, now: number): void {
    if (state === 'degraded' && this.currentState !== 'degraded') this.recoverySamples = 0;
    this.currentState = state;
    this.recorder.record('session.state', { state, sessionId: this.options?.sessionId }, now);
  }
  start(options: SessionOptions, now = Date.now()): void {
    if (!this.enabled) throw new Error('Physical Walk Demo is disabled');
    if (!['idle', 'ended'].includes(this.state)) throw new Error('End the current session before starting');
    validatePoint(options.anchor);
    if (!options.sessionId || !options.mapId || !options.floorId) throw new Error('Session identities and floor are required');
    this.options = { ...options, anchor: { ...options.anchor } };
    this.origin = null; this.candidates = []; this.lastRaw = null;
    this.baseline = { east: 0, north: 0 }; this.pending = null; this.lastOutput = null; this.recoverySamples = 0;
    this.observation = null; this.lastMovementTimestamp = null; this.movementEvidence = 'none';
    this.recoveryMovementAnchor = null; this.motionWindow.reset();
    this.transition('capturing-origin', now);
  }
  end(now = Date.now()): void {
    this.stopWatch?.(); this.stopWatch = null;
    this.origin = null; this.lastRaw = null; this.candidates = []; this.pending = null;
    this.recoverySamples = 0; this.movementEvidence = 'none';
    this.transition('ended', now);
  }
  reset(options: SessionOptions, now = Date.now()): void {
    if (options.sessionId === this.options?.sessionId) throw new Error('Reset requires a new session ID');
    this.end(now); this.start(options, now);
  }
  /** Caller explicitly opts into hardware; no subscriber or renderer is invoked. */
  watch(geolocation: Geolocation = navigator.geolocation, onUpdate?: () => void): void {
    if (!this.options || !['capturing-origin', 'active', 'degraded'].includes(this.state)) throw new Error('Start a session first');
    if (this.stopWatch) return;
    const session = this.options;
    const id = geolocation.watchPosition(p => {
      if (this.options !== session || this.state === 'ended') return;
      this.ingest({ latitude: p.coords.latitude, longitude: p.coords.longitude,
        accuracy: p.coords.accuracy, timestamp: p.timestamp, source: 'gps' });
      onUpdate?.();
    }, () => {
      if (this.options !== session || this.state === 'ended') return;
      this.recorder.record('gps.error', { reason: 'browser-geolocation-error' }, Date.now());
      this.interrupt(Date.now());
      onUpdate?.();
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
    this.stopWatch = () => geolocation.clearWatch(id);
  }
  /** Also called by a future UI heartbeat; never makes movement. */
  checkFreshness(now = Date.now()): void {
    if (this.lastRaw && now - this.lastRaw.timestamp > MAX_AGE &&
        ['active', 'degraded', 'capturing-origin'].includes(this.state) &&
        (this.state !== 'degraded' || this.recoverySamples > 0)) this.interrupt(now);
  }

  ingest(input: PhysicalFix, now = Date.now()): VenueFix | null {
    if (!this.options || ['idle', 'ended'].includes(this.state)) return null;
    this.checkFreshness(now);
    this.movementEvidence = 'none';
    const fix = { ...input }; this.rejectedFix = fix;
    if (positionDiagnosticsEnabled() && this.origin && this.options) {
      try {
        const delta = displacement(this.origin, fix); const raw = offset(this.options.anchor, delta);
        this.recorder.record('position.audit.raw', { rawLatitude: raw.latitude, rawLongitude: raw.longitude,
          accuracy: fix.accuracy, fixTimestamp: fix.timestamp, fixAgeMs: now - fix.timestamp,
          sessionId: this.options.sessionId, reason: 'before-validation-not-trusted' }, now);
      } catch {
        this.recorder.record('position.audit.raw-unavailable', { fixTimestamp: fix.timestamp, reason: 'invalid-or-out-of-session-radius' }, now);
      }
    }
    this.recorder.record('gps.sample', { fixTimestamp: fix.timestamp, accuracy: fix.accuracy,
      fixAgeMs: now - fix.timestamp, source: fix.source }, now);
    let valid = true;
    try { validatePoint(fix); } catch { valid = false; }
    if (!valid || fix.source !== 'gps' || !Number.isFinite(fix.accuracy) || fix.accuracy <= 0 ||
        fix.accuracy > MAX_ACCURACY || !Number.isFinite(fix.timestamp) ||
        fix.timestamp > now + 1000 || now - fix.timestamp > MAX_AGE ||
        (this.lastRaw && fix.timestamp <= this.lastRaw.timestamp)) {
      const reason = !valid || fix.source !== 'gps' ? 'invalid-coordinate-or-source' :
        !Number.isFinite(fix.accuracy) || fix.accuracy <= 0 || fix.accuracy > MAX_ACCURACY ? 'accuracy-gate' :
        !Number.isFinite(fix.timestamp) || fix.timestamp > now + 1000 || now - fix.timestamp > MAX_AGE ? 'timestamp-age-gate' : 'duplicate-or-out-of-order';
      return this.reject(reason, now);
    }
    if (this.lastRaw && fix.timestamp - this.lastRaw.timestamp <= MAX_AGE) {
      let delta;
      try { delta = displacement(this.lastRaw, fix); } catch { return this.reject('jump-out-of-range', now); }
      const distance = Math.hypot(delta.east, delta.north);
      const uncertainty = Math.max(this.lastRaw.accuracy, fix.accuracy);
      if (distance > 4 * (fix.timestamp - this.lastRaw.timestamp) / 1000 + uncertainty) return this.reject('implausible-jump', now);
    }
    // Validate all rejection gates before refreshing trusted observation evidence.
    let delta = { east: 0, north: 0 };
    let venuePosition: GeoPoint = { ...this.options.anchor };
    if (this.origin) {
      try { delta = displacement(this.origin, fix); venuePosition = offset(this.options.anchor, delta); }
      catch { return this.reject('session-radius-exceeded', now); }
    }
    const recovering = this.state === 'degraded';
    this.lastRaw = fix;
    this.observation = { timestamp: fix.timestamp, accuracy: fix.accuracy, source: fix.source, venuePosition };
    this.recorder.record('observation.valid', { fixTimestamp: fix.timestamp, accuracy: fix.accuracy }, now);
    if (recovering) {
      this.recoverySamples++;
      this.pending = null;
      if (this.recoverySamples >= 2) {
        this.transition(this.origin ? 'active' : 'capturing-origin', now);
        this.recoverySamples = 0;
        this.recoveryMovementAnchor = delta;
        this.motionWindow.reset({ ...delta, timestamp: fix.timestamp, accuracy: fix.accuracy });
      }
      this.recorder.record('fix.held', { reason: 'recovery-evidence-only', accuracy: fix.accuracy, fixTimestamp: fix.timestamp, ...delta,
        candidateEast: delta.east - this.baseline.east, candidateNorth: delta.north - this.baseline.north,
        distanceFromAccepted: Math.hypot(delta.east - this.baseline.east, delta.north - this.baseline.north),
        threshold: Math.max(2, Math.max(fix.accuracy, this.lastOutput?.accuracy ?? fix.accuracy) * 0.5),
        bearing: (Math.atan2(delta.east - this.baseline.east, delta.north - this.baseline.north) * 180 / Math.PI + 360) % 360, count: this.recoverySamples }, now);
      // Recovery restores readiness only, never movement through an unknown outage.
      return null;
    }
    if (!this.origin) {
      this.candidates.push(fix);
      this.candidates = this.candidates.filter(p => fix.timestamp - p.timestamp <= 10000).slice(-8);
      const first = this.candidates[0];
      const stable = this.candidates.length >= 3 && fix.timestamp - first.timestamp >= 2000 &&
        this.candidates.every(p => {
          try { const d = displacement(first, p); return Math.hypot(d.east, d.north) <= 5; } catch { return false; }
        });
      if (!stable) { this.recorder.record('origin.waiting', { reason: 'stable-origin-window-required', accuracy: fix.accuracy, fixTimestamp: fix.timestamp, count: this.candidates.length }, now); return null; }
      // Choose an actual stable observed fix; retain its reported uncertainty.
      this.origin = this.candidates.reduce((best, p) => p.accuracy < best.accuracy ? p : best);
      if (positionDiagnosticsEnabled()) {
        const delta = displacement(this.origin, fix);
        this.recorder.record('position.audit.origin', { originFixTimestamp: this.origin.timestamp,
          fixTimestamp: fix.timestamp, captureOffsetEast: delta.east, captureOffsetNorth: delta.north,
          reason: 'selected-origin-versus-capture-observation' }, now);
      }
      this.candidates = []; this.transition('active', now);
      this.motionWindow.reset({ east: 0, north: 0, timestamp: fix.timestamp, accuracy: fix.accuracy });
      this.recorder.record('origin.captured', { accuracy: this.origin.accuracy }, now);
      return this.publish({ east: 0, north: 0 }, this.origin, now);
    }
    this.recorder.record('transform.sample', { ...delta, fixTimestamp: fix.timestamp, accuracy: fix.accuracy }, now);
    const reference = this.recoveryMovementAnchor ?? this.baseline;
    const move = { east: delta.east - reference.east, north: delta.north - reference.north };
    const distance = Math.hypot(move.east, move.north);
    // Keep the original isolated-fix deadband. Sustained low-scatter walking is a
    // separate evidence path, not a blanket lowering of GPS quality thresholds.
    const threshold = Math.max(2, Math.max(fix.accuracy, this.lastOutput?.accuracy ?? this.origin.accuracy) * 0.5);
    const trend = this.motionWindow.push({ ...delta, timestamp: fix.timestamp, accuracy: fix.accuracy });
    const incrementalThreshold = Math.max(0.5, fix.accuracy * 0.05);
    const sustained = trend.sustained && distance >= incrementalThreshold;
    const heldReason = distance < threshold ? 'below-accuracy-deadband' : 'awaiting-coherent-confirmation';
    const distanceFromAccepted = Math.hypot(delta.east - this.baseline.east, delta.north - this.baseline.north);
    const details = { trajectoryConfirmed: trend.sustained, accuracy: fix.accuracy, fixTimestamp: fix.timestamp, ...delta,
      candidateEast: move.east, candidateNorth: move.north, distanceFromAccepted,
      threshold, incrementalThreshold, bearing: (Math.atan2(move.east, move.north) * 180 / Math.PI + 360) % 360,
      netMeters: trend.netMeters, residualMeters: trend.residualMeters, efficiency: trend.efficiency,
      evidenceThreshold: trend.evidenceThreshold, windowSeconds: trend.windowSeconds, fittedSpeedMps: trend.fittedSpeedMps };
    const coherent = this.pending && move.east * this.pending.east + move.north * this.pending.north > 0 &&
      Math.hypot(move.east - this.pending.east, move.north - this.pending.north) <= Math.max(3, threshold);
    if (!sustained && (distance < threshold || !coherent)) {
      this.pending = distance >= threshold ? move : null;
      this.recorder.record('fix.held', { ...details, reason: heldReason,
        classification: distance < threshold ? 'stationary-or-uncertain' : 'uncertain' }, now);
      this.movementEvidence = 'held';
      return null; // Retain original accepted timestamp, never refresh a held position.
    }
    this.recorder.record('movement.accepted', { ...details, reason: sustained ? 'sustained-low-scatter-trajectory' : 'accuracy-deadband-and-confirmation' }, now);
    this.pending = null; this.baseline = delta; this.transition('active', now);
    this.recoveryMovementAnchor = null;
    this.lastMovementTimestamp = fix.timestamp; this.movementEvidence = 'accepted';
    return this.publish(delta, fix, now);
  }
  private reject(reason: string, now: number): null {
    this.pending = null; this.motionWindow.reset(); this.recoverySamples = 0; this.movementEvidence = 'none';
    this.recorder.record('fix.rejected', { reason, accuracy: this.rejectedFix?.accuracy, fixTimestamp: this.rejectedFix?.timestamp }, now); return null;
  }
  private publish(delta: { east: number; north: number }, fix: PhysicalFix, now: number): VenueFix {
    const options = this.options!;
    this.lastOutput = { ...offset(options.anchor, delta), ...delta, accuracy: fix.accuracy,
      timestamp: fix.timestamp, source: 'physical-gps-transformed', physicalSource: fix.source,
      sessionId: options.sessionId, floorId: options.floorId };
    this.recorder.record('position.accepted', { ...delta, accuracy: fix.accuracy,
      fixTimestamp: fix.timestamp, venueLatitude: this.lastOutput.latitude,
      venueLongitude: this.lastOutput.longitude }, now);
    return { ...this.lastOutput };
  }
}
