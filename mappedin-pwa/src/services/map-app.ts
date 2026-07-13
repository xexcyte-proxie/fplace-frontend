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
  setArMaximized,
  setArMinimized,
  syncNavigationToAr,
  warmArIframe,
  type NavigationProgressSnapshot,
} from './ar-service';
import { navigationStateSynchronizer } from '../routing/navigation-state-synchronizer';
import { routeLifecycleManager } from '../routing/route-lifecycle-manager';
import { AuthApiError, registerUser, resendVerification, verifyEmail } from './auth-service';
import { BlueDotService } from './blue-dot-service';
import type { PositionProvider } from '../position/positionProvider';
import { HighFrequencyMockProvider } from '../position/providers/mockProvider';
import { PositionProviderRegistry } from '../position/providerRegistry';
import { requestDeviceOrientationPermission } from '../position/providers/gpsProvider';
import type { FplacesPositionFrame, PositionSourceType } from '../position/types';
import { scheduleSocialMapMarkers, type LocationCardSelection, type SocialMapMarkerService } from '../map/social-map-markers';
import { LocationService } from './location-service';
import { RoutePlanner, ROUTE_NOT_FOUND_MESSAGE } from './route-planner';
import { resolveMapTarget, getLocationChips, searchVenue } from './search-service';
import { AppStore } from '../state/app-store';
import type { AppTab, BlueDotStatus, FloorInfo, RouteCoordinate, RoutePayload, SocialCategory, VenueFeedFilter } from '../types';
import { isArSessionActive, markOnboardingComplete, storeAuthUser } from '../types';
import { inferAreaHint } from '../ui/route-summary';
import { INITIAL_SOCIAL_POSTS, SOCIAL_CATEGORY_LABELS, SOCIAL_LOCATIONS_BY_ID, SOCIAL_QUICK_TAG_LABELS } from '../ui/social-data';
import { INITIAL_VENUE_FEED_POSTS } from '../ui/venue-feed-data';
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
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private searchGeneration = 0;
  private authFlowBootstrapped = false;
  private socialMapMarkers: SocialMapMarkerService | null = null;

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

      this.socialMapMarkers = scheduleSocialMapMarkers(
        this.mapView,
        this.mapData,
        mapContainer,
        (selection) => {
          this.handleLocationCardSelect(selection);
        },
      );

      this.store.subscribe((state) => {
        if (state.mapStatus !== 'ready') return;
        this.socialMapMarkers?.syncState(state);
      });

      if (this.initTimeout) clearTimeout(this.initTimeout);
      this.store.patch({
        mapStatus: 'ready',
        loadingMessage: 'Ready',
        loadingProgress: 100,
        currentFloorId: this.mapView.currentFloor?.id,
        searchChips: getLocationChips(this.mapData),
      });

      this.bootstrapAuthFlow();

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

  onSearchInput(query: string): void {
    if (!this.mapData || !this.routePlanner) return;

    const state = this.store.get();
    const activeChip = state.searchChips.find((chip) => chip.id === state.categoryFilter);
    const categoryFilter =
      activeChip && activeChip.label.toLowerCase() === query.trim().toLowerCase()
        ? state.categoryFilter
        : null;

    this.store.patch({ searchQuery: query, categoryFilter });

    if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);

    if (!query.trim()) {
      void this.submitSearch('');
      return;
    }

    this.searchDebounceTimer = setTimeout(() => {
      void this.submitSearch(query);
    }, 250);
  }

  async clearSearch(): Promise<void> {
    if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
    this.store.patch({ categoryFilter: null });
    await this.submitSearch('');
  }

  async submitSearch(query: string): Promise<void> {
    if (!this.mapData || !this.routePlanner) return;

    const trimmed = query.trim();
    const generation = ++this.searchGeneration;

    this.store.patch({ searchQuery: query });

    if (!trimmed) {
      this.routePlanner.clearHighlights();
      this.store.patch({ searchResults: [], isSearching: false });
      return;
    }

    this.store.patch({ isSearching: true });
    const results = await searchVenue(this.mapData, query);
    if (generation !== this.searchGeneration) return;

    const targets = results
      .map((r) => resolveMapTarget(this.mapData!, r.id))
      .filter(Boolean);
    this.routePlanner.highlightSearchResults(targets);
    this.store.patch({ searchResults: results, isSearching: false });
  }

  async setCategoryFilter(category: string | null): Promise<void> {
    const state = this.store.get();
    const chip = state.searchChips.find((entry) => entry.id === category);
    const next = state.categoryFilter === category ? null : category;
    this.store.patch({
      categoryFilter: next,
      searchQuery: next && chip ? chip.label : '',
    });

    if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);

    if (next && chip) {
      await this.submitSearch(chip.label);
    } else {
      await this.submitSearch('');
    }
  }

  setActiveTab(tab: AppTab): void {
    this.store.patch({
      activeTab: tab,
      profileView: 'main',
      socialLocation: tab === 'social' ? null : this.store.get().socialLocation,
      socialDraft: this.captureSocialDraft(),
      venueFeedDraft: this.captureVenueFeedDraft(),
    });
  }

  openProfileSettings(): void {
    this.store.patch({ activeTab: 'profile', profileView: 'settings' });
  }

  closeProfileSettings(): void {
    this.store.patch({ profileView: 'main' });
  }

  toggleNotifications(): void {
    const enabled = this.store.get().notificationsEnabled;
    this.store.patch({ notificationsEnabled: !enabled });
  }

  completeOnboarding(): void {
    markOnboardingComplete();
    this.store.patch({ onboardingComplete: true, authStep: 'none' });
  }

  private bootstrapAuthFlow(): void {
    if (this.authFlowBootstrapped) return;
    this.authFlowBootstrapped = true;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const state = this.store.get();
        if (
          state.mapStatus === 'ready' &&
          !state.onboardingComplete &&
          state.authStep === 'none'
        ) {
          this.showCreateAccount();
        }
      });
    });
  }

  showCreateAccount(): void {
    this.store.patch({ authStep: 'create', authFieldErrors: {} });
  }

  dismissCreateAccount(): void {
    this.store.patch({ authStep: 'none', authFieldErrors: {} });
  }

  async submitRegistration(
    email: string,
    password: string,
    passwordConfirm: string,
  ): Promise<void> {
    const fieldErrors: Record<string, string> = {};
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      fieldErrors.email = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      fieldErrors.email = 'Enter a valid email address.';
    }

    if (!password) {
      fieldErrors.password = 'Password is required.';
    } else if (password.length < 8) {
      fieldErrors.password = 'Password must be at least 8 characters.';
    }

    if (!passwordConfirm) {
      fieldErrors.password_confirm = 'Please confirm your password.';
    } else if (password !== passwordConfirm) {
      fieldErrors.password_confirm = 'Passwords must match.';
    }

    if (Object.keys(fieldErrors).length > 0) {
      this.store.patch({
        authEmail: trimmedEmail,
        authFieldErrors: fieldErrors,
      });
      return;
    }

    this.store.patch({
      authEmail: trimmedEmail,
      authLoading: true,
      authFieldErrors: {},
    });

    try {
      const user = await registerUser({
        email: trimmedEmail,
        password,
        password_confirm: passwordConfirm,
      });
      storeAuthUser(user);
      this.store.patch({
        authLoading: false,
        authUser: user,
        authEmail: trimmedEmail,
        authStep: 'check-email',
        authFieldErrors: {},
      });
    } catch (error) {
      if (error instanceof AuthApiError) {
        this.store.patch({
          authLoading: false,
          authFieldErrors: {
            ...error.fieldErrors,
            ...(Object.keys(error.fieldErrors).length === 0
              ? { _form: error.summary }
              : {}),
          },
        });
        return;
      }

      this.store.patch({
        authLoading: false,
        authFieldErrors: {
          _form:
            error instanceof TypeError
              ? 'Cannot reach the registration service. Restart the dev server and try again.'
              : 'Could not create your account. Please try again.',
        },
      });
      appWarn('Auth', 'Registration failed', error);
    }
  }

  dismissCheckEmail(): void {
    this.store.patch({ authStep: 'create', authFieldErrors: {} });
  }

  proceedToVerifyEmail(): void {
    this.store.patch({ authStep: 'verify', authFieldErrors: {} });
  }

  dismissVerifyEmail(): void {
    this.store.patch({ authStep: 'check-email', authFieldErrors: {} });
  }

  async submitVerification(otp: string): Promise<void> {
    const state = this.store.get();
    const email = state.authEmail || state.authUser?.email || '';
    const trimmedOtp = otp.trim();
    const fieldErrors: Record<string, string> = {};

    if (!/^\d{6}$/.test(trimmedOtp)) {
      fieldErrors.otp = 'Enter the 6-digit code from your email.';
    }

    if (!email) {
      fieldErrors._form = 'Missing email for verification. Please sign up again.';
    }

    if (Object.keys(fieldErrors).length > 0) {
      this.store.patch({ authFieldErrors: fieldErrors });
      return;
    }

    this.store.patch({ authLoading: true, authFieldErrors: {} });

    try {
      const user = await verifyEmail(email, trimmedOtp);
      if (!user.is_email_verified) {
        this.store.patch({
          authLoading: false,
          authFieldErrors: {
            _form: 'Verification did not complete. Please try again.',
          },
        });
        return;
      }
      storeAuthUser(user);
      this.store.patch({
        authLoading: false,
        authUser: user,
        authFieldErrors: {},
      });
      this.completeOnboarding();
      this.showToast('Email verified. Welcome to fplaces!');
    } catch (error) {
      if (error instanceof AuthApiError) {
        this.store.patch({
          authLoading: false,
          authFieldErrors: {
            ...error.fieldErrors,
            ...(Object.keys(error.fieldErrors).length === 0
              ? { _form: error.summary }
              : {}),
          },
        });
        return;
      }

      this.store.patch({
        authLoading: false,
        authFieldErrors: {
          _form:
            error instanceof TypeError
              ? 'Cannot reach the verification service. Try again.'
              : 'Could not verify your email. Please try again.',
        },
      });
      appWarn('Auth', 'Verification failed', error);
    }
  }

  async resendVerificationCode(): Promise<void> {
    const state = this.store.get();
    const email = state.authEmail || state.authUser?.email || '';
    if (!email) {
      this.showToast('Missing email for verification.');
      return;
    }

    try {
      const message = await resendVerification(email);
      this.showToast(message);
    } catch (error) {
      const message =
        error instanceof AuthApiError
          ? error.summary
          : 'Could not resend the verification code.';
      this.showToast(message);
      appWarn('Auth', 'Resend verification failed', error);
    }
  }

  setSocialCategory(category: SocialCategory): void {
    this.store.patch({
      socialCategory: category,
      socialDraft: this.captureSocialDraft(),
    });
  }

  setSocialLocation(locationId: string | null): void {
    if (!locationId) return;
    this.store.patch({
      activeTab: 'social',
      socialLocation: locationId,
      venueFeedDraft: this.captureVenueFeedDraft(),
    });
  }

  handleLocationCardSelect(selection: LocationCardSelection): void {
    this.store.patch({ locationActionPrompt: selection });
  }

  dismissLocationActionPrompt(): void {
    this.store.patch({ locationActionPrompt: null });
  }

  confirmLocationConversation(): void {
    const prompt = this.store.get().locationActionPrompt;
    if (!prompt) return;
    this.store.patch({ locationActionPrompt: null });
    this.setSocialLocation(prompt.locationId);
  }

  confirmLocationNavigate(): void {
    const state = this.store.get();
    const prompt = state.locationActionPrompt;
    if (!prompt) return;
    this.store.patch({ locationActionPrompt: null });
    if (state.markers.origin) {
      void this.setDestinationFromLocationCard(prompt);
      return;
    }
    void this.setOriginFromLocationCard(prompt);
  }

  private async setOriginFromLocationCard(
    selection: LocationCardSelection,
  ): Promise<void> {
    if (!this.routePlanner) return;

    try {
      if (this.store.get().route) {
        this.routePlanner.clearRoute();
        this.routePlanner.setRoutePlanningPaused(false);
        this.stopPositionProvider();
      }

      await this.routePlanner.setOriginFromLocation(
        selection.anchor,
        selection.name,
      );

      const hasDestination = this.routePlanner.hasDestination;
      this.store.patch({
        activeTab: 'map',
        markers: this.routePlanner.markersState,
        showRouteSheet: hasDestination,
        route: null,
        routeNotFound: false,
        routeSimulating: false,
        routeSimulationComplete: false,
        routeTraveledMeters: 0,
        routeRemainingMeters: null,
      });

      if (hasDestination) {
        this.scheduleAutoRoute();
      }
    } catch (error) {
      this.showToast(
        error instanceof Error ? error.message : 'Could not set start point.',
      );
    }
  }

  private async setDestinationFromLocationCard(
    selection: LocationCardSelection,
  ): Promise<void> {
    if (!this.routePlanner) return;

    try {
      if (this.store.get().route) {
        this.routePlanner.clearRoute();
        this.routePlanner.setRoutePlanningPaused(false);
        this.stopPositionProvider();
      }

      await this.routePlanner.setDestinationFromLocation(
        selection.anchor,
        selection.name,
        { areaHint: inferAreaHint(selection.name) },
      );

      this.store.patch({
        activeTab: 'map',
        markers: this.routePlanner.markersState,
        showRouteSheet: true,
        route: null,
        routeNotFound: false,
        routeSimulating: false,
        routeSimulationComplete: false,
        routeTraveledMeters: 0,
        routeRemainingMeters: null,
      });
      this.scheduleAutoRoute();
    } catch (error) {
      this.showToast(
        error instanceof Error ? error.message : 'Could not set destination.',
      );
    }
  }

  setVenueFeedFilter(filter: VenueFeedFilter): void {
    this.store.patch({
      venueFeedFilter: filter,
      venueFeedDraft: this.captureVenueFeedDraft(),
    });
  }

  setVenueFeedDraft(draft: string): void {
    this.store.patch({ venueFeedDraft: draft });
  }

  setVenueQuickReply(text: string): void {
    this.store.patch({ venueFeedDraft: text });
  }

  toggleVenueFeedUpvote(postId: string): void {
    const state = this.store.get();
    const posts = state.venueFeedPosts.length
      ? [...state.venueFeedPosts]
      : [...INITIAL_VENUE_FEED_POSTS];
    const post = posts.find((entry) => entry.id === postId);
    if (!post) return;

    const upvoted = state.upvotedPostIds.includes(postId);
    if (upvoted) {
      post.upvotes = Math.max(0, post.upvotes - 1);
      this.store.patch({
        venueFeedPosts: posts,
        upvotedPostIds: state.upvotedPostIds.filter((id) => id !== postId),
        venueFeedDraft: this.captureVenueFeedDraft(),
      });
      return;
    }

    post.upvotes += 1;
    this.store.patch({
      venueFeedPosts: posts,
      upvotedPostIds: [...state.upvotedPostIds, postId],
      venueFeedDraft: this.captureVenueFeedDraft(),
    });
  }

  submitVenueFeedPost(): void {
    const state = this.store.get();
    const content = this.captureVenueFeedDraft().trim();
    if (!content) return;

    const posts = state.venueFeedPosts.length
      ? [...state.venueFeedPosts]
      : [...INITIAL_VENUE_FEED_POSTS];

    posts.unshift({
      id: `venue-post-${Date.now()}`,
      author: 'You',
      initials: 'YO',
      avatarColor: '#3b5998',
      location: 'LA Stadium',
      locationId: state.socialLocation ?? 'section-118',
      timeAgo: 'just now',
      feedType: 'hype',
      content,
      upvotes: 0,
      comments: 0,
    });

    this.store.patch({
      venueFeedPosts: posts,
      venueFeedDraft: '',
    });
  }

  private captureVenueFeedDraft(): string {
    return (
      document.querySelector<HTMLInputElement>('#venue-feed-input')?.value ??
      this.store.get().venueFeedDraft
    );
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

    const state = this.store.get();
    if (isArSessionActive(state.arPresentation) && state.route) {
      navigationStateSynchronizer.sync({
        route: state.route,
        currentLegIndex: state.currentLegIndex,
        instructions: state.routeInstructions,
        floors: state.floors,
        navigationProgress: this.getNavigationProgressSnapshot(),
        reason: 'floor_change',
      });
    }
  }

  /** Called from AR iframe when user transitions floors during Live View. */
  forceFloor(floorId: string): void {
    void this.selectFloor(floorId);
  }

  zoomIn(): void {
    if (!this.mapView) return;
    const camera = this.mapView.Camera;
    const zoomLevel = Math.min(camera.zoomLevel + 1, camera.maxZoomLevel);
    void camera.animateTo({ zoomLevel }, { duration: 200 });
  }

  zoomOut(): void {
    if (!this.mapView) return;
    const camera = this.mapView.Camera;
    const zoomLevel = Math.max(camera.zoomLevel - 1, camera.minZoomLevel);
    void camera.animateTo({ zoomLevel }, { duration: 200 });
  }

  private zoomToOverview(): void {
    if (!this.mapView) return;
    const camera = this.mapView.Camera;
    const overviewZoom = Math.max(camera.minZoomLevel, camera.zoomLevel - 1);
    void camera.animateTo({ zoomLevel: overviewZoom }, { duration: 350 });
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
    this.blueDotService?.resetNavigationDisplay();
    this.zoomToOverview();
    this.store.patch({
      markers: this.routePlanner.markersState,
      showRouteSheet: false,
      blueDotFollowing: false,
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
      routeNotFound: false,
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

    const progress = this.getNavigationProgressSnapshot();
    const userPosition =
      progress.latitude != null && progress.longitude != null
        ? ({
            latitude: progress.latitude,
            longitude: progress.longitude,
            floorId: progress.floorId ?? state.route.pathCoordinates[0]?.floorId ?? 'unknown',
            ...(progress.heading != null ? { heading: progress.heading } : {}),
          } as RouteCoordinate & { heading?: number })
        : this.blueDotService?.getLastPosition()?.coordinate ??
          serializeCoordinate(state.route.pathCoordinates[0] ?? null);

    const routePayload = buildArRoutePayloadForHandoff(
      state.route,
      state.currentLegIndex,
      state.routeInstructions,
      userPosition,
      this.store.get().floors,
      progress,
    );
    const url = buildArUrl(
      state.route,
      state.currentLegIndex,
      state.routeInstructions,
      userPosition,
      this.store.get().floors,
      progress,
    );
    openArFullscreen(url, routePayload);
    this.store.patch({ arPresentation: 'fullscreen' });
    this.resumeRouteNavigation(progress);
    appLog('AR', 'Opened', { url, alongPathMeters: progress.alongPathMeters });

    void this.warmArSensors();
  }

  private async warmArSensors(): Promise<void> {
    const pendingSource = PositionProviderRegistry.resolveActiveSource();
    if (pendingSource === 'gps' || pendingSource === 'apple_indoor') {
      void requestDeviceOrientationPermission();
    }
    if (!this.blueDotService?.isTracking) {
      try {
        await this.blueDotService?.startTracking();
        await this.blueDotService?.enableHeading();
      } catch {
        /* AR can still use one-shot seed */
      }
    }
  }

  minimizeAr(): void {
    if (!isArSessionActive(this.store.get().arPresentation)) return;
    setArMinimized();
    this.store.patch({ arPresentation: 'minimized' });
    appLog('AR', 'Minimized to picture-in-picture');
  }

  maximizeAr(): void {
    if (!isArSessionActive(this.store.get().arPresentation)) return;
    setArMaximized();
    this.store.patch({ arPresentation: 'fullscreen' });
    syncNavigationToAr(this.getNavigationProgressSnapshot());
    appLog('AR', 'Maximized to fullscreen');
  }

  closeAr(): void {
    closeArFullscreen();
    this.store.patch({ arPresentation: 'closed' });
  }

  focusRouteStart(): void {
    this.routePlanner?.focusRoutePoint('start');
    this.startRouteMovement({ alongPathMeters: 0, resetProgress: true });
  }

  focusRouteEnd(): void {
    this.routePlanner?.focusRoutePoint('end');
  }

  isArOpen(): boolean {
    return (
      isArSessionActive(this.store.get().arPresentation) || isArFrameVisible()
    );
  }

  private getSimulatorProvider(): HighFrequencyMockProvider | null {
    const provider = this.positionProvider;
    if (!provider?.isRunning) return null;
    if (typeof (provider as HighFrequencyMockProvider).startSimulationMove !== 'function') {
      return null;
    }
    return provider as HighFrequencyMockProvider;
  }

  private getNavigationProgressSnapshot(): NavigationProgressSnapshot {
    const state = this.store.get();
    const provider = this.getSimulatorProvider();

    let alongPathMeters = state.routeTraveledMeters;
    let routeTraveledMeters = state.routeTraveledMeters;
    let routeRemainingMeters = state.routeRemainingMeters;
    let routeSimulating = state.routeSimulating;
    let routeSimulationComplete = state.routeSimulationComplete;
    let source: NavigationProgressSnapshot['source'] = state.routeSimulating
      ? 'simulator'
      : undefined;

    if (provider) {
      alongPathMeters = provider.getMetersAlongPath();
      routeTraveledMeters = alongPathMeters;
      const total = provider.getTotalPathMeters();
      routeRemainingMeters = Math.max(0, total - alongPathMeters);
      routeSimulating = provider.moving && !provider.isAtPathEnd();
      routeSimulationComplete = provider.isAtPathEnd() && alongPathMeters > 0;
      source = 'simulator';
    } else if (
      routeRemainingMeters == null &&
      state.route?.distanceMeters != null
    ) {
      routeRemainingMeters = Math.max(
        0,
        state.route.distanceMeters - routeTraveledMeters,
      );
    }

    const providerFrame = provider?.buildCurrentFrame?.() ?? null;
    const lastPos = this.blueDotService?.getLastPosition();
    const latitude =
      providerFrame?.latitude ??
      lastPos?.coordinate.latitude;
    const longitude =
      providerFrame?.longitude ??
      lastPos?.coordinate.longitude;
    const heading = providerFrame?.heading ?? lastPos?.heading ?? undefined;
    const floorId =
      providerFrame?.floorId ??
      lastPos?.floorId ??
      lastPos?.coordinate.floorId;

    return {
      alongPathMeters,
      routeTraveledMeters,
      routeRemainingMeters,
      routeSimulating,
      routeSimulationComplete,
      latitude,
      longitude,
      heading,
      floorId,
      source,
    };
  }

  /** Continue or start simulator at the current map progress when AR opens. */
  private resumeRouteNavigation(progress: NavigationProgressSnapshot): void {
    const state = this.store.get();
    if (!state.route?.pathCoordinates?.length) return;

    const provider = this.getSimulatorProvider();
    if (provider?.moving) {
      this.syncRouteProgress(true);
      syncNavigationToAr(this.getNavigationProgressSnapshot());
      return;
    }

    if (
      progress.routeSimulating ||
      progress.alongPathMeters > 0.05 ||
      progress.routeSimulationComplete
    ) {
      this.startRouteMovement({ alongPathMeters: progress.alongPathMeters });
      return;
    }

    this.startRouteMovement();
  }

  /** Kick simulator walk along the active route (2D “Start” and AR calibrate). */
  startRouteMovement(options?: {
    alongPathMeters?: number;
    resetProgress?: boolean;
  }): void {
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

    const currentProgress = this.getNavigationProgressSnapshot();
    const resetProgress = options?.resetProgress === true;
    let targetAlong: number;
    if (typeof options?.alongPathMeters === 'number') {
      targetAlong = options.alongPathMeters;
    } else if (
      !resetProgress &&
      (currentProgress.routeSimulating || currentProgress.alongPathMeters > 0.05)
    ) {
      targetAlong = currentProgress.alongPathMeters;
    } else {
      targetAlong = 0;
    }

    provider.seekAlongPath(targetAlong);
    provider.startSimulationMove();
    this.blueDotService?.follow();
    this.lastProgressUiAt = 0;

    const traveled = provider.getMetersAlongPath();
    const total = provider.getTotalPathMeters();
    const remaining = Math.max(0, total - traveled);
    const atEnd = provider.isAtPathEnd();

    this.store.patch({
      blueDotFollowing: true,
      routeSimulating: provider.moving && !atEnd,
      routeSimulationComplete: atEnd && traveled > 0,
      routeTraveledMeters: traveled,
      routeRemainingMeters: remaining,
    });

    console.log('[PWA Bridge] Simulator 10Hz loop armed', {
      alongPathMeters: traveled,
      pathPoints: state.route.pathCoordinates.length,
      moving: provider.moving,
      resumed: !resetProgress && targetAlong > 0,
    });

    const snapshot = this.getNavigationProgressSnapshot();
    notifyArSimulatorStarted({
      alongPathMeters: snapshot.alongPathMeters,
      pathPoints: state.route.pathCoordinates.length,
    });
    if (isArSessionActive(this.store.get().arPresentation)) {
      syncNavigationToAr(snapshot);
    }
  }

  beginOrResetRoute(): void {
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
      if (!this.routePlanner || this.routePlanner.isRoutePlanningPaused) return;
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
      routeNotFound: false,
      markers: this.routePlanner.markersState,
    });
    try {
      const route = await this.routePlanner.generateRoute();
      this.applyRoute(route);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Route generation failed.';
      this.showToast(message);
      if (message === ROUTE_NOT_FOUND_MESSAGE) {
        this.stopPositionProvider();
        this.store.patch({
          route: null,
          routeNotFound: true,
          routeInstructions: '',
          routeTraveledMeters: 0,
          routeRemainingMeters: null,
          routeSimulating: false,
          routeSimulationComplete: false,
        });
      }
    } finally {
      this.store.patch({ isCalculatingRoute: false });
    }
  }

  private applyRoute(route: RoutePayload): void {
    if (!this.routePlanner) return;
    this.routePlanner.setRoutePlanningPaused(true);
    const instructions = legInstructions(route.legs[0]);
    const wasArOpen = isArSessionActive(this.store.get().arPresentation);

    routeLifecycleManager.transition('recalculating');

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
      routeNotFound: false,
    });

    if (PositionProviderRegistry.resolveActiveSource() === 'simulator') {
      this.startPositionProvider(route.pathCoordinates);
    }
    warmArIframe();

    if (wasArOpen) {
      navigationStateSynchronizer.sync({
        route,
        currentLegIndex: 0,
        instructions,
        floors: this.store.get().floors,
        navigationProgress: this.getNavigationProgressSnapshot(),
        reason: 'reroute',
      });
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

    if (isArSessionActive(this.store.get().arPresentation)) {
      navigationStateSynchronizer.sync({
        route: state.route,
        currentLegIndex: legIndex,
        instructions: legInstructions(leg),
        floors: state.floors,
        navigationProgress: this.getNavigationProgressSnapshot(),
        reason: 'leg_change',
      });
    }
  }

  private streamPositionToAr(position: {
    coordinate: { latitude: number; longitude: number; floorId?: string };
    accuracy?: number;
    heading?: number;
    floorId?: string;
  }, animated = false): void {
    if (!isArSessionActive(this.store.get().arPresentation)) return;

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

    if (isArSessionActive(this.store.get().arPresentation)) {
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
      const route = this.store.get().route;
      const transitions = route?.floorTransitions ?? [];
      const alongM = frame.alongPathMeters ?? this.store.get().routeTraveledMeters ?? 0;
      const upcoming = transitions.find((t) => {
        const path = route?.pathCoordinates ?? [];
        return path[t.pathIndex] != null;
      });
      const result = this.floorOrchestrator.propose(frame.floorId, {
        headingDegrees: frame.heading,
        confidence: frame.accuracy != null ? Math.max(0.3, 1 - frame.accuracy / 30) : 0.6,
        distanceToTransitionM: upcoming ? Math.max(0, alongM) : undefined,
        transitionKind: upcoming?.kind,
      });
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

    if (isArFrameVisible() || isArSessionActive(this.store.get().arPresentation)) {
      if (frame.source === 'simulator') {
        // Full simulator clock at 10 Hz — single source of truth for AR.
        syncNavigationToAr(this.getNavigationProgressSnapshot());
      } else {
        const now = performance.now();
        if (now - this.lastArProviderStreamAt >= 90) {
          this.lastArProviderStreamAt = now;
          dispatchPositionToAr(frame);
        }
      }
    }

    if (this.activePositionSource === 'simulator') {
      this.blueDotService?.applySimulatorFrame(frame);
      if (this.store.get().routeSimulating || this.store.get().routeSimulationComplete) {
        this.routePlanner?.updateTravelledPath({
          latitude: frame.latitude,
          longitude: frame.longitude,
          floorId: frame.floorId ?? 'unknown',
        });
      }
      this.syncRouteProgress();
    } else if (isArSessionActive(this.store.get().arPresentation)) {
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

  showToast(message: string): void {
    this.store.patch({ toast: message });
    window.setTimeout(() => {
      if (this.store.get().toast === message) {
        this.store.patch({ toast: undefined });
      }
    }, 5000);
  }
}
