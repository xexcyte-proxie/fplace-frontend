import { getMapData, show3dMap } from '@mappedin/mappedin-js';
import type { MapData, MapView } from '@mappedin/mappedin-js';

import { appConfig } from '../config';
import { closeArFullscreen, buildArUrl, openArFullscreen } from './ar-service';
import { scheduleLocationLabels } from './labels-service';
import { LocationService } from './location-service';
import { RoutePlanner } from './route-planner';
import { resolveMapTarget, searchVenue } from './search-service';
import { AppStore } from '../state/app-store';
import type { FloorInfo, RoutePayload } from '../types';
import { legInstructions } from '../utils/route-helpers';
import { appLog, appWarn } from '../utils/logger';
import { serializeCoordinate } from '../utils/route-helpers';

export class MapApp {
  private mapView: MapView | null = null;
  private mapData: MapData | null = null;
  private routePlanner: RoutePlanner | null = null;
  private readonly locationService = new LocationService();
  private initTimeout: ReturnType<typeof setTimeout> | null = null;
  private autoRoutePending = false;
  private locationPromptShown = false;

  constructor(private readonly store: AppStore) {}

  async start(mapContainer: HTMLElement): Promise<void> {
    this.store.patch({
      mapStatus: 'loading',
      loadingMessage: 'Loading map SDK…\nFirst open can take 1–2 minutes.',
    });

    this.initTimeout = setTimeout(() => {
      const state = this.store.get();
      if (state.mapStatus !== 'ready') {
        this.showToast(
          'Map is taking longer than expected. Check your network connection.',
        );
      }
    }, appConfig.mapInitTimeoutMs);

    try {
      this.mapData = await getMapData({
        key: appConfig.mappedin.key,
        secret: appConfig.mappedin.secret,
        mapId: appConfig.mappedin.mapId,
      });

      this.store.patch({ loadingMessage: 'Starting 3D map…' });

      this.mapView = await show3dMap(mapContainer, this.mapData);
      this.routePlanner = new RoutePlanner(
        this.mapView,
        this.mapData,
        appConfig.mappedin.mapId,
      );

      this.wireMapEvents();
      this.publishFloors();

      scheduleLocationLabels(this.mapView, this.mapData);

      if (this.initTimeout) clearTimeout(this.initTimeout);
      this.store.patch({
        mapStatus: 'ready',
        loadingMessage: 'Ready',
        currentFloorId: this.mapView.currentFloor?.id,
      });

      this.maybePromptLocation();
      appLog('Map', 'Ready');
    } catch (error) {
      if (this.initTimeout) clearTimeout(this.initTimeout);
      const message =
        error instanceof Error ? error.message : 'Map failed to load';
      appWarn('Map', 'Init failed', error);
      this.store.patch({
        mapStatus: 'error',
        mapError: message,
        loadingMessage: message,
      });
    }
  }

  async submitSearch(query: string): Promise<void> {
    if (!this.mapData || !this.routePlanner) return;

    this.store.patch({ searchQuery: query });

    if (!query.trim()) {
      this.routePlanner.clearHighlights();
      this.store.patch({ searchResults: [], isSearching: false });
      return;
    }

    this.store.patch({ isSearching: true });
    const results = await searchVenue(this.mapData, query);
    const targets = results
      .map((r) => resolveMapTarget(this.mapData!, r.id))
      .filter(Boolean);
    this.routePlanner.highlightSearchResults(targets);
    this.store.patch({ searchResults: results, isSearching: false });
  }

  async selectSearchResult(locationId: string, name: string): Promise<void> {
    if (!this.mapData || !this.routePlanner) return;

    const target = resolveMapTarget(this.mapData, locationId);
    if (!target) {
      this.showToast('Could not focus that location.');
      return;
    }

    await this.routePlanner.setDestinationFromLocation(target, name);
    this.routePlanner.clearHighlights();
    this.store.patch({
      searchResults: [],
      searchQuery: '',
      markers: this.routePlanner.markersState,
    });
    this.scheduleAutoRoute();
  }

  async selectFloor(floorId: string): Promise<void> {
    if (!this.mapView) return;
    this.mapView.setFloor(floorId);
    this.store.patch({ currentFloorId: floorId });
  }

  async goToMyLocation(): Promise<void> {
    if (!this.mapView || !this.routePlanner) return;

    try {
      const position = await this.locationService.getCurrentPosition();
      const { latitude, longitude, accuracy } = position.coords;
      const floor = this.mapView.currentFloor;
      const coordinate = this.mapView.createCoordinate(
        latitude,
        longitude,
        floor ?? undefined,
      );
      if (!coordinate) {
        throw new Error('Could not place your location on the map.');
      }

      this.mapView.Camera?.focusOn?.(coordinate, { maxZoomLevel: 20 });
      this.routePlanner.setOrigin(coordinate, 'my location');
      this.store.patch({ markers: this.routePlanner.markersState });
      this.showToast(
        `Centered on your location (±${Math.round(accuracy)} m).`,
      );
      this.scheduleAutoRoute();
    } catch (error) {
      const message =
        error instanceof GeolocationPositionError
          ? this.locationService.geolocationErrorMessage(error)
          : error instanceof Error
            ? error.message
            : 'Could not get your location.';
      this.showToast(message);
    }
  }

