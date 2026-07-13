import type { Directions } from '@mappedin/mappedin-js';

import type {
  RouteCoordinate,
  RouteLeg,
  RouteStep,
  TransitionKind,
  TransitionMetadata,
} from '../types';
import { segmentHorizontalMeters } from '../utils/geo-math';
import { WALKING_SPEED_MPS } from './constants';

const CONNECTION_PATTERNS: Array<{ pattern: RegExp; kind: TransitionKind }> = [
  { pattern: /elevator/i, kind: 'elevator' },
  { pattern: /escalat/i, kind: 'escalator' },
  { pattern: /stair/i, kind: 'stairs' },
  { pattern: /ramp/i, kind: 'ramp' },
  { pattern: /doorway|door/i, kind: 'doorway' },
  { pattern: /connection/i, kind: 'floor_connector' },
];

function classifyConnection(step: RouteStep | undefined): TransitionKind {
  const text = `${step?.actionType ?? ''} ${step?.instruction ?? ''}`;
  for (const { pattern, kind } of CONNECTION_PATTERNS) {
    if (pattern.test(text)) return kind;
  }
  return 'unknown';
}

function isConnectionStep(step: RouteStep | undefined): boolean {
  const type = step?.actionType?.toLowerCase() ?? '';
  const instruction = step?.instruction?.toLowerCase() ?? '';
  return (
    type.includes('connection') ||
    /elevator|escalat|stair|ramp|doorway|door/.test(instruction)
  );
}

function instructionText(instruction: {
  action?: { type?: string; bearing?: string };
  distance?: number;
}): string {
  const action = instruction.action;
  if (!action) return 'Continue';
  const bearing = action.bearing ? ` ${action.bearing}` : '';
  const distance =
    instruction.distance != null ? ` in ${Math.round(instruction.distance)} m` : '';
  return `${action.type || 'Continue'}${bearing}${distance}`;
}

function instructionStep(instruction: {
  action?: { type?: string; bearing?: string };
  distance?: number;
}): RouteStep {
  return {
    instruction: instructionText(instruction),
    actionType: instruction.action?.type,
    bearing: instruction.action?.bearing,
    distanceMeters: instruction.distance,
  };
}

function createLegId(index: number): string {
  return `leg-${index}`;
}

/**
 * Build route legs with full metadata: floor, coordinate range, distance,
 * duration, and transition classification.
 */
