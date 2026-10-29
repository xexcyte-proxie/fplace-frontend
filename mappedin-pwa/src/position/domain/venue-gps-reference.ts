import { navigationDiagnostics as navDiag } from '../debug/navigation-diagnostics';
import { EARTH_RADIUS_M, geoToLocalMeters } from '../../utils/geo-math';

type Point = { latitude: number; longitude: number; floorId?: string };

let nextDiagnosticRevision = 0;

/** One venue-opening reference. Neither GPS updates nor reroutes recenter it. */
export class VenueGpsReference {
  private readonly diagnosticRevision = ++nextDiagnosticRevision;
  private physical: Point | null = null;
  private map: Point | null = null;

  private mapAnchorInfo: { source: string; objectId?: string; name?: string } | null = null;
  private initializedAt: number | null = null;
  constructor(private readonly venue?: { id: string; name?: string }) {}
  diagnosticSnapshot() { return { physical: this.physical, mapAnchor: this.map, mapAnchorInfo: this.mapAnchorInfo, initializedAt: this.initializedAt, revision: this.diagnosticRevision }; }
  capture(point: Point): void {
    const first = this.physical == null;
    if (first) this.initializedAt = Date.now();
    this.physical ??= { latitude: point.latitude, longitude: point.longitude };
    if (first && import.meta.env.DEV) {
      console.info(`[Fplaces:Simulation] Venue ${this.venue?.name ?? this.venue?.id ?? ''} simulated geographic reference has been set to lat: ${this.physical.latitude}, lon: ${this.physical.longitude}`, {
        venue: this.venue ?? null,
        latitude: this.physical.latitude,
        longitude: this.physical.longitude,
        mapAnchor: this.map,
        referenceType: 'development-simulation-physical-gps-origin',
      });
    }
    if (first) navDiag?.update('simulation', 'VenueGpsReference.capture', { ...this.diagnosticSnapshot(), originChanged: false, reason: 'first-physical-fix' });
  }

  anchor(point: Point, info?: { source: string; objectId?: string; name?: string }): void {
    const first = this.map == null;
    this.map ??= { latitude: point.latitude, longitude: point.longitude, ...(point.floorId ? { floorId: point.floorId } : {}) };
    if (first) this.mapAnchorInfo = info ?? null;
    if (first) navDiag?.update('simulation', 'VenueGpsReference.anchor', { ...this.diagnosticSnapshot(), reason: 'first-map-origin' });
  }

  translate<T extends Point>(point: T): T | null {
    if (!this.physical || !this.map) return null;
    const { latitude, longitude, offset } = this.transform(this.physical, this.map, point);
    navDiag?.update('simulation-transform', 'VenueGpsReference.translate', { raw: point, transformed: { latitude, longitude }, displacementM: offset, mapDisplacement: geoToLocalMeters(this.map, { latitude, longitude }), ...this.diagnosticSnapshot(), originChanged: false });
    return { ...point, latitude, longitude };
  }

  /** Inverse map-to-physical conversion using the same fixed reference pair. */
  toPhysical<T extends Point>(point: T): T | null {
    if (!this.physical || !this.map) return null;
    const { latitude, longitude } = this.transform(this.map, this.physical, point);
    return { ...point, latitude, longitude };
  }

  private transform(from: Point, to: Point, point: Point) {
    const offset = geoToLocalMeters(from, point);
    const latitude = to.latitude - offset.z / EARTH_RADIUS_M * 180 / Math.PI;
    const cosMid = Math.max(0.01, Math.abs(Math.cos((to.latitude + latitude) * Math.PI / 360)));
    const longitude = to.longitude + offset.x / (EARTH_RADIUS_M * cosMid) * 180 / Math.PI;
    return { latitude, longitude, offset };
  }
}
