import type { RouteCoordinate, RoutePayload } from '../types';
import { computeRouteChecksum } from './geometry-hash-service';

export interface RouteValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class RouteValidationService {
  validate(payload: Partial<RoutePayload> | null | undefined): RouteValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!payload) {
      return { valid: false, errors: ['Route payload is null or undefined'], warnings };
    }

    if (!payload.routeId) errors.push('Missing routeId');
    if (payload.routeVersion == null || payload.routeVersion < 1) {
      errors.push('Invalid routeVersion');
    }
    if (!payload.generatedAt) errors.push('Missing generatedAt timestamp');
    if (!payload.geometryHash) warnings.push('Missing geometryHash');
    if (!payload.checksum) warnings.push('Missing checksum');

    const path = payload.pathCoordinates;
    if (!Array.isArray(path) || path.length < 2) {
      errors.push('pathCoordinates must contain at least 2 points');
    } else {
      for (let i = 0; i < path.length; i++) {
        const p = path[i];
        if (!Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) {
          errors.push(`Invalid coordinates at path index ${i}`);
        }
        if (!p.floorId) {
          errors.push(`Missing floorId at path index ${i}`);
        }
      }
    }

    if (payload.legs?.length) {
      for (const leg of payload.legs) {
        if (!leg.legId) warnings.push(`Leg ${leg.index} missing legId`);
        if (!leg.floorId) warnings.push(`Leg ${leg.index} missing floorId`);
        if (leg.startIndex == null || leg.endIndex == null) {
          warnings.push(`Leg ${leg.index} missing coordinate range`);
        }
      }
    }

    if (
      payload.routeId &&
      payload.routeVersion != null &&
      payload.geometryHash &&
      payload.generatedAt &&
      payload.checksum
    ) {
      const expected = computeRouteChecksum({
        routeId: payload.routeId,
        routeVersion: payload.routeVersion,
        geometryHash: payload.geometryHash,
        generatedAt: payload.generatedAt,
        pathLength: path?.length ?? 0,
      });
      if (payload.checksum !== expected) {
        errors.push('Checksum mismatch — payload may be corrupted');
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  validateCoordinate(coord: Partial<RouteCoordinate> | null): coord is RouteCoordinate {
    return (
      coord != null &&
      Number.isFinite(coord.latitude) &&
      Number.isFinite(coord.longitude) &&
      typeof coord.floorId === 'string' &&
      coord.floorId.length > 0
    );
  }

  allCoordinatesHaveFloor(path: RouteCoordinate[]): boolean {
    return path.every((p) => this.validateCoordinate(p));
  }
}

export const routeValidationService = new RouteValidationService();
