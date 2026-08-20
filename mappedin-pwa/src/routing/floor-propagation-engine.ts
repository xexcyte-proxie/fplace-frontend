import type { RouteCoordinate, RouteLeg, RouteStep, FloorTransition } from '../types';
import { segmentHorizontalMeters } from '../utils/geo-math';
import { classifyConnection, isConnectionStep } from './route-leg-builder';

export interface FloorPropagationResult {
  path: RouteCoordinate[];
  transitions: FloorTransition[];
}

type MutablePoint = {
  latitude: number;
  longitude: number;
  floorId?: string;
  legId?: string;
  segmentIndex?: number;
  distanceAlongRoute?: number;
};

/**
 * Reconstruct floor metadata for every path coordinate.
 * Never leaves floorId undefined - uses topology, legs, maneuvers, and endpoints.
 */
export class FloorPropagationEngine {
  propagate(
    path: RouteCoordinate[],
    options: {
      originFloorId?: string | null;
      destinationFloorId?: string | null;
      legs?: RouteLeg[];
      maneuvers?: RouteStep[];
    } = {},
  ): FloorPropagationResult {
    if (!path.length) return { path: [], transitions: [] };

    const enriched: MutablePoint[] = path.map((p) => ({
      latitude: p.latitude,
      longitude: p.longitude,
      floorId: p.floorId && p.floorId !== 'unknown' ? p.floorId : undefined,
      legId: p.legId,
      segmentIndex: p.segmentIndex,
      distanceAlongRoute: p.distanceAlongRoute,
    }));

    this.applyEndpointFloors(enriched, options);
    this.forwardFill(enriched);
    this.backwardFill(enriched);
    this.applyLegFloors(enriched, options.legs ?? []);
    this.detectTransitionsFromPath(enriched, options);
    this.finalizeFloors(enriched, options);

    const transitions = this.buildTransitions(enriched, options.maneuvers ?? []);

    return {
      path: enriched.map((p) => ({
        ...p,
        floorId: p.floorId || 'unknown',
      })),
      transitions,
    };
  }

  private applyEndpointFloors(
    path: MutablePoint[],
    options: { originFloorId?: string | null; destinationFloorId?: string | null },
  ): void {
    if (path[0] && !path[0].floorId && options.originFloorId) {
      path[0].floorId = options.originFloorId;
    }
    const last = path.length - 1;
    if (path[last] && !path[last].floorId && options.destinationFloorId) {
      path[last].floorId = options.destinationFloorId;
    }
  }

  private forwardFill(path: MutablePoint[]): void {
    for (let i = 1; i < path.length; i++) {
      if (!path[i].floorId && path[i - 1].floorId) {
        path[i].floorId = path[i - 1].floorId;
      }
    }
  }

  private backwardFill(path: MutablePoint[]): void {
    for (let i = path.length - 2; i >= 0; i--) {
      if (!path[i].floorId && path[i + 1].floorId) {
        path[i].floorId = path[i + 1].floorId;
      }
    }
  }

  private applyLegFloors(path: MutablePoint[], legs: RouteLeg[]): void {
    for (const leg of legs) {
      if (!leg.floorId || leg.floorId === 'unknown') continue;
      for (let i = leg.startIndex; i <= leg.endIndex && i < path.length; i++) {
        if (!path[i].floorId || path[i].floorId === 'unknown') {
          path[i].floorId = leg.floorId;
        }
      }
    }
  }

  private detectTransitionsFromPath(
    path: MutablePoint[],
    options: {
      originFloorId?: string | null;
      destinationFloorId?: string | null;
      legs?: RouteLeg[];
    },
  ): void {
    let legFloor = options.originFloorId || path[0]?.floorId || '';

    for (const leg of options.legs ?? []) {
      if (leg.transitionMetadata) {
        const { fromFloorId, toFloorId, pathIndex } = leg.transitionMetadata;
        const idx = pathIndex ?? leg.endIndex;
        if (idx >= 0 && idx < path.length && toFloorId) {
          path[idx].floorId = toFloorId;
          legFloor = toFloorId;
        } else if (toFloorId) {
          legFloor = toFloorId;
        }
        if (fromFloorId && idx > 0 && idx < path.length) {
          path[idx - 1].floorId = path[idx - 1].floorId || fromFloorId;
        }
      } else if (leg.floorId) {
        legFloor = leg.floorId;
      }
    }

    for (let i = 0; i < path.length; i++) {
      if (!path[i].floorId && legFloor) path[i].floorId = legFloor;
    }
  }

  private finalizeFloors(
    path: MutablePoint[],
    options: { originFloorId?: string | null; destinationFloorId?: string | null },
  ): void {
    for (let i = 0; i < path.length; i++) {
      if (!path[i].floorId) {
        path[i].floorId =
          path[i - 1]?.floorId ||
          path[i + 1]?.floorId ||
          options.originFloorId ||
          options.destinationFloorId ||
          'unknown';
      }
    }
  }

  private buildTransitions(
    path: MutablePoint[],
    maneuvers: RouteStep[],
  ): FloorTransition[] {
    const transitions: FloorTransition[] = [];
    let maneuverIdx = 0;
    let alongM = 0;

    for (let i = 0; i < path.length - 1; i++) {
      const segLen = segmentHorizontalMeters(
        { ...path[i], floorId: path[i].floorId || 'unknown' },
        { ...path[i + 1], floorId: path[i + 1].floorId || 'unknown' },
      );

      while (
        maneuverIdx < maneuvers.length &&
        maneuvers[maneuverIdx].distanceMeters != null &&
        alongM <= (maneuvers[maneuverIdx].distanceMeters ?? 0) + 0.5
      ) {
        const step = maneuvers[maneuverIdx];
        if (isConnectionStep(step)) {
          const kind = classifyConnection(step);
          const fromFloor = path[i].floorId || '';
          const nextFloor =
            path.slice(i + 1).find((p) => p.floorId)?.floorId || fromFloor;

          if (fromFloor && nextFloor && fromFloor !== nextFloor) {
            transitions.push({
              pathIndex: i + 1,
              fromFloorId: fromFloor,
              toFloorId: nextFloor,
              kind: kind === 'floor_connector' ? 'connection' : kind,
              instruction: step.instruction,
            });
            path[i + 1].floorId = nextFloor;
          }
        }
        maneuverIdx++;
      }

      const a = path[i];
      const b = path[i + 1];
      if (a.floorId && b.floorId && a.floorId !== b.floorId) {
        const existing = transitions.find((t) => t.pathIndex === i + 1);
        if (!existing) {
          transitions.push({
            pathIndex: i + 1,
            fromFloorId: a.floorId,
            toFloorId: b.floorId,
            kind: 'connection',
          });
        }
      }

      alongM += segLen;
    }

    return transitions;
  }
}

export const floorPropagationEngine = new FloorPropagationEngine();

/** Convenience wrapper preserving the legacy ensurePathFloorIds API. */
export function ensurePathFloorIds(
  path: RouteCoordinate[],
  options: {
    originFloorId?: string | null;
    destinationFloorId?: string | null;
    legs?: RouteLeg[];
    maneuvers?: RouteStep[];
  } = {},
): FloorPropagationResult {
  return floorPropagationEngine.propagate(path, options);
}
