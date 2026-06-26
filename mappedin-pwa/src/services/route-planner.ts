import type { MapData, MapView, TNavigationTarget } from '@mappedin/mappedin-js';

import type { RouteCoordinate, RoutePayload } from '../types';
import { appLog } from '../utils/logger';
import {
  buildRoutePayload,
  haversineMeters,
  serializeCoordinate,
} from '../utils/route-helpers';
import { inferAreaHint, normalizeLevelName } from '../ui/route-summary';

type MarkerHandle = { remove?: () => void } | null;

const START_MARKER =
  '<div aria-hidden="true" style="width:22px;height:22px;border-radius:50%;background:#22c55e;border:3px solid #fff;box-shadow:0 0 0 4px rgba(34,197,94,.35);"></div>';

const END_MARKER =
  '<div aria-hidden="true" style="display:flex;flex-direction:column;align-items:center;margin-top:-34px;margin-left:-15px;">' +
  '<div style="display:flex;align-items:flex-end;height:32px;">' +
  '<div style="width:3px;height:32px;background:#b91c1c;border-radius:2px;"></div>' +
  '<div style="width:26px;height:17px;background:#ef4444;border:2px solid #fff;border-radius:2px 3px 3px 0;margin-bottom:4px;"></div>' +
  '</div></div>';

export class RoutePlanner {
  private originMarker: MarkerHandle = null;
  private destinationMarker: MarkerHandle = null;
  private highlightMarkers: MarkerHandle[] = [];
  private routePlanningPaused = false;
  private markerMode: 'start' | 'end' = 'start';
  private originCoord: unknown = null;
  private destinationCoord: unknown = null;
  private destinationLabel = 'End point';
  private destinationFloorName?: string;
  private destinationAreaHint?: string;

  constructor(
    private readonly mapView: MapView,
    private readonly mapData: MapData,
    private readonly mapId: string,
  ) {}

  setRoutePlanningPaused(paused: boolean): void {
    this.routePlanningPaused = paused;
  }

  get hasOrigin(): boolean {
    return this.originCoord != null;
  }

  get hasDestination(): boolean {
    return this.destinationCoord != null;
  }

  get destinationName(): string {
    return this.destinationLabel;
  }

  get markersState(): {
    origin?: RouteCoordinate | null;
    destination?: RouteCoordinate | null;
    destinationLabel?: string;
    destinationFloorName?: string;
    destinationAreaHint?: string;
  } {
    return {
      origin: serializeCoordinate(this.originCoord),
      destination: serializeCoordinate(this.destinationCoord),
      destinationLabel: this.destinationLabel,
      destinationFloorName: this.destinationFloorName,
      destinationAreaHint: this.destinationAreaHint,
    };
  }

  clearHighlights(): void {
    for (const marker of this.highlightMarkers) {
      try {
        marker?.remove?.();
      } catch {
        /* ignore */
      }
    }
    this.highlightMarkers = [];
  }

  highlightSearchResults(targets: unknown[]): void {
    this.clearHighlights();
    for (const target of targets) {
      const coord = this.canonicalCoordinate(target);
      if (!coord || !this.mapView.Markers?.add) continue;
      const marker = this.mapView.Markers.add(
        coord as never,
        '<div style="width:12px;height:12px;border-radius:50%;background:#3b82f6;border:2px solid white;"></div>',
      );
      if (marker) this.highlightMarkers.push(marker as MarkerHandle);
    }
  }

  async focusLocation(target: unknown): Promise<void> {
    const coord = this.canonicalCoordinate(target) ?? target;
    if (!coord) return;
    const floor = this.resolveFloor(
      (coord as { floor?: { id?: string } | string }).floor,
    );
    if (floor?.id) this.mapView.setFloor(floor.id);
    this.mapView.Camera?.focusOn?.(coord as never, { maxZoomLevel: 20 });
  }

  async handleMapClick(coordinate: unknown): Promise<void> {
    if (this.routePlanningPaused) return;

    if (this.markerMode === 'start' || !this.originCoord) {
      this.setOrigin(coordinate, 'map tap');
      this.markerMode = 'end';
      return;
    }

    this.setDestination(coordinate, 'map tap', 'End point');
  }

