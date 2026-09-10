import type { RouteCoordinate } from '../types';
import {
  geoToLocalMeters,
  segmentHorizontalMeters,
  isVerticalConnector,
} from '../utils/geo-math';
import { scoreSnapWithAlongContinuity } from './snap-along-continuity';

export interface RichNavPoint extends RouteCoordinate {
  segmentIndex: number;
  t: number;
  distanceAlongPathMeters: number;
  offRouteMeters?: number;
  legId?: string;
}

export interface SnapOptions {
  floorId?: string | null;
  legId?: string | null;
  preferVenue?: boolean;
  currentLegIndex?: number;
  legs?: Array<{ index: number; legId: string; floorId: string; startIndex: number; endIndex: number }>;
  /** Stabilized along-path metres: prefer the current corridor over a later one. */
  previousAlongMeters?: number | null;
}

const PENALTY_WRONG_FLOOR_VENUE = 40;
const PENALTY_WRONG_FLOOR_DEFAULT = 80;
const PENALTY_WRONG_LEG = 25;
const PENALTY_FUTURE_LEG = 50;
const PENALTY_PREVIOUS_LEG = 15;
const PENALTY_WRONG_CONNECTOR = 60;

/**
 * Preserves navigation metadata through coordinate transformations.
 */
export class CoordinateTransformationService {
  serializeCoordinate(target: unknown): RouteCoordinate | null {
    if (!target || typeof target !== 'object') return null;
    const t = target as Record<string, unknown>;
    const center =
      t.center && typeof t.center === 'object'
        ? (t.center as Record<string, unknown>)
        : null;
    const lat = Number(t.latitude ?? t.lat ?? center?.latitude ?? center?.lat);
    const lng = Number(t.longitude ?? t.lng ?? center?.longitude ?? center?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const floor = t.floor as Record<string, unknown> | string | undefined;
    const floorId =
      typeof floor === 'object' && floor?.id != null
        ? String(floor.id)
        : floor != null
          ? String(floor)
          : typeof t.floorId === 'string'
            ? t.floorId
            : 'unknown';

    return {
      latitude: lat,
      longitude: lng,
      floorId,
      legId: typeof t.legId === 'string' ? t.legId : undefined,
      segmentIndex: typeof t.segmentIndex === 'number' ? t.segmentIndex : undefined,
      distanceAlongRoute:
        typeof t.distanceAlongRoute === 'number' ? t.distanceAlongRoute : undefined,
    };
  }

  serializePathCoordinates(coords: unknown[] | undefined): RouteCoordinate[] {
    if (!Array.isArray(coords)) return [];
    return coords
      .map((c) => this.serializeCoordinate(c))
      .filter((c): c is RouteCoordinate => c != null);
  }

  enrichPoint(base: RouteCoordinate, extras: Partial<RichNavPoint>): RichNavPoint {
    return {
      latitude: base.latitude,
      longitude: base.longitude,
      floorId: base.floorId,
      legId: extras.legId ?? base.legId,
      segmentIndex: extras.segmentIndex ?? base.segmentIndex ?? 0,
      distanceAlongRoute: extras.distanceAlongPathMeters ?? base.distanceAlongRoute,
      t: extras.t ?? 0,
      distanceAlongPathMeters: extras.distanceAlongPathMeters ?? base.distanceAlongRoute ?? 0,
      offRouteMeters: extras.offRouteMeters,
    };
  }

  interpolateCoordinate(a: RouteCoordinate, b: RouteCoordinate, t: number): RouteCoordinate {
    const clamped = Math.max(0, Math.min(1, t));
    return {
      latitude: a.latitude + clamped * (b.latitude - a.latitude),
      longitude: a.longitude + clamped * (b.longitude - a.longitude),
      floorId: this.floorIdAtT(a, b, clamped),
      legId: clamped < 0.5 ? a.legId ?? b.legId : b.legId ?? a.legId,
      segmentIndex: a.segmentIndex,
    };
  }

  floorIdAtT(a: RouteCoordinate, b: RouteCoordinate, t: number): string {
    if (t <= 0) return a.floorId || b.floorId || 'unknown';
    if (t >= 1) return b.floorId || a.floorId || 'unknown';
    if (a.floorId && b.floorId && a.floorId !== b.floorId) {
      return t < 0.5 ? a.floorId : b.floorId;
    }
    return a.floorId || b.floorId || 'unknown';
  }

  normalizePath(path: RouteCoordinate[]): RouteCoordinate[] {
    const result: RouteCoordinate[] = [];
    for (const p of path) {
      const latP = (p as { lat?: number }).lat ?? p.latitude;
      const lngP = (p as { lng?: number }).lng ?? p.longitude;
      if (latP == null || lngP == null) continue;
      result.push({
        latitude: Number(latP),
        longitude: Number(lngP),
        floorId: p.floorId || 'unknown',
        legId: p.legId,
        segmentIndex: p.segmentIndex,
        distanceAlongRoute: p.distanceAlongRoute,
      });
    }
    return result;
  }

  toLocalMeters(
    ref: { latitude: number; longitude: number },
    p: { latitude: number; longitude: number },
  ): { x: number; y: number } {
    const local = geoToLocalMeters(ref, p);
    return { x: local.x, y: -local.z };
  }

  projectPointOnSegment(
    point: { latitude: number; longitude: number },
    a: RouteCoordinate,
    b: RouteCoordinate,
  ): { t: number; distToSegment: number; latitude: number; longitude: number; floorId: string; legId?: string } {
    const ap = this.toLocalMeters(a, point);
    const ab = this.toLocalMeters(a, b);
    const abLen2 = ab.x * ab.x + ab.y * ab.y;
    let t = abLen2 > 0 ? (ap.x * ab.x + ap.y * ab.y) / abLen2 : 0;
    t = Math.max(0, Math.min(1, t));

    const proj = { x: ab.x * t, y: ab.y * t };
    const dx = ap.x - proj.x;
    const dy = ap.y - proj.y;

    const interp = this.interpolateCoordinate(a, b, t);
    return {
      t,
      distToSegment: Math.sqrt(dx * dx + dy * dy),
      latitude: interp.latitude,
      longitude: interp.longitude,
      floorId: interp.floorId,
      legId: interp.legId,
    };
  }

  snapToRoute(path: RouteCoordinate[], lat: number, lng: number, options: SnapOptions = {}): RichNavPoint | null {
    const normalized = this.normalizePath(path);
    if (!normalized.length) return null;

    const floorMismatchPenalty = options.preferVenue
      ? PENALTY_WRONG_FLOOR_VENUE
      : PENALTY_WRONG_FLOOR_DEFAULT;

    if (normalized.length === 1) {
      return this.enrichPoint(normalized[0], {
        segmentIndex: 0,
        t: 0,
        distanceAlongPathMeters: 0,
        offRouteMeters: this.haversineMeters({ latitude: lat, longitude: lng }, normalized[0]),
      });
    }

    let best: RichNavPoint | null = null;
    let bestScore = Infinity;
    let cumulative = 0;

    for (let i = 0; i < normalized.length - 1; i++) {
      const a = normalized[i];
      const b = normalized[i + 1];
      const segLen = segmentHorizontalMeters(a, b);
      const proj = this.projectPointOnSegment({ latitude: lat, longitude: lng }, a, b);

      let penalty = 0;
      if (options.floorId && !this.segmentOnFloor(a, b, options.floorId)) {
        penalty += floorMismatchPenalty;
      }
      if (options.legId && a.legId && b.legId && a.legId !== options.legId && b.legId !== options.legId) {
        penalty += PENALTY_WRONG_LEG;
      }
      if (options.currentLegIndex != null && options.legs?.length) {
        const segLeg = options.legs.find((l) => i >= l.startIndex && i <= l.endIndex);
        if (segLeg) {
          if (segLeg.index > options.currentLegIndex) penalty += PENALTY_FUTURE_LEG;
          if (segLeg.index < options.currentLegIndex) penalty += PENALTY_PREVIOUS_LEG;
        }
      }
      if (isVerticalConnector(a, b) && options.floorId) {
        if (a.floorId !== options.floorId && b.floorId !== options.floorId) {
          penalty += PENALTY_WRONG_CONNECTOR;
        }
      }

      const alongPathMeters = cumulative + proj.t * segLen;
      const adjustedDist =
        scoreSnapWithAlongContinuity({
          distToSegment: proj.distToSegment,
          alongPathMeters,
          previousAlongMeters: options.previousAlongMeters,
        }) + penalty;

      if (adjustedDist < bestScore) {
        bestScore = adjustedDist;
        // Store geometric off-route distance (not floor/leg penalties) for live ETA.
        best = this.enrichPoint(
          { latitude: proj.latitude, longitude: proj.longitude, floorId: proj.floorId, legId: proj.legId },
          {
            segmentIndex: i,
            t: proj.t,
            distanceAlongPathMeters: alongPathMeters,
            offRouteMeters: proj.distToSegment,
          },
        );
      }
      cumulative += segLen;
    }

    return best;
  }

  snapAtDistanceAlongPath(path: RouteCoordinate[], metersAlong: number): RichNavPoint | null {
    const total = this.totalPathLengthMeters(path);
    const clamped = Math.max(0, Math.min(total, metersAlong));
    const start = this.enrichPoint(path[0] ?? { latitude: 0, longitude: 0, floorId: 'unknown' }, {
      segmentIndex: 0,
      t: 0,
      distanceAlongPathMeters: 0,
    });
    const pt = this.pointAtDistanceAlongPath(path, start, clamped);
    if (!pt) return null;
    return {
      ...pt,
      distanceAlongPathMeters: clamped,
      offRouteMeters: 0,
    };
  }

  pointAtDistanceAlongPath(
    path: RouteCoordinate[],
    startSnap: RichNavPoint,
    metersAhead: number,
  ): RichNavPoint | null {
    if (!path.length) return null;

    let remaining = Math.max(0, metersAhead);
    let seg = startSnap.segmentIndex;
    let t = startSnap.t ?? 0;

    const segLen = (i: number) => segmentHorizontalMeters(path[i], path[i + 1]);

    let onSeg = (1 - t) * segLen(seg);
    if (remaining <= onSeg) {
      const newT = t + remaining / Math.max(segLen(seg), 0.001);
      const interp = this.interpolateCoordinate(path[seg], path[seg + 1], newT);
      const dist = this.metersAlongPath(path, seg, newT);
      return this.enrichPoint(interp, { segmentIndex: seg, t: newT, distanceAlongPathMeters: dist });
    }
    remaining -= onSeg;
    seg++;

    while (seg < path.length - 1) {
      const len = segLen(seg);
      if (remaining <= len) {
        const newT = remaining / Math.max(len, 0.001);
        const interp = this.interpolateCoordinate(path[seg], path[seg + 1], newT);
        const dist = this.metersAlongPath(path, seg, newT);
        return this.enrichPoint(interp, { segmentIndex: seg, t: newT, distanceAlongPathMeters: dist });
      }
      remaining -= len;
      seg++;
    }

    const last = path[path.length - 1];
    return this.enrichPoint(last, {
      segmentIndex: path.length - 2,
      t: 1,
      distanceAlongPathMeters: this.totalPathLengthMeters(path),
    });
  }

  totalPathLengthMeters(path: RouteCoordinate[]): number {
    if (path.length < 2) return 0;
    let total = 0;
    for (let i = 0; i < path.length - 1; i++) {
      total += segmentHorizontalMeters(path[i], path[i + 1]);
    }
    return total;
  }

  metersAlongPath(path: RouteCoordinate[], segmentIndex: number, segmentT: number): number {
    let meters = 0;
    for (let i = 0; i < segmentIndex; i++) {
      meters += segmentHorizontalMeters(path[i], path[i + 1]);
    }
    if (segmentIndex < path.length - 1) {
      const t = Math.min(1, Math.max(0, segmentT));
      meters += segmentHorizontalMeters(path[segmentIndex], path[segmentIndex + 1]) * t;
    }
    return meters;
  }

  private segmentOnFloor(a: RouteCoordinate, b: RouteCoordinate, floorId: string): boolean {
    if (!floorId) return true;
    return a.floorId === floorId || b.floorId === floorId;
  }

  private haversineMeters(
    a: { latitude: number; longitude: number },
    b: { latitude: number; longitude: number },
  ): number {
    const R = 6371000;
    const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
    const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
    const lat1 = (a.latitude * Math.PI) / 180;
    const lat2 = (b.latitude * Math.PI) / 180;
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
}

export const coordinateTransformationService = new CoordinateTransformationService();
