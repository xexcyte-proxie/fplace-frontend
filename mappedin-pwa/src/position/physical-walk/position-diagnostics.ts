import type { RoutePayload, RouteCoordinate } from '../../types';
import type { SessionOptions } from './session';
import type { DiagnosticEvent } from './recorder';
import { PhysicalWalkRecorder } from './recorder';
import { offset, type GeoPoint } from './transform';
import { haversineMeters } from '../../utils/geo-math';

export function positionDiagnosticsEnabled(): boolean {
  return import.meta.env.VITE_PHYSICAL_WALK_DEMO === '1' &&
    import.meta.env.VITE_PHYSICAL_WALK_POSITION_DIAGNOSTICS === '1';
}
export function positionOverlayEnabled(): boolean {
  return positionDiagnosticsEnabled() && import.meta.env.VITE_PHYSICAL_WALK_POSITION_OVERLAY === '1';
}
export type AuditRole = 'raw' | 'accepted' | 'interpolated' | 'sdk' | 'model' | 'candidate' | 'projected' | 'anchor' | 'routeStart' | 'green';
export interface AuditPoint extends GeoPoint { floorId?: string }
export interface PositionAuditSnapshot {
  sessionId: string; routeId: string; state: string;
  points: Partial<Record<AuditRole, AuditPoint>>;
  accuracy?: number; fixTimestamp?: number; fixAgeMs?: number;
  observationTimestamp?: number; observationAgeMs?: number; acceptedFixTimestamp?: number; acceptedAgeMs?: number; decision?: string;
  gpsDeliveryGapMs?: number; acceptedFixGapMs?: number; acceptedDeliveryGapMs?: number;
  durationMs?: number; frameGapMs?: number; headingAgeMs?: number;
  acceptedTransformErrorM?: number; acceptedToSdkM?: number; acceptedToProjectionM?: number;
  interpolatedToSdkM?: number; sdkToModelM?: number; anchorToRouteStartM?: number;
}
function point(data: Record<string, unknown>, lat: string, lng: string, floorId?: string): AuditPoint | null {
  return typeof data[lat] === 'number' && Number.isFinite(data[lat]) &&
    typeof data[lng] === 'number' && Number.isFinite(data[lng])
    ? { latitude: data[lat] as number, longitude: data[lng] as number, floorId } : null;
}
/** Read-only observer. Its snapshots/markers never feed a navigation consumer. */
export class PositionPipelineAudit {
  private value: PositionAuditSnapshot = { sessionId: '', routeId: '', state: 'idle', points: {} };
  private anchor: AuditPoint | null = null;
  private headingObservedAt: number | null = null;
  private gpsAt: number | null = null;
  private acceptedAt: number | null = null;
  private acceptedFixAt: number | null = null;
  private listeners = new Set<(snapshot: PositionAuditSnapshot) => void>();
  private unsubscribe: () => void;
  constructor(private readonly recorder: PhysicalWalkRecorder, private readonly clock = () => Date.now()) {
    this.unsubscribe = recorder.subscribe(event => this.receive(event));
  }
  begin(options: SessionOptions, route: RoutePayload): void {
    this.anchor = { ...options.anchor, floorId: options.floorId };
    this.value = { sessionId: options.sessionId, routeId: route.routeId, state: 'capturing-origin',
      points: { anchor: { ...this.anchor }, routeStart: route.pathCoordinates[0] ? { ...route.pathCoordinates[0] } : undefined } };
    this.headingObservedAt = null; this.gpsAt = null; this.acceptedAt = null; this.acceptedFixAt = null;
    this.emit('position.audit.context', { mapId: options.mapId, floorId: options.floorId,
      anchorLatitude: options.anchor.latitude, anchorLongitude: options.anchor.longitude,
      routeStartLatitude: route.pathCoordinates[0]?.latitude, routeStartLongitude: route.pathCoordinates[0]?.longitude,
      routeVersion: route.routeVersion });
  }
  greenMarker(position: RouteCoordinate | null | undefined): void {
    if (position) this.value.points.green = { ...position };
    this.emit('position.audit.green-marker', { greenLatitude: position?.latitude, greenLongitude: position?.longitude });
  }
  marker(type: string, data: Record<string, unknown>): void {
    this.recorder.record(type, { ...data, sessionId: this.value.sessionId, routeId: this.value.routeId }, this.clock());
  }
  projection(candidate: RouteCoordinate, qualified: boolean, fixTimestamp: number): void {
    this.value.points.candidate = { ...candidate };
    if (qualified) this.value.points.projected = { ...candidate };
    this.emit('position.audit.projection', { candidateLatitude: candidate.latitude, candidateLongitude: candidate.longitude,
      qualified, fixTimestamp, projectedLatitude: this.value.points.projected?.latitude,
      projectedLongitude: this.value.points.projected?.longitude });
  }
  sample(metrics?: object): void { this.emit('position.audit.snapshot', { ...this.flat(), ...metrics }); }
  snapshot(): PositionAuditSnapshot {
    const copy = JSON.parse(JSON.stringify(this.value)) as PositionAuditSnapshot;
    copy.fixAgeMs = copy.fixTimestamp == null ? undefined : this.clock() - copy.fixTimestamp;
    copy.observationAgeMs = copy.observationTimestamp == null ? undefined : this.clock() - copy.observationTimestamp;
    copy.acceptedAgeMs = copy.acceptedFixTimestamp == null ? undefined : this.clock() - copy.acceptedFixTimestamp;
    copy.headingAgeMs = this.headingObservedAt == null ? undefined : this.clock() - this.headingObservedAt;
    const p = copy.points;
    const distance = (a?: AuditPoint, b?: AuditPoint) => a && b ? haversineMeters(a, b) : undefined;
    copy.acceptedToSdkM = distance(p.accepted, p.sdk);
    copy.acceptedToProjectionM = distance(p.accepted, p.projected);
    copy.interpolatedToSdkM = distance(p.interpolated, p.sdk);
    copy.sdkToModelM = distance(p.sdk, p.model);
    copy.anchorToRouteStartM = distance(p.anchor, p.routeStart);
    return copy;
  }
  subscribe(listener: (snapshot: PositionAuditSnapshot) => void): () => void {
    this.listeners.add(listener); listener(this.snapshot()); return () => this.listeners.delete(listener);
  }
  dispose(): void { this.unsubscribe(); this.listeners.clear(); }
  private receive(event: DiagnosticEvent): void {
    const d = event.data;
    const floor = this.anchor?.floorId;
    if (event.type === 'gps.sample') {
      this.value.gpsDeliveryGapMs = this.gpsAt == null ? undefined : event.at - this.gpsAt;
      this.gpsAt = event.at;
      this.value.fixTimestamp = d.fixTimestamp as number; this.value.accuracy = d.accuracy as number;
    } else if (event.type === 'observation.valid') this.value.observationTimestamp = d.fixTimestamp as number;
    else if (event.type === 'session.state') this.value.state = String(d.state);
    else if (event.type === 'fix.held' || event.type === 'fix.rejected') this.value.decision = `${event.type}: ${d.reason}`;
    else if (event.type === 'position.accepted') {
      const accepted = point(d, 'venueLatitude', 'venueLongitude', floor);
      if (accepted) this.value.points.accepted = accepted;
      this.value.acceptedFixGapMs = this.acceptedFixAt == null ? undefined : Number(d.fixTimestamp) - this.acceptedFixAt;
      this.value.acceptedDeliveryGapMs = this.acceptedAt == null ? undefined : event.at - this.acceptedAt;
      this.value.acceptedFixTimestamp = Number(d.fixTimestamp);
      this.acceptedFixAt = Number(d.fixTimestamp); this.acceptedAt = event.at;
      this.value.decision = 'accepted';
      if (this.anchor && accepted && typeof d.east === 'number' && typeof d.north === 'number') {
        this.value.acceptedTransformErrorM = haversineMeters(offset(this.anchor, { east: d.east, north: d.north }), accepted);
      }
    } else if (event.type.startsWith('position.audit.')) {
      const pairs: Array<[AuditRole, string, string]> = [
        ['raw', 'rawLatitude', 'rawLongitude'], ['interpolated', 'interpolatedLatitude', 'interpolatedLongitude'],
        ['sdk', 'sdkLatitude', 'sdkLongitude'], ['model', 'modelLatitude', 'modelLongitude']];
      for (const [role, lat, lng] of pairs) {
        const roleFloor = d[`${role}FloorId`];
        const value = point(d, lat, lng, typeof roleFloor === 'string' ? roleFloor : floor); if (value) this.value.points[role] = value;
      }
      for (const key of ['durationMs', 'frameGapMs', 'headingAgeMs'] as const) {
        if (typeof d[key] === 'number') this.value[key] = d[key];
      }
      if (typeof d.headingAgeMs === 'number') this.headingObservedAt = this.clock() - d.headingAgeMs;
      // These events are diagnostics only; never create recursive audit records.
      if (event.type === 'position.audit.snapshot') return;
    } else return;
    for (const listener of this.listeners) listener(this.snapshot());
  }
  private flat(): Record<string, unknown> {
    const s = this.snapshot(); const result: Record<string, unknown> = { ...s, points: undefined };
    for (const [role, p] of Object.entries(s.points)) {
      if (p) { result[`${role}Latitude`] = p.latitude; result[`${role}Longitude`] = p.longitude; }
    }
    return result;
  }
  private emit(type: string, data: Record<string, unknown>): void {
    this.recorder.record(type, { ...data, sessionId: this.value.sessionId, routeId: this.value.routeId }, this.clock());
  }
}