  setOrigin(coordinate: unknown, source = 'map tap'): void {
    const canonical = this.canonicalCoordinate(coordinate);
    if (!canonical) return;

    if (
      this.destinationCoord &&
      haversineMeters(
        serializeCoordinate(canonical)!,
        serializeCoordinate(this.destinationCoord)!,
      ) < 3
    ) {
      throw new Error(
        'Start point is too close to the end point. Tap farther apart on the map.',
      );
    }

    this.originCoord = canonical;
    this.placeMarker('origin', canonical, START_MARKER);
    appLog('Route', `Start set (${source})`);
    if (!this.destinationCoord) this.markerMode = 'end';
  }

  setDestination(
    coordinate: unknown,
    source = 'map tap',
    label = 'End point',
    meta?: { floorName?: string; areaHint?: string },
  ): void {
    const canonical = this.canonicalCoordinate(coordinate);
    if (!canonical) return;

    if (
      this.originCoord &&
      haversineMeters(
        serializeCoordinate(canonical)!,
        serializeCoordinate(this.originCoord)!,
      ) < 3
    ) {
      throw new Error(
        'End point is too close to the start point. Tap farther apart on the map.',
      );
    }

    this.destinationCoord = canonical;
    this.destinationLabel = label;
    const resolvedFloor = this.resolveFloor(
      (canonical as { floor?: { id?: string } | string }).floor,
    );
    this.destinationFloorName =
      meta?.floorName ??
      (resolvedFloor?.name ? normalizeLevelName(resolvedFloor.name) : undefined);
    this.destinationAreaHint =
      meta?.areaHint ??
      (label !== 'End point' ? inferAreaHint(label) : 'On this level');
    this.placeMarker('destination', canonical, END_MARKER);
    appLog('Route', `Destination set (${source}): ${label}`);
  }

  async setDestinationFromLocation(
    target: unknown,
    label: string,
    meta?: { floorName?: string; areaHint?: string },
  ): Promise<void> {
    const coord = this.canonicalCoordinate(target) ?? target;
    if (!coord) return;
    await this.focusLocation(coord);
    this.setDestination(coord, 'search', label, meta);
  }

  focusRoutePoint(which: 'start' | 'end'): void {
    const coord = which === 'end' ? this.destinationCoord : this.originCoord;
    if (!coord) return;
    const floor = this.resolveFloor(
      (coord as { floor?: { id?: string } | string }).floor,
    );
    if (floor?.id) this.mapView.setFloor(floor.id);
    this.mapView.Camera?.focusOn?.(coord as never, { maxZoomLevel: 20 });
    this.markerMode = which === 'end' ? 'end' : 'start';
  }

  async generateRoute(): Promise<RoutePayload> {
    if (!this.originCoord || !this.destinationCoord) {
      throw new Error('Set both start and end points before routing.');
    }

    const originTargets = await this.routableTargetsNear(this.originCoord);
    const destTargets = await this.routableTargetsNear(this.destinationCoord);

    const from = originTargets.length === 1 ? originTargets[0] : originTargets;
    const to = destTargets.length === 1 ? destTargets[0] : destTargets;

    this.mapView.Navigation?.clear?.();
    this.mapView.Paths?.removeAll?.();

    const directions = await this.mapData.getDirections(
      from as TNavigationTarget | TNavigationTarget[],
      to as TNavigationTarget | TNavigationTarget[],
    );
    if (!directions) {
      throw new Error('No route found between the selected points.');
    }

    this.mapView.Navigation.draw(directions, {
      pathOptions: {
        displayArrowsOnPath: true,
        animateArrowsOnPath: true,
      },
    });

    this.syncMarkers();

    return buildRoutePayload(
      directions,
      this.destinationLabel,
      this.mapId,
      this.originCoord,
      this.destinationCoord,
    );
  }

  selectLeg(_legIndex: number): void {
    // Leg instructions are handled in UI from route payload.
  }

  clearRoutePoints(): void {
    this.originCoord = null;
    this.destinationCoord = null;
    this.destinationLabel = 'End point';
    this.destinationFloorName = undefined;
    this.destinationAreaHint = undefined;
    this.markerMode = 'start';
    this.removeMarker('origin');
    this.removeMarker('destination');
  }

