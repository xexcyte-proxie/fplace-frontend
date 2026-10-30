export interface DiagnosticEvent {
  sequence: number; at: number; type: string; data: Record<string, unknown>;
}
/** Only explicitly permitted fields enter storage. Physical latitude/longitude never do. */
const FIELDS = new Set(['sessionId', 'mapId', 'floorId', 'reason', 'state', 'source',
  'observationTimestamp', 'observationAgeMs', 'acceptedFixTimestamp', 'acceptedAgeMs', 'fixTimestamp', 'accuracy', 'fixAgeMs', 'east', 'north', 'classification',
  'observationFresh', 'positionFresh', 'sensorHealth', 'movementEvidence', 'heading',
  'alpha', 'absolute', 'permission', 'headingAgeMs', 'headingFresh', 'headingActive', 'positionOwner', 'visible', 'modelPresent', 'routeState', 'routeId',
  'sdkFloorId', 'modelFloorId', 'currentFloorId', 'routeVersion', 'qualified', 'writer', 'foreignWriter', 'sdkStatus', 'sdkGpsEnabled', 'sdkOrientationEnabled', 'parallel', 'modelObservable', 'pixelPositionObservable', 'gpsDeliveryGapMs', 'acceptedFixGapMs', 'acceptedDeliveryGapMs', 'frameGapMs', 'acceptedTransformErrorM', 'acceptedToSdkM', 'acceptedToProjectionM', 'interpolatedToSdkM', 'sdkToModelM', 'anchorToRouteStartM', 'decision',
  'originFixTimestamp', 'captureOffsetEast', 'captureOffsetNorth', 'cameraBearing', 'cameraPitch', 'cameraZoom',
  'trajectoryConfirmed', 'candidateEast', 'candidateNorth', 'distanceFromAccepted', 'threshold', 'incrementalThreshold', 'bearing',
  'netMeters', 'residualMeters', 'efficiency', 'evidenceThreshold', 'windowSeconds', 'fittedSpeedMps', 'displayLatitude', 'displayLongitude', 'durationMs', 'renderLatitude', 'renderLongitude',
  'percent', 'alongMeters', 'remainingMeters', 'offRouteMeters', 'physicalMeters', 'speedMps',
  'remainingSeconds', 'elapsedSeconds', 'eta', 'arrived', 'provider', 'venueLatitude', 'venueLongitude', 'decision', 'count']);
for (const role of ['raw', 'accepted', 'interpolated', 'sdk', 'model', 'candidate', 'projected', 'anchor', 'routeStart', 'green', 'lastDrawn', 'animationStart', 'callback']) {
  FIELDS.add(`${role}Latitude`); FIELDS.add(`${role}Longitude`);
}
const REPETITIVE = new Set(['orientation.browser-event', 'heading.raw', 'heading.received',
  'heading.filtered', 'heading.published', 'heading.update', 'heading.filter-held',
  'glow.updated', 'glow.inspect-unavailable', 'glow.sdk-status', 'marker.render',
  'position.audit.marker-frame', 'position.audit.sdk-position-event', 'position.audit.sdk-animation-event',
  'position.audit.heading-only-writer', 'position.audit.snapshot']);
export class PhysicalWalkRecorder {
  private events: DiagnosticEvent[] = [];
  private sequence = 0;
  private listeners = new Set<(event: DiagnosticEvent) => void>();
  subscribe(listener: (event: DiagnosticEvent) => void): () => void {
    this.listeners.add(listener); return () => this.listeners.delete(listener);
  }
  private dropped = 0;
  private suppressed = 0;
  private counts: Record<string, number> = {};
  private recent = new Map<string, { at: number; heading?: number; state?: unknown; reason?: unknown }>();
  constructor(private readonly capacity = 5000) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error('Invalid recorder capacity');
  }
  record(type: string, data: Record<string, unknown>, at: number): void {
    this.counts[type] = (this.counts[type] ?? 0) + 1;
    if (REPETITIVE.has(type)) {
      const previous = this.recent.get(type);
      const heading = typeof data.heading === 'number' ? data.heading : undefined;
      const turn = heading != null && previous?.heading != null
        ? Math.abs(((heading - previous.heading + 540) % 360) - 180) >= 10 : false;
      const statusChanged = type === 'glow.sdk-status' && (previous?.state !== data.state || previous?.reason !== data.reason);
      if (previous && at - previous.at < (type.startsWith('position.audit.') && type !== 'position.audit.snapshot' ? 250 : 1000) && !statusChanged && !(turn && at - previous.at >= 100)) {
        this.suppressed++; return;
      }
      this.recent.set(type, { at, heading, state: data.state, reason: data.reason });
    }
    const safe: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (FIELDS.has(key) && (typeof value === 'number' || typeof value === 'boolean' ||
          value === null || typeof value === 'string')) safe[key] = value;
    }
    const event = { sequence: ++this.sequence, at, type, data: safe };
    this.events.push(event);
    // Diagnostic failures must never change the navigation operation being observed.
    for (const listener of this.listeners) {
      try { listener({ ...event, data: { ...safe } }); } catch { /* Read-only observer unavailable. */ }
    }
    if (this.events.length > this.capacity) {
      // Heading/render chatter must not evict GPS decisions and session transitions.
      const lowPriority = this.events.findIndex(event => REPETITIVE.has(event.type));
      this.events.splice(lowPriority >= 0 ? lowPriority : 0, 1); this.dropped++;
    }
  }
  report(): string {
    return JSON.stringify({ schemaVersion: 1, mode: 'physical-faithful',
      privacy: { physicalCoordinates: 'omitted', relativeMovement: 'included' },
      droppedEvents: this.dropped, suppressedRepetitiveEvents: this.suppressed, eventCounts: this.counts, events: this.events }, null, 2);
  }
  async copy(): Promise<void> { await navigator.clipboard.writeText(this.report()); }
  download(): void {
    const url = URL.createObjectURL(new Blob([this.report()], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'physical-walk-diagnostics.json';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
