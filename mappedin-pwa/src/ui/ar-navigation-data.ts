import type { AppState } from '../types';
import { estimateLiveWalkSeconds } from '../routing/route-progress';
import {
  buildLocationLine,
  inferAreaHint,
  resolveFloorLabel,
} from './route-summary';

/** View model for the fullscreen AR navigation chrome (Figma 115:469). */
export interface ArNavigationViewModel {
  guidancePrimary: string;
  guidanceSecondary: string;
  destinationTitle: string;
  destinationSubtitle: string;
  etaLabel: string;
  distanceLabel: string;
  arriveLabel: string;
}

function formatEtaMinutes(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return '-';
  const mins = Math.max(1, Math.round(seconds / 60));
  return `${mins} min`;
}

function formatDistanceShort(meters: number | null): string {
  if (meters == null || !Number.isFinite(meters) || meters < 0) return '-';
  return `${Math.round(meters)}m`;
}

function formatArriveClock(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '-';
  const arrive = new Date(Date.now() + seconds * 1000);
  const hours = arrive.getHours();
  const mins = arrive.getMinutes();
  return `${hours}:${String(mins).padStart(2, '0')}`;
}

function splitGuidance(instructions: string): {
  primary: string;
  secondaryDistanceHint: string | null;
} {
  const first =
    instructions
      .split(',')
      .map((part) => part.trim())
      .find(Boolean) || 'Follow the path';

  const distanceMatch = first.match(/^(.*?)\s+for\s+(\d+)\s*m(?:eters?)?\.?$/i);
  if (distanceMatch) {
    return {
      primary: distanceMatch[1]!.trim(),
      secondaryDistanceHint: distanceMatch[2]!,
    };
  }

  return { primary: first, secondaryDistanceHint: null };
}

export function buildArNavigationViewModel(
  state: Pick<
    AppState,
    | 'route'
    | 'markers'
    | 'floors'
    | 'routeInstructions'
    | 'routeRemainingMeters'
    | 'routeTraveledMeters'
    | 'routeSimulating'
    | 'routeSimulationComplete'
  >,
): ArNavigationViewModel {
  const route = state.route;
  const title =
    route?.destinationName ??
    state.markers.destinationLabel ??
    'Destination';

  const destFloorId =
    route?.destination?.floorId ?? state.markers.destination?.floorId;
  const floorLabel = resolveFloorLabel(
    state.floors,
    destFloorId,
    state.markers.destinationFloorName,
  );
  const areaHint =
    state.markers.destinationAreaHint ??
    (title !== 'Destination' && title !== 'End point'
      ? inferAreaHint(title)
      : '');
  const locationLine = buildLocationLine(floorLabel, areaHint);

  const totalDistance = route?.distanceMeters ?? null;
  const useLiveProgress =
    state.routeSimulating ||
    state.routeSimulationComplete ||
    state.routeTraveledMeters > 0 ||
    state.routeRemainingMeters != null;
  const remainingDistance = useLiveProgress
    ? Math.max(
        0,
        state.routeRemainingMeters ??
          (totalDistance != null
            ? totalDistance - state.routeTraveledMeters
            : 0),
      )
    : totalDistance;

  const remainingSeconds = estimateLiveWalkSeconds({
    remainingMeters: remainingDistance,
    totalPathMeters: totalDistance,
    routeDurationSeconds: route?.durationSeconds ?? null,
  });
  const { primary, secondaryDistanceHint } = splitGuidance(
    state.routeInstructions,
  );

  const secondaryMeters =
    secondaryDistanceHint != null
      ? Number(secondaryDistanceHint)
      : remainingDistance;

  return {
    guidancePrimary: primary,
    guidanceSecondary:
      secondaryMeters != null && secondaryMeters > 0
        ? `for ${Math.round(secondaryMeters)} meters`
        : 'along the route',
    destinationTitle: title,
    destinationSubtitle: locationLine || 'On your route',
    etaLabel: formatEtaMinutes(remainingSeconds),
    distanceLabel: formatDistanceShort(remainingDistance),
    arriveLabel: formatArriveClock(remainingSeconds),
  };
}
