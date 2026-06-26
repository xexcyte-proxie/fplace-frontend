import { getMapData, show3dMap } from '@mappedin/mappedin-js';
import type { MapData, MapView } from '@mappedin/mappedin-js';

import { appConfig } from '../config';
import { FloorOrchestrator } from '../position/debug/floorOrchestrator';
import { positionTelemetry } from '../position/debug/telemetryLogger';
import {
  closeArFullscreen,
  buildArUrl,
  buildArRoutePayloadForHandoff,
  dispatchPositionToAr,
  isArFrameVisible,
  notifyArSimulatorStarted,
  openArFullscreen,
} from './ar-service';
import { BlueDotService } from './blue-dot-service';
import type { PositionProvider } from '../position/positionProvider';
import { HighFrequencyMockProvider } from '../position/providers/mockProvider';
import { PositionProviderRegistry } from '../position/providerRegistry';
import { requestDeviceOrientationPermission } from '../position/providers/gpsProvider';
import type { FplacesPositionFrame, PositionSourceType } from '../position/types';
import { scheduleLocationLabels } from './labels-service';
import { LocationService } from './location-service';
import { RoutePlanner } from './route-planner';
import { resolveMapTarget, searchVenue } from './search-service';
import { AppStore } from '../state/app-store';
import type { BlueDotStatus, FloorInfo, RoutePayload, SocialCategory } from '../types';
import { markOnboardingComplete } from '../types';
import { inferAreaHint } from '../ui/route-summary';
import { INITIAL_SOCIAL_POSTS, SOCIAL_CATEGORY_LABELS, SOCIAL_LOCATIONS_BY_ID, SOCIAL_QUICK_TAG_LABELS } from '../ui/social-data';
import { legInstructions } from '../utils/route-helpers';
import { appLog, appWarn } from '../utils/logger';
import { serializeCoordinate } from '../utils/route-helpers';

export class MapApp {
  private mapView: MapView | null = null;
  private mapData: MapData | null = null;
  private routePlanner: RoutePlanner | null = null;
  private blueDotService: BlueDotService | null = null;
  private positionProvider: PositionProvider | null = null;
  private activePositionSource: PositionSourceType =
    PositionProviderRegistry.resolveActiveSource();
  private readonly floorOrchestrator = new FloorOrchestrator();
  private readonly locationService = new LocationService();
  private lastArStreamAt = 0;
  /** Throttle for provider → AR iframe stream (separate from blue-dot animated path). */
  private lastArProviderStreamAt = 0;
  private initTimeout: ReturnType<typeof setTimeout> | null = null;
  private autoRoutePending = false;
  private locationPromptShown = false;
  private lastProgressUiAt = 0;

  constructor(private readonly store: AppStore) {}

