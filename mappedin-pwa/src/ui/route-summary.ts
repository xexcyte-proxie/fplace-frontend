import { estimateLiveWalkSeconds } from '../routing/route-progress';
import { WALKING_SPEED_MPS as ROUTING_WALKING_SPEED_MPS } from '../routing/constants';
import type { AppState, FloorInfo } from '../types';

export const WALKING_SPEED_MPS = ROUTING_WALKING_SPEED_MPS;

export function inferAreaHint(locationName: string): string {
  const name = locationName.toLowerCase();
  if (/(food|caf[eé]|restaurant|stall|dining|snack)/.test(name)) {
    return 'Near Food Court';
  }
  if (/(gate|entrance|exit|lobby)/.test(name)) return 'Entrance area';
  if (/(store|shop|boutique|retail)/.test(name)) return 'Shopping level';
  if (/(restroom|bathroom|toilet)/.test(name)) return 'Facilities area';
  if (/(parking|garage)/.test(name)) return 'Parking level';
  if (/(gym|fitness|court|arena|stadium)/.test(name)) return 'Main venue';
  return 'On this level';
}

export function normalizeLevelName(name: string): string {
  const trimmed = name.trim();
  if (/^level\s+\d/i.test(trimmed)) {
    return trimmed.replace(/^level\s+/i, 'Level ');
  }
  if (/^\d+$/.test(trimmed)) return `Level ${trimmed}`;
  if (/^l(\d+)/i.test(trimmed)) {
    return `Level ${trimmed.replace(/^l/i, '')}`;
  }
  return trimmed;
}

export function resolveFloorLabel(
  floors: FloorInfo[],
  floorId?: string,
  floorName?: string,
): string {
  if (floorName) return normalizeLevelName(floorName);
  if (!floorId) return '';
  const floor = floors.find((entry) => entry.id === floorId);
  return floor?.name ? normalizeLevelName(floor.name) : '';
}

export function estimateWalkSeconds(
  distanceMeters: number | null | undefined,
  durationSeconds?: number | null,
): number | null {
  if (durationSeconds != null && Number.isFinite(durationSeconds) && durationSeconds > 0) {
    return durationSeconds;
  }
  if (distanceMeters != null && Number.isFinite(distanceMeters) && distanceMeters > 0) {
    return distanceMeters / WALKING_SPEED_MPS;
  }
  return null;
}

export function formatWalkTime(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return '-';
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs.toString().padStart(2, '0')}s`;
}

export function formatWalkDistance(meters: number | null | undefined): string {
  if (meters == null || !Number.isFinite(meters) || meters <= 0) return '- M WALK';
  return `${Math.round(meters)} M WALK`;
}

export function buildLocationLine(floorLabel: string, areaHint?: string): string {
  if (floorLabel && areaHint) return `${floorLabel} - ${areaHint}`;
  return floorLabel || areaHint || '';
}

export interface RouteSheetSummary {
  title: string;
  locationLine: string;
  walkTime: string;
  walkDistance: string;
  isCalculating: boolean;
  /** True when the current points cannot produce a route - user should Reset. */
  needsReset: boolean;
}

export function buildRouteSheetSummary(state: AppState): RouteSheetSummary {
  const route = state.route;
  const markers = state.markers;
  const title =
    route?.destinationName ??
    markers.destinationLabel ??
    'Destination';

  const destFloorId =
    route?.destination?.floorId ?? markers.destination?.floorId;
  const floorLabel = resolveFloorLabel(
    state.floors,
    destFloorId,
    markers.destinationFloorName,
  );
  const areaHint =
    markers.destinationAreaHint ??
    (title !== 'Destination' && title !== 'End point'
      ? inferAreaHint(title)
      : '');

  const needsReset =
    state.routeNotFound &&
    !state.isCalculatingRoute &&
    !route &&
    Boolean(markers.origin && markers.destination);

  if (needsReset) {
    return {
      title,
      locationLine:
        'No route between these points. Reset to start again, or pick a different place.',
      walkTime: '-',
      walkDistance: 'NO ROUTE',
      isCalculating: false,
      needsReset: true,
    };
  }

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

  return {
    title,
    locationLine: buildLocationLine(floorLabel, areaHint),
    walkTime: state.isCalculatingRoute
      ? '…'
      : state.routeSimulationComplete
        ? '0s'
        : formatWalkTime(remainingSeconds),
    walkDistance: state.isCalculatingRoute
      ? 'CALCULATING'
      : state.routeSimulationComplete
        ? '0 M WALK'
        : formatWalkDistance(remainingDistance),
    isCalculating: state.isCalculatingRoute,
    needsReset: false,
  };
}