  clearRoute(): void {
    this.mapView.Navigation?.stopTracking?.();
    this.mapView.Navigation?.clear?.();
    this.mapView.Paths?.removeAll?.();
  }

  /** Grey out the portion of the active navigation path already walked. */
  updateTravelledPath(position: RouteCoordinate): void {
    const navigation = this.mapView.Navigation as
      | {
          trackCoordinate?: (
            coordinate: unknown,
            options: { mode: 'travelled'; color?: string },
          ) => unknown;
        }
      | undefined;
    if (!navigation?.trackCoordinate) return;

    const floor = position.floorId
      ? this.mapData.getById('floor', position.floorId)
      : this.mapView.currentFloor;

    const coordinate = this.mapView.createCoordinate?.(
      position.latitude,
      position.longitude,
      floor ?? undefined,
    );
    if (!coordinate) return;

    navigation.trackCoordinate(coordinate, {
      mode: 'travelled',
      color: '#9ca3af',
    });
  }

  clearTravelledPathTracking(): void {
    this.mapView.Navigation?.stopTracking?.();
  }

  resetAll(): void {
    this.clearRoute();
    this.clearRoutePoints();
    this.clearHighlights();
  }

  private syncMarkers(): void {
    if (this.originCoord) {
      this.placeMarker('origin', this.originCoord, START_MARKER);
    }
    if (this.destinationCoord) {
      this.placeMarker('destination', this.destinationCoord, END_MARKER);
    }
  }

  private placeMarker(
    which: 'origin' | 'destination',
    coordinate: unknown,
    html: string,
  ): void {
    if (!this.mapView.Markers?.add) return;
    if (which === 'origin') {
      try {
        this.originMarker?.remove?.();
      } catch {
        /* ignore */
      }
      this.originMarker = this.mapView.Markers.add(
        coordinate as never,
        html,
      ) as MarkerHandle;
    } else {
      try {
        this.destinationMarker?.remove?.();
      } catch {
        /* ignore */
      }
      this.destinationMarker = this.mapView.Markers.add(
        coordinate as never,
        html,
      ) as MarkerHandle;
    }
  }

  private removeMarker(which: 'origin' | 'destination'): void {
    try {
      if (which === 'origin') this.originMarker?.remove?.();
      else this.destinationMarker?.remove?.();
    } catch {
      /* ignore */
    }
    if (which === 'origin') this.originMarker = null;
    else this.destinationMarker = null;
  }

  private resolveFloor(floorRef: unknown): { id: string; name?: string } | null {
    if (!floorRef) return this.mapView.currentFloor ?? null;
    const id =
      typeof floorRef === 'object' && floorRef && 'id' in floorRef
        ? String((floorRef as { id: string }).id)
        : String(floorRef);
    return this.mapData.getById('floor', id) ?? null;
  }

  private canonicalCoordinate(target: unknown): unknown {
    if (!target) return null;
    const serialized = serializeCoordinate(target);
    if (serialized && this.mapView.createCoordinate) {
      const floor = serialized.floorId
        ? this.mapData.getById('floor', serialized.floorId)
        : this.mapView.currentFloor;
      return (
        this.mapView.createCoordinate(
          serialized.latitude,
          serialized.longitude,
          floor ?? undefined,
        ) ?? target
      );
    }
    return target;
  }

  private async routableTargetsNear(coordinate: unknown): Promise<unknown[]> {
    const normalized = this.canonicalCoordinate(coordinate) ?? coordinate;
    const targets: unknown[] = [normalized];

    try {
      const query = this.mapData.Query as {
        nearest?: (...args: unknown[]) => Promise<unknown[]>;
      };
      if (query?.nearest) {
        const nearest = await query.nearest(normalized, ['space'], {
          limit: 'same-floor',
        });
        if (Array.isArray(nearest)) {
          for (const entry of nearest) {
            const feature = (entry as { feature?: unknown }).feature ?? entry;
            if (feature) targets.push(feature);
          }
        }
      }
    } catch {
      /* use coordinate only */
    }

    return targets;
  }
}