  async start(mapContainer: HTMLElement): Promise<void> {
    this.store.patch({
      mapStatus: 'loading',
      loadingMessage: 'Loading map SDK…\nFirst open can take 1–2 minutes.',
      loadingProgress: 28,
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

      this.store.patch({
        loadingMessage: 'Starting 3D map…',
        loadingProgress: 55,
      });

      this.mapView = await show3dMap(mapContainer, this.mapData);
      this.suppressNativeMapBlueDot();
      this.routePlanner = new RoutePlanner(
        this.mapView,
        this.mapData,
        appConfig.mappedin.mapId,
      );
      this.blueDotService = new BlueDotService(this.mapView);
      this.blueDotService.attachHandlers({
        onPosition: (position) => this.handleBlueDotSensorPosition(position),
        onAnimatedPosition: (position) => this.handleBlueDotAnimatedPosition(position),
        onStatus: (status) => this.handleBlueDotStatus(status),
      });
      this.blueDotService.prepare({
        simulatorBoot: PositionProviderRegistry.resolveActiveSource() === 'simulator',
      });

      this.wireMapEvents();
      this.publishFloors();

      scheduleLocationLabels(this.mapView, this.mapData);

      if (this.initTimeout) clearTimeout(this.initTimeout);
      this.store.patch({
        mapStatus: 'ready',
        loadingMessage: 'Ready',
        loadingProgress: 100,
        currentFloorId: this.mapView.currentFloor?.id,
      });

      this.maybePromptLocation();
      void this.maybeAutoStartBlueDot();
      if (PositionProviderRegistry.resolveActiveSource() !== 'simulator') {
        positionTelemetry.setActiveSource(PositionProviderRegistry.resolveActiveSource());
      }
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
        loadingProgress: 0,
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

  async setCategoryFilter(category: string | null): Promise<void> {
    const next = this.store.get().categoryFilter === category ? null : category;
    this.store.patch({ categoryFilter: next });
    if (next) {
      await this.submitSearch(next);
    } else {
      await this.submitSearch('');
    }
  }

  setActiveTab(tab: 'map' | 'social'): void {
    this.store.patch({ activeTab: tab, socialDraft: this.captureSocialDraft() });
  }

  completeOnboarding(): void {
    markOnboardingComplete();
    this.store.patch({ onboardingComplete: true });
  }

  setSocialCategory(category: SocialCategory): void {
    this.store.patch({
      socialCategory: category,
      socialDraft: this.captureSocialDraft(),
    });
  }

  setSocialLocation(locationId: string | null): void {
    const current = this.store.get().socialLocation;
    this.store.patch({
      socialLocation: current === locationId ? null : locationId,
      socialDraft: this.captureSocialDraft(),
    });
  }

  setSocialTag(tagId: string | null): void {
    const state = this.store.get();
    const current = state.socialTag;
    const nextTag = current === tagId ? null : tagId;
    const draft = this.captureSocialDraft();
    this.store.patch({
      socialTag: nextTag,
      socialDraft: nextTag
        ? this.socialTagDraft(SOCIAL_QUICK_TAG_LABELS[nextTag] ?? '', draft)
        : draft,
    });
  }

  toggleSocialUpvote(postId: string): void {
    const state = this.store.get();
    const posts = state.socialPosts.length ? [...state.socialPosts] : [...INITIAL_SOCIAL_POSTS];
    const post = posts.find((entry) => entry.id === postId);
    if (!post) return;

    const upvoted = state.upvotedPostIds.includes(postId);
    if (upvoted) {
      post.upvotes = Math.max(0, post.upvotes - 1);
      this.store.patch({
        socialPosts: posts,
        upvotedPostIds: state.upvotedPostIds.filter((id) => id !== postId),
        socialDraft: this.captureSocialDraft(),
      });
      return;
    }

    post.upvotes += 1;
    this.store.patch({
      socialPosts: posts,
      upvotedPostIds: [...state.upvotedPostIds, postId],
      socialDraft: this.captureSocialDraft(),
    });
  }

  submitSocialPost(): void {
    const state = this.store.get();
    const content = this.captureSocialDraft().trim();
    if (!content) return;

    const posts = state.socialPosts.length ? [...state.socialPosts] : [...INITIAL_SOCIAL_POSTS];
    const category = state.socialCategory === 'all' ? 'vibe' : state.socialCategory;
    const locationEntry = SOCIAL_LOCATIONS_BY_ID[state.socialLocation ?? 'section-114'];

    posts.unshift({
      id: `post-${Date.now()}`,
      author: 'You',
      initials: 'YO',
      avatarColor: '#12121a',
      location: locationEntry?.label ?? 'LA Stadium',
      locationId: state.socialLocation ?? 'section-114',
      timeAgo: 'just now',
      category,
      categoryLabel: SOCIAL_CATEGORY_LABELS[category],
      content,
      upvotes: 0,
      comments: 0,
    });

    this.store.patch({
      socialPosts: posts,
      socialDraft: '',
      socialTag: null,
    });
  }

  private captureSocialDraft(): string {
    return (
      document.querySelector<HTMLInputElement>('#social-input')?.value ??
      this.store.get().socialDraft
    );
  }

  private socialTagDraft(tagLabel: string, currentDraft: string): string {
    const trimmed = currentDraft.trim();
    if (!trimmed) return tagLabel;
    if (trimmed.includes(tagLabel)) return trimmed;
    return `${trimmed} ${tagLabel}`;
  }

  async selectSearchResult(
    locationId: string,
    name: string,
    floorName?: string,
  ): Promise<void> {
    if (!this.mapData || !this.routePlanner) return;

    const target = resolveMapTarget(this.mapData, locationId);
    if (!target) {
      this.showToast('Could not focus that location.');
      return;
    }

    await this.routePlanner.setDestinationFromLocation(target, name, {
      floorName,
      areaHint: inferAreaHint(name),
    });
    this.routePlanner.clearHighlights();
    this.store.patch({
      searchResults: [],
      searchQuery: '',
      markers: this.routePlanner.markersState,
      showRouteSheet: true,
    });
    this.scheduleAutoRoute();
  }

  async selectFloor(floorId: string): Promise<void> {
    if (!this.mapView) return;
    this.floorOrchestrator.forceFloor(floorId);
    positionTelemetry.setOrchestratorState(this.floorOrchestrator.getState());
    this.mapView.setFloor(floorId);
    this.store.patch({ currentFloorId: floorId });
  }

  getActivePositionSource(): PositionSourceType {
    return this.activePositionSource;
  }

  async goToMyLocation(): Promise<void> {
    if (!this.mapView || !this.routePlanner || !this.blueDotService) return;

    try {
      if (!this.blueDotService.isTracking) {
        await this.blueDotService.startTracking({ follow: true });
        await this.blueDotService.enableHeading();
        this.store.patch({ blueDotFollowing: true });
        this.showToast('Live location tracking on.');
      } else if (this.blueDotService.isFollowing) {
        this.blueDotService.stopFollow();
        this.blueDotService.focusOnUser();
        this.store.patch({ blueDotFollowing: false });
        this.showToast('Stopped following. Blue dot still active.');
      } else {
        this.blueDotService.follow();
        this.store.patch({ blueDotFollowing: true });
      }

      const liveCoordinate =
        this.blueDotService.coordinate ??
        (await this.waitForBlueDotCoordinate(6000));
      if (!liveCoordinate) {
        throw new Error('Waiting for your location on the map…');
      }

      this.routePlanner.setOrigin(liveCoordinate, 'my location');
      this.store.patch({ markers: this.routePlanner.markersState });

      const accuracy = this.blueDotService.getLastPosition()?.accuracy;
      if (accuracy != null) {
        this.showToast(`Tracking your location (±${Math.round(accuracy)} m).`);
      }

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
      routeTraveledMeters: 0,
      routeRemainingMeters: null,
      routeSimulating: false,
      routeSimulationComplete: false,
    });

    this.stopPositionProvider();
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

    const pendingSource = PositionProviderRegistry.resolveActiveSource();
    if (pendingSource === 'gps' || pendingSource === 'apple_indoor') {
      void requestDeviceOrientationPermission();
    }

    let userPosition =
      this.blueDotService?.getLastPosition()?.coordinate ??
      serializeCoordinate(state.route.pathCoordinates[0] ?? null);
    if (!userPosition) {
      try {
        const position = await this.locationService.getCurrentPosition();
        userPosition = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
      } catch {
        /* optional seed */
      }
    }

    if (!this.blueDotService?.isTracking) {
      try {
        await this.blueDotService?.startTracking();
        await this.blueDotService?.enableHeading();
      } catch {
        /* AR can still use one-shot seed */
      }
    }

    const routePayload = buildArRoutePayloadForHandoff(
      state.route,
      state.currentLegIndex,
      state.routeInstructions,
      userPosition,
      this.store.get().floors,
    );
    const url = buildArUrl(
      state.route,
      state.currentLegIndex,
      state.routeInstructions,
      userPosition,
      this.store.get().floors,
    );
    openArFullscreen(url, routePayload);
    this.store.patch({ isArOpen: true });
    // Bootstrap paused simulator only if route planning did not already start one.
    if (
      PositionProviderRegistry.resolveActiveSource() === 'simulator' &&
      !this.getSimulatorProvider()
    ) {
      this.startPositionProvider(state.route.pathCoordinates);
    }
    appLog('AR', 'Opened', url);
  }

  closeAr(): void {
    this.stopPositionProvider();
    closeArFullscreen();
    this.store.patch({ isArOpen: false });
  }

  focusRouteStart(): void {
    this.routePlanner?.focusRoutePoint('start');
    this.startRouteMovement({ alongPathMeters: 0 });
  }

  focusRouteEnd(): void {
    this.routePlanner?.focusRoutePoint('end');
  }

  isArOpen(): boolean {
    return this.store.get().isArOpen || isArFrameVisible();
  }

  private getSimulatorProvider(): HighFrequencyMockProvider | null {
    const provider = this.positionProvider;
    if (!provider?.isRunning) return null;
    if (typeof (provider as HighFrequencyMockProvider).startSimulationMove !== 'function') {
      return null;
    }
    return provider as HighFrequencyMockProvider;
  }

  /** Kick simulator walk along the active route (2D “Start” and AR calibrate). */
  startRouteMovement(options?: { alongPathMeters?: number }): void {
    const state = this.store.get();
    if (!state.route?.pathCoordinates?.length) {
      this.showToast('Generate a route before starting navigation.');
      console.warn('[PWA Bridge] startRouteMovement skipped — no route path');
      return;
    }

    if (state.isCalculatingRoute) {
      this.showToast('Route is still calculating…');
      return;
    }

    this.activePositionSource = 'simulator';
    positionTelemetry.setActiveSource('simulator');

    let provider = this.getSimulatorProvider();
    if (!provider) {
      this.startPositionProvider(state.route.pathCoordinates);
      provider = this.getSimulatorProvider();
    }

    if (!provider) {
      this.showToast('Could not start route simulation.');
      console.error('[PWA Bridge] startRouteMovement failed — simulator provider unavailable');
      return;
    }

    if (typeof options?.alongPathMeters === 'number') {
      provider.seekAlongPath(options.alongPathMeters);
    }

    provider.startSimulationMove();
    this.blueDotService?.follow();
    this.lastProgressUiAt = 0;
    this.store.patch({
      blueDotFollowing: true,
      routeSimulating: true,
      routeSimulationComplete: false,
      routeTraveledMeters: 0,
      routeRemainingMeters: state.route.distanceMeters ?? null,
    });

    console.log('[PWA Bridge] Simulator 10Hz loop armed', {
      alongPathMeters: options?.alongPathMeters ?? 0,
      pathPoints: state.route.pathCoordinates.length,
      moving: provider.moving,
    });

    notifyArSimulatorStarted({
      alongPathMeters: options?.alongPathMeters,
      pathPoints: state.route.pathCoordinates.length,
    });
  }

  beginOrResetRoute(): void {
    if (this.store.get().routeSimulationComplete) {
      this.resetRouteSimulation();
      return;
    }
    this.startRouteMovement();
  }

  resetRouteSimulation(): void {
    const state = this.store.get();
    if (!state.route?.pathCoordinates?.length) return;

    const provider = this.getSimulatorProvider();
    provider?.seekAlongPath(0);
    provider?.stopSimulationMove();
    this.routePlanner?.clearTravelledPathTracking();

    this.lastProgressUiAt = 0;
    this.store.patch({
      routeTraveledMeters: 0,
      routeRemainingMeters: state.route.distanceMeters ?? null,
      routeSimulating: false,
      routeSimulationComplete: false,
    });
  }

  private syncRouteProgress(force = false): void {
    const state = this.store.get();
    if (!state.route) return;

    const provider = this.getSimulatorProvider();
    if (!provider) return;

    const atEnd = provider.isAtPathEnd();
    if (
      !force &&
      !state.routeSimulating &&
      !state.routeSimulationComplete &&
      !atEnd
    ) {
      return;
    }

    const now = performance.now();
    if (!force && !atEnd && now - this.lastProgressUiAt < 200) return;
    this.lastProgressUiAt = now;

    const traveled = provider.getMetersAlongPath();
    const total = provider.getTotalPathMeters();
    const remaining = Math.max(0, total - traveled);

    this.store.patch({
      routeTraveledMeters: traveled,
      routeRemainingMeters: remaining,
      routeSimulating: provider.moving && !atEnd,
      routeSimulationComplete: atEnd && traveled > 0,
    });
  }

  private suppressNativeMapBlueDot(): void {
    const nativeBlueDot = (
      this.mapView as { BlueDot?: { disable?: () => void } } | null
    )?.BlueDot;
    nativeBlueDot?.disable?.();
    appLog('Map', 'Native BlueDot suppressed at boot');
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

    this.store.patch({
      isCalculatingRoute: true,
      showRouteSheet: true,
      markers: this.routePlanner.markersState,
    });
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
      routeTraveledMeters: 0,
      routeRemainingMeters: route.distanceMeters ?? null,
      routeSimulating: false,
      routeSimulationComplete: false,
    });

    if (PositionProviderRegistry.resolveActiveSource() === 'simulator') {
      this.startPositionProvider(route.pathCoordinates);
    }
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

  private streamPositionToAr(position: {
    coordinate: { latitude: number; longitude: number; floorId?: string };
    accuracy?: number;
    heading?: number;
    floorId?: string;
  }, animated = false): void {
    if (!this.store.get().isArOpen) return;

    if (this.positionProvider?.isRunning) return;

    const now = performance.now();
    if (animated && now - this.lastArStreamAt < 90) return;
    this.lastArStreamAt = now;

    dispatchPositionToAr({
      latitude: position.coordinate.latitude,
      longitude: position.coordinate.longitude,
      accuracy: position.accuracy ?? 15,
      heading: position.heading ?? 0,
      source: this.activePositionSource,
      floorId: position.floorId ?? position.coordinate.floorId,
      timestamp: Date.now(),
    });
  }

  private handleBlueDotSensorPosition(position: {
    coordinate: { latitude: number; longitude: number; floorId?: string };
    accuracy?: number;
    heading?: number;
    floorId?: string;
  }): void {
    this.ingestPositionFrame({
      latitude: position.coordinate.latitude,
      longitude: position.coordinate.longitude,
      heading: position.heading ?? 0,
      accuracy: position.accuracy ?? 15,
      source: this.positionProvider?.isRunning ? this.activePositionSource : 'gps',
      floorId: position.floorId ?? position.coordinate.floorId,
      timestamp: Date.now(),
    });
    this.streamPositionToAr(position, false);
  }

  private handleBlueDotAnimatedPosition(position: {
    coordinate: { latitude: number; longitude: number; floorId?: string };
    mapCoordinate?: import('@mappedin/mappedin-js').Coordinate;
    accuracy?: number;
    heading?: number;
    floorId?: string;
  }): void {
    const coordinate = position.mapCoordinate;
    if (coordinate && this.store.get().route) {
      this.mapView?.Navigation?.trackCoordinate?.(coordinate, {
        mode: 'travelled',
        color: '#64748b',
      });
    }

    if (this.store.get().isArOpen) {
      this.ingestPositionFrame({
        latitude: position.coordinate.latitude,
        longitude: position.coordinate.longitude,
        heading: position.heading ?? 0,
        accuracy: position.accuracy ?? 15,
        source: this.positionProvider?.isRunning
          ? this.activePositionSource
          : 'gps',
        floorId: position.floorId ?? position.coordinate.floorId,
        timestamp: Date.now(),
      });
      this.streamPositionToAr(position, true);
    }
  }

  private startPositionProvider(path: RoutePayload['pathCoordinates']): void {
    this.stopPositionProvider();
    this.activePositionSource = PositionProviderRegistry.resolveActiveSource();
    positionTelemetry.setActiveSource(this.activePositionSource);
    this.floorOrchestrator.reset();
    positionTelemetry.setOrchestratorState(this.floorOrchestrator.getState());
    const simulatorMode = this.activePositionSource === 'simulator';
    this.blueDotService?.setSimulatorParallelMode(simulatorMode);

    const originFloorId = path[0]?.floorId ?? this.store.get().currentFloorId;
    if (originFloorId) {
      this.floorOrchestrator.forceFloor(originFloorId);
      positionTelemetry.setOrchestratorState(this.floorOrchestrator.getState());
      this.applyOrchestratedFloor(originFloorId);
    }

    if (simulatorMode && path[0]) {
      this.snapBlueDotToPathOrigin(path[0]);
    }

    this.positionProvider = PositionProviderRegistry.getProvider(
      this.activePositionSource,
    );
    this.positionProvider.start(
      (frame) => this.handleProviderFrame(frame),
      {
        path,
        floorId: originFloorId,
        expectedFloorId: originFloorId,
        venueMapId: appConfig.mappedin.mapId,
      },
    );

    appLog('Position', 'Provider started', {
      source: this.activePositionSource,
      pathPoints: path.length,
      originFloorId,
    });
  }

  private snapBlueDotToPathOrigin(origin: RoutePayload['pathCoordinates'][number]): void {
    if (origin.latitude == null || origin.longitude == null) return;

    this.blueDotService?.applySimulatorFrame({
      latitude: origin.latitude,
      longitude: origin.longitude,
      heading: 0,
      accuracy: 4,
      source: 'simulator',
      floorId: origin.floorId,
      timestamp: Date.now(),
    });
  }

  private stopPositionProvider(): void {
    this.positionProvider?.stop();
    this.positionProvider = null;
    this.blueDotService?.setSimulatorParallelMode(false);
    this.lastArStreamAt = 0;
    this.lastArProviderStreamAt = 0;
    this.floorOrchestrator.reset();
    positionTelemetry.setOrchestratorState(this.floorOrchestrator.getState());
    positionTelemetry.setActiveSource('none');
    if (this.store.get().routeSimulating || this.store.get().routeSimulationComplete) {
      this.store.patch({
        routeSimulating: false,
        routeSimulationComplete: false,
        routeTraveledMeters: 0,
        routeRemainingMeters: null,
      });
    }
  }

  private ingestPositionFrame(frame: FplacesPositionFrame, meta?: { bleUuid?: string; bleMajor?: number; bleMinor?: number; bleRssi?: number }): void {
    const currentFloorId = this.store.get().currentFloorId;
    if (
      frame.floorId &&
      currentFloorId &&
      frame.floorId !== currentFloorId
    ) {
      appLog('Position', 'Floor ID mismatch — frame floor differs from map view', {
        frameFloorId: frame.floorId,
        currentFloorId,
        source: frame.source,
      });
    }

    positionTelemetry.recordFrame(frame, meta);
    positionTelemetry.recordStreamTick(frame.source);

    if (frame.floorId) {
      const result = this.floorOrchestrator.propose(frame.floorId);
      positionTelemetry.setOrchestratorState(this.floorOrchestrator.getState());
      if (result.committedChanged && result.committedFloorId) {
        this.applyOrchestratedFloor(result.committedFloorId);
      }
    }
  }

  private applyOrchestratedFloor(floorId: string): void {
    if (!this.mapView || this.store.get().currentFloorId === floorId) return;
    this.mapView.setFloor(floorId);
    this.store.patch({ currentFloorId: floorId });
  }

  private handleProviderFrame(frame: FplacesPositionFrame): void {
    this.ingestPositionFrame(frame);

    if (isArFrameVisible() || this.store.get().isArOpen) {
      const now = performance.now();
      if (now - this.lastArProviderStreamAt >= 90) {
        this.lastArProviderStreamAt = now;
        dispatchPositionToAr(frame);
      }
    }

    if (this.activePositionSource === 'simulator') {
      this.blueDotService?.applySimulatorFrame(frame);
      if (this.store.get().routeSimulating || this.store.get().routeSimulationComplete) {
        this.routePlanner?.updateTravelledPath({
          latitude: frame.latitude,
          longitude: frame.longitude,
          floorId: frame.floorId,
        });
      }
      this.syncRouteProgress();
    } else if (this.store.get().isArOpen) {
      this.blueDotService?.applyProviderFrame(frame);
    }
  }

  private handleBlueDotStatus(status: BlueDotStatus): void {
    this.store.patch({
      blueDotStatus: status,
      blueDotFollowing: this.blueDotService?.isFollowing ?? false,
    });
  }

  private async maybeAutoStartBlueDot(): Promise<void> {
    if (
      !this.blueDotService ||
      !navigator.permissions?.query ||
      PositionProviderRegistry.resolveActiveSource() === 'simulator'
    ) {
      return;
    }

    try {
      const status = await navigator.permissions.query({ name: 'geolocation' });
      if (status.state === 'granted') {
        await this.blueDotService.startTracking();
        appLog('BlueDot', 'Auto-started (permission already granted)');
      }
    } catch (error) {
      appWarn('BlueDot', 'Could not query geolocation permission', error);
    }
  }

  private waitForBlueDotCoordinate(timeoutMs: number): Promise<import('@mappedin/mappedin-js').Coordinate | null> {
    const existing = this.blueDotService?.coordinate;
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve) => {
      const started = performance.now();
      const timer = window.setInterval(() => {
        const coordinate = this.blueDotService?.coordinate;
        if (coordinate) {
          window.clearInterval(timer);
          resolve(coordinate);
          return;
        }
        if (performance.now() - started >= timeoutMs) {
          window.clearInterval(timer);
          resolve(null);
        }
      }, 200);
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
            this.showToast('Tap ⊕ for live blue-dot tracking and routing.');
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
