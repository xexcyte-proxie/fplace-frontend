import type { Directions } from '@mappedin/mappedin-js';

import type { RoutePayload } from '../types';
import { ROUTING_ENGINE_VERSION, WALKING_SPEED_MPS } from './constants';
import { floorPropagationEngine } from './floor-propagation-engine';
import { computeGeometryHash, computeRouteChecksum } from './geometry-hash-service';
import {
  buildIntelligentLegs,
  instructionStep,
  tagPathWithLegs,
} from './route-leg-builder';
import { routeLifecycleManager } from './route-lifecycle-manager';
import { resolveCanonicalRouteDistanceMeters } from './route-progress';
import { routeValidationService } from './route-validation-service';
import { routeVersionManager } from './route-version-manager';
import { coordinateTransformationService } from './coordinate-transformation-service';

export interface BuildRoutePayloadOptions {
  destinationName: string;
  mapId: string;
  venueId?: string;
  mapVersion?: string;
  origin?: unknown;
  destination?: unknown;
  /** When recalculating, reuse routeId and bump version. */
  existingRouteId?: string;
}

/**
 * Production route builder - runs floor propagation, leg intelligence,
 * geometry hashing, and lifecycle metadata before serialization.
 */
export function buildProductionRoutePayload(
  directions: Directions,
  options: BuildRoutePayloadOptions,
): RoutePayload {
  routeLifecycleManager.transition('generating');

  const serializedOrigin = coordinateTransformationService.serializeCoordinate(options.origin);
  const serializedDestination = coordinateTransformationService.serializeCoordinate(options.destination);
  const rawPath = coordinateTransformationService.serializePathCoordinates(
    directions.coordinates as unknown[],
  );

  const provisionalLegs = buildIntelligentLegs(directions.instructions, rawPath, 'provisional');
  const maneuvers = provisionalLegs.flatMap((leg) =>
    leg.steps.map((step, stepIndex) => ({
      ...step,
      legIndex: leg.index,
      stepIndex,
    })),
  );

  const { path: floorEnriched } = floorPropagationEngine.propagate(rawPath, {
    originFloorId: serializedOrigin?.floorId,
    destinationFloorId: serializedDestination?.floorId,
    legs: provisionalLegs,
    maneuvers,
  });

  const versionRecord = options.existingRouteId
    ? routeVersionManager.bumpVersion(
        options.existingRouteId,
        computeGeometryHash({ pathCoordinates: floorEnriched, maneuvers }),
      )
    : routeVersionManager.createIdentity(
        computeGeometryHash({ pathCoordinates: floorEnriched, maneuvers }),
      );

  const legs = buildIntelligentLegs(
    directions.instructions,
    floorEnriched,
    versionRecord.routeId,
  );

  const finalManeuvers = legs.flatMap((leg) =>
    leg.steps.map((step, stepIndex) => ({
      ...step,
      legIndex: leg.index,
      stepIndex,
    })),
  );

  const { path: pathCoordinates, transitions } = floorPropagationEngine.propagate(
    floorEnriched,
    {
      originFloorId: serializedOrigin?.floorId,
      destinationFloorId: serializedDestination?.floorId,
      legs,
      maneuvers: finalManeuvers,
    },
  );

  const taggedPath = tagPathWithLegs(pathCoordinates, legs);
  const pathMeters =
    coordinateTransformationService.totalPathLengthMeters(taggedPath);
  const distanceMeters = resolveCanonicalRouteDistanceMeters(
    pathMeters,
    directions.distance,
  );

  const geometryHash = computeGeometryHash({
    pathCoordinates: taggedPath,
    legs,
    maneuvers: finalManeuvers,
    routeVersion: versionRecord.routeVersion,
    generatedAt: versionRecord.generatedAt,
  });

  const generatedAt = versionRecord.generatedAt;
  const updatedAt = generatedAt;
  const checksum = computeRouteChecksum({
    routeId: versionRecord.routeId,
    routeVersion: versionRecord.routeVersion,
    geometryHash,
    generatedAt,
    pathLength: taggedPath.length,
  });

  const payload: RoutePayload = {
    legs,
    destinationName: options.destinationName,
    pathCoordinates: taggedPath,
    maneuvers: finalManeuvers,
    distanceMeters,
    durationSeconds:
      distanceMeters != null && Number.isFinite(distanceMeters)
        ? distanceMeters / WALKING_SPEED_MPS
        : null,
    origin: serializedOrigin ?? taggedPath[0] ?? null,
    destination:
      serializedDestination ??
      taggedPath[taggedPath.length - 1] ??
      null,
    mapId: options.mapId,
    routeId: versionRecord.routeId,
    routeVersion: versionRecord.routeVersion,
    generatedAt,
    updatedAt,
    geometryHash,
    checksum,
    mapVersion: options.mapVersion ?? options.mapId,
    venueId: options.venueId ?? options.mapId,
    routingEngineVersion: ROUTING_ENGINE_VERSION,
    floorTransitions: transitions,
    lifecycle: routeLifecycleManager.transition('generated'),
    navigationMode: 'walk',
  };

  const validation = routeValidationService.validate(payload);
  if (!validation.valid) {
    console.error('[RouteBuilder] Validation failed:', validation.errors);
    throw new Error(`Route validation failed: ${validation.errors.join('; ')}`);
  }

  routeLifecycleManager.transition('ready');
  return payload;
}

export { instructionStep };