  async clearRoutePoints(): Promise<void> {
    if (!this.routePlanner) return;
    await this.clearRoute();
    this.routePlanner.clearRoutePoints();
    this.store.patch({
      markers: this.routePlanner.markersState,
      showRouteSheet: false,
    });
  }

  async clearRoute(): Promise<void> {
    if (!this.routePlanner) return;
    this.routePlanner.clearRoute();
    this.routePlanner.setRoutePlanningPaused(false);
    this.store.patch({
      route: null,
      showRouteSheet: false,
      currentLegIndex: 0,
      routeInstructions: '',
    });
  }

  routePreviousLeg(): void {
    const state = this.store.get();
    if (!state.route) return;
    const next = Math.max(0, state.currentLegIndex - 1);
    this.applyLegIndex(next);
  }

  routeNextLeg(): void {
    const state = this.store.get();
    if (!state.route) return;
    const next = Math.min(state.route.legs.length - 1, state.currentLegIndex + 1);
    this.applyLegIndex(next);
  }

  async openAr(): Promise<void> {
    const state = this.store.get();
    if (!state.route) {
      this.showToast('Generate a route before opening AR.');
      return;
    }

    let userPosition = serializeCoordinate(
      state.route.pathCoordinates[0] ?? null,
    );
    try {
      const position = await this.locationService.getCurrentPosition();
      userPosition = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
    } catch {
      /* optional seed */
    }

    const url = buildArUrl(
      state.route,
      state.currentLegIndex,
      state.routeInstructions,
      userPosition,
    );
    openArFullscreen(url);
    this.store.patch({ isArOpen: true });
    appLog('AR', 'Opened', url);
  }

  closeAr(): void {
    closeArFullscreen();
    this.store.patch({ isArOpen: false });
  }

  focusRouteStart(): void {
    this.routePlanner?.focusRoutePoint('start');
  }

  focusRouteEnd(): void {
    this.routePlanner?.focusRoutePoint('end');
  }

  private wireMapEvents(): void {
    if (!this.mapView) return;

    this.mapView.on('click', async (event) => {
      if (!this.routePlanner || this.store.get().showRouteSheet) return;
      try {
        await this.routePlanner.handleMapClick(event.coordinate);
        this.store.patch({ markers: this.routePlanner.markersState });
        this.scheduleAutoRoute();
      } catch (error) {
        this.showToast(
          error instanceof Error ? error.message : 'Could not set route point.',
        );
      }
    });

    this.mapView.on('floor-change', (event) => {
      const floorId =
        (event as { floor?: { id?: string } }).floor?.id ??
        this.mapView?.currentFloor?.id;
      if (floorId) this.store.patch({ currentFloorId: floorId });
    });
  }

  private publishFloors(): void {
    if (!this.mapData) return;
    const floors: FloorInfo[] = this.mapData
      .getByType('floor')
      .map((floor, index) => ({
        id: floor.id,
        name: floor.name ?? `Floor ${index + 1}`,
        sortOrder: index,
      }));
    this.store.patch({ floors });
  }

  private scheduleAutoRoute(): void {
    if (!this.routePlanner?.hasOrigin || !this.routePlanner?.hasDestination) {
      return;
    }
    if (this.autoRoutePending) return;
    this.autoRoutePending = true;

    queueMicrotask(async () => {
      this.autoRoutePending = false;
      if (!this.routePlanner?.hasOrigin || !this.routePlanner?.hasDestination) {
        return;
      }
      await this.generateAndShowRoute();
    });
  }

  private async generateAndShowRoute(): Promise<void> {
    if (!this.routePlanner) return;

    this.store.patch({ isCalculatingRoute: true });
    try {
      const route = await this.routePlanner.generateRoute();
      this.applyRoute(route);
    } catch (error) {
      this.showToast(
        error instanceof Error ? error.message : 'Route generation failed.',
      );
    } finally {
      this.store.patch({ isCalculatingRoute: false });
    }
  }

  private applyRoute(route: RoutePayload): void {
    if (!this.routePlanner) return;
    this.routePlanner.setRoutePlanningPaused(true);
    const instructions = legInstructions(route.legs[0]);
    this.store.patch({
      route,
      showRouteSheet: true,
      currentLegIndex: 0,
      routeInstructions: instructions,
      markers: this.routePlanner.markersState,
    });
  }

  private applyLegIndex(legIndex: number): void {
    const state = this.store.get();
    if (!state.route) return;
    const leg = state.route.legs[legIndex];
    this.routePlanner?.selectLeg(legIndex);
    this.store.patch({
      currentLegIndex: legIndex,
      routeInstructions: legInstructions(leg),
    });
  }

  private maybePromptLocation(): void {
    if (this.locationPromptShown || !navigator.geolocation) return;
    this.locationPromptShown = true;
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((status) => {
          if (status.state === 'prompt') {
            this.showToast('Tap ⊕ to share your location for routing.');
          }
        })
        .catch(() => undefined);
    }
  }

  private showToast(message: string): void {
    this.store.patch({ toast: message });
    window.setTimeout(() => {
      if (this.store.get().toast === message) {
        this.store.patch({ toast: undefined });
      }
    }, 5000);
  }
}