export function buildIntelligentLegs(
  instructions: Directions['instructions'] | undefined,
  path: RouteCoordinate[],
  routeId: string,
): RouteLeg[] {
  if (!instructions?.length) {
    return [
      {
        legId: createLegId(0),
        index: 0,
        floorId: path[0]?.floorId ?? 'unknown',
        startIndex: 0,
        endIndex: Math.max(0, path.length - 1),
        steps: [{ instruction: 'Continue' }],
        distanceMeters: pathDistance(path, 0, path.length - 1),
        durationSeconds: null,
        transitionType: null,
        transitionMetadata: null,
      },
    ];
  }

  const steps = instructions.map((i) => instructionStep(i));
  const splitIndices: number[] = [];
  const transitionSteps: Array<{ stepIndex: number; kind: TransitionKind; step: RouteStep }> = [];

  for (let i = 0; i < steps.length; i++) {
    if (isConnectionStep(steps[i])) {
      splitIndices.push(i);
      transitionSteps.push({
        stepIndex: i,
        kind: classifyConnection(steps[i]),
        step: steps[i],
      });
    }
  }

  const legBoundaries: Array<{ startStep: number; endStep: number; transitionAfter?: (typeof transitionSteps)[0] }> = [];
  let stepStart = 0;
  for (const tr of transitionSteps) {
    legBoundaries.push({
      startStep: stepStart,
      endStep: tr.stepIndex,
      transitionAfter: tr,
    });
    stepStart = tr.stepIndex + 1;
  }
  legBoundaries.push({ startStep: stepStart, endStep: steps.length - 1 });

  const totalPathDist = pathDistance(path, 0, path.length - 1);
  const totalInstrDist = steps.reduce((s, st) => s + (st.distanceMeters ?? 0), 0);
  const distScale = totalInstrDist > 0 ? totalPathDist / totalInstrDist : 1;

  let pathCursor = 0;
  const legs: RouteLeg[] = [];

  for (let legIdx = 0; legIdx < legBoundaries.length; legIdx++) {
    const boundary = legBoundaries[legIdx];
    const legSteps = steps.slice(boundary.startStep, boundary.endStep + 1);
    if (!legSteps.length && legIdx < legBoundaries.length - 1) continue;

    const legInstrDist = legSteps.reduce((s, st) => s + (st.distanceMeters ?? 0), 0);
    const legPathDist = legInstrDist * distScale;
    const endIndex = Math.min(
      path.length - 1,
      pathCursor + Math.max(1, Math.round((legPathDist / Math.max(totalPathDist, 1)) * (path.length - 1))),
    );
    const startIndex = pathCursor;
    pathCursor = endIndex;

    const floorId =
      path[startIndex]?.floorId ??
      path[endIndex]?.floorId ??
      'unknown';

    let transitionType: TransitionKind | 'walk' | null = legIdx > 0 ? 'walk' : null;
    let transitionMetadata: TransitionMetadata | null = null;

    if (boundary.transitionAfter) {
      const tr = boundary.transitionAfter;
      const fromFloor = path[startIndex]?.floorId ?? floorId;
      const toFloor =
        path[Math.min(endIndex + 1, path.length - 1)]?.floorId ?? fromFloor;
      transitionType = tr.kind;
      transitionMetadata = {
        kind: tr.kind,
        instruction: tr.step.instruction,
        fromFloorId: fromFloor,
        toFloorId: toFloor,
        pathIndex: endIndex,
      };
    }

    legs.push({
      legId: `${routeId}:${createLegId(legIdx)}`,
      index: legs.length,
      floorId,
      startIndex,
      endIndex,
      steps: legSteps.length ? legSteps : [{ instruction: 'Continue' }],
      distanceMeters: pathDistance(path, startIndex, endIndex),
      durationSeconds:
        legInstrDist > 0 ? legInstrDist / WALKING_SPEED_MPS : null,
      transitionType,
      transitionMetadata,
    });
  }

  if (!legs.length) {
    legs.push({
      legId: `${routeId}:${createLegId(0)}`,
      index: 0,
      floorId: path[0]?.floorId ?? 'unknown',
      startIndex: 0,
      endIndex: Math.max(0, path.length - 1),
      steps: steps,
      distanceMeters: totalPathDist,
      durationSeconds: totalInstrDist > 0 ? totalInstrDist / WALKING_SPEED_MPS : null,
      transitionType: null,
      transitionMetadata: null,
    });
  } else {
    legs[legs.length - 1].endIndex = path.length - 1;
    legs[legs.length - 1].distanceMeters = pathDistance(
      path,
      legs[legs.length - 1].startIndex,
      path.length - 1,
    );
  }

  return legs;
}

/** Tag each path coordinate with its owning leg and along-route distance. */
export function tagPathWithLegs(
  path: RouteCoordinate[],
  legs: RouteLeg[],
): RouteCoordinate[] {
  if (!path.length) return [];

  let cumulative = 0;
  const tagged = path.map((p, i) => ({ ...p, segmentIndex: i }));

  for (const leg of legs) {
    for (let idx = leg.startIndex; idx <= leg.endIndex && idx < tagged.length; idx++) {
      tagged[idx].legId = leg.legId;
      tagged[idx].segmentIndex = idx;
      if (idx > leg.startIndex) {
        cumulative += segmentHorizontalMeters(tagged[idx - 1], tagged[idx]);
      }
      tagged[idx].distanceAlongRoute = cumulative;
    }
  }

  for (let i = 0; i < tagged.length; i++) {
    if (tagged[i].legId == null) {
      const owner = legs.find((l) => i >= l.startIndex && i <= l.endIndex) ?? legs[0];
      tagged[i].legId = owner?.legId;
      tagged[i].segmentIndex = i;
    }
  }

  return tagged;
}

function pathDistance(path: RouteCoordinate[], from: number, to: number): number {
  let dist = 0;
  for (let i = from; i < to && i < path.length - 1; i++) {
    dist += segmentHorizontalMeters(path[i], path[i + 1]);
  }
  return dist;
}

export { classifyConnection, isConnectionStep, instructionStep, instructionText };
