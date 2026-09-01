import { show3dMap } from '@mappedin/mappedin-js';
import type { MapData, MapView } from '@mappedin/mappedin-js';

import { appConfig } from '../config';
import { isHeadingOnlyPositionFix } from '../position/domain/heading-only-frame';
import { FloorOrchestrator } from '../position/debug/floorOrchestrator';
import { positionTelemetry } from '../position/debug/telemetryLogger';
import {
  closeArFullscreen,
  buildArUrl,
  buildArRoutePayloadForHandoff,
  dispatchPositionToAr,
  isArFrameVisible,
  isArSameOrigin,
  notifyArIframePermissions,
  notifyArSimulatorStarted,
  openArFullscreen,
  setArMaximized,
  setArMinimized,
  syncNavigationToAr,
  warmArIframe,
  type NavigationProgressSnapshot,
} from './ar-service';
import { coordinateTransformationService } from '../routing/coordinate-transformation-service';
import { navigationStateSynchronizer } from '../routing/navigation-state-synchronizer';
import { routeLifecycleManager } from '../routing/route-lifecycle-manager';
import {
  computeLiveRemainingMeters,
  hasArrivedAtDestination,
  LiveAlongPathStabilizer,
} from '../routing/route-progress';
import {
  AuthApiError,
  clearStoredAuthTokens,
  clearVenueSelection,
  deleteCurrentAccount,
  fetchCurrentUser,
  hasStoredAuthTokens,
  loadVenueSelection,
  loginUser,
  logoutUser,
  onAuthSessionCleared,
  registerUser,
  resendVerification,
  changePassword,
  confirmPasswordReset,
  requestPasswordReset,
  resolveOnboardingStep,
  saveVenueSelection,
  signInWithGoogle,
  updateCurrentUser,
  userNeedsPseudoName,
  verifyEmail,
  type VenueSelection,
} from './auth-service';
import { isAuthCredentialFailure } from '../auth/data/datasources/api-client';
import { consumePasswordResetLink } from '../auth/domain/password-reset-link';
import { evaluatePasswordStrength } from '../auth/domain/password-strength';
import {
  guestDenialUserMessage,
  initializeFingerprint,
  isGuestMode,
  markGuest2dViewTried,
  markGuestArViewTried,
  registerCurrentGuestFingerprint,
  resolveGuestArEligibility,
  validateCurrentGuestAccess,
} from './guest-access-service';
import {
  resolveMappedinMapCredentials,
  toGetMapDataAuth,
} from './maps-service';
import {
  clearDeviceHasUsedApp,
  clearReturningSession,
  hasDeviceUsedApp,
  isReturningSession,
  loadReturningSession,
  markDeviceHasUsedApp,
  resolveStartupDestination,
  saveReturningSession,
  type ReturningSessionSnapshot,
} from './session-service';
import { homeRepository } from '../home/data/home-repository-impl';
import { venueVisitRepository } from '../home/data/venue-visit-repository-impl';
import { resolveHomeExperience, type HomeExperience } from '../home/domain/entities';
import { isCompleteOtpCode } from '../auth/domain/otp-code';
import {
  loadAppPreferences,
  patchAppPreferences,
} from './app-preferences-service';
import {
  clearProductTourProgress,
  hasCompletedProductTour,
  markProductTourCompleted,
  nextProductTourIndex,
  previousProductTourIndex,
  shouldAutoStartProductTour,
  stepsForHomeExperience,
  type ProductTourSurface,
} from './product-tour-service';
import {
  createForumComment,
  createForumPost,
  deleteForumComment,
  deleteForumPost,
  flagForumPost,
  listAllVenues,
  getForumVenue,
  listForumComments,
  loadInitialVenueFeed,
  loadVenueCatalog,
  subscribeVenueLiveFeed,
  toggleForumPostUpvote,
  updateForumPost,
  type ForumPost,
  type VenueLiveEvent,
  type VenueLiveSubscription,
} from './forum-service';
import {
  countUnread,
  getNotification,
  listNotifications,
  loadInitialNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  fetchUnreadNotificationCount,
  subscribePersonalNotifications,
  type AppNotification,
  type PersonalNotificationEvent,
  type PersonalNotificationSubscription,
} from './notifications-service';
import {
  mapForumCommentsToItems,
  mapForumCommentToItem,
} from '../ui/post-comments-data';
import {
  getCurrentMapLanguage,
  getSupportedMapLanguages,
  loadPreferredMapLanguage,
  savePreferredMapLanguage,
} from './map-language-service';
import { resolveMapData } from './map-offline-service';
import { BlueDotService } from './blue-dot-service';
import type { PositionProvider } from '../position/positionProvider';
import { HighFrequencyMockProvider } from '../position/providers/mockProvider';
import { PositionProviderRegistry } from '../position/providerRegistry';
import { requestDeviceOrientationPermission } from '../position/providers/gpsProvider';
import {
  beginArMediaPermissionPrime,
  consumeArMediaPermissionPrime,
  shouldReuseGrantedArCamera,
} from './media-permission-service';
import type { FplacesPositionFrame, PositionSourceType } from '../position/types';
import { scheduleSocialMapMarkers, type LocationCardSelection, type SocialMapMarkerService } from '../map/social-map-markers';
import { LocationService } from './location-service';
import {
  isLocationGateAuthStep,
  resolveLocationGateFailure,
  resolveLocationGatePreflight,
} from '../location/domain/location-gate';
import {
  LOCATION_NOT_ROUTABLE_MESSAGE,
  toUserFacingRouteError,
} from '../routing/constants';
import { RoutePlanner } from './route-planner';
import { resolveMapTarget, getLocationChips, searchVenue } from './search-service';
import { AppStore } from '../state/app-store';
import type {
  AppState,
  AppTab,
  BlueDotStatus,
  FloorInfo,
  NotificationItem,
  RegisteredUser,
  RouteCoordinate,
  RoutePayload,
  SocialCategory,
  VenueFeedFilter,
} from '../types';
import {
  clearStoredAuthUser,
  isArSessionActive,
  loadStoredUser,
  storeAuthUser,
} from '../types';
import { installCameraFollowRelease } from '../map/camera-follow-release';
import { inferAreaHint } from '../ui/route-summary';
import { INITIAL_SOCIAL_POSTS, SOCIAL_CATEGORY_LABELS, SOCIAL_LOCATIONS_BY_ID, SOCIAL_QUICK_TAG_LABELS } from '../ui/social-data';
import { mapForumPostToVenueFeed, mapForumPostsToVenueFeed } from '../ui/venue-feed-data';
import {
  generatePseudoName,
} from '../ui/pseudo-name-data';
import { defaultSectionId } from '../ui/venue-select-data';
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
  /** True while GPS/live navigation is actively tracking along the route (Begin pressed or mid-switch). */
  private liveRouteTracking = false;
  /** Holds remaining distance/time while indoor GPS jitters and the user is standing still. */
  private readonly alongPathStabilizer = new LiveAlongPathStabilizer();
  private lastProviderFix: { latitude: number; longitude: number } | null = null;
  private cameraFollowReleaseUnsub: (() => void) | null = null;
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private searchGeneration = 0;
  private authFlowBootstrapped = false;
  /** When session dies during splash, finish map load then open sign-in. */
  private pendingSignInAfterSessionExpiry = false;
  private authResumeInFlight = false;
  private venueEnterInFlight = false;
  private handlingSessionExpiry = false;
  /** One-shot: focus map search after the next UI paint (Try AR flow). */
  private pendingMapSearchFocus = false;
  /** In-memory only - used to obtain JWTs after email verification. */
  private pendingAuthPassword: string | null = null;
  private socialMapMarkers: SocialMapMarkerService | null = null;
  /** Receive-only venue room socket; opened right after the initial feed fetch. */
  private venueLiveSubscription: VenueLiveSubscription | null = null;
  /** Receive-only personal notifications socket (cross-venue, account-level). */
  private personalNotificationsSubscription: PersonalNotificationSubscription | null =
    null;
  private personalNotificationsBootstrapInFlight = false;
  private venueFeedCreateInFlight = false;
  private readonly venueFeedUpvoteInFlight = new Set<string>();
  private readonly venueFeedFlagInFlight = new Set<string>();

  constructor(private readonly store: AppStore) {
    const preferences = loadAppPreferences();
    this.store.patch({
      notificationsEnabled: preferences.notificationsEnabled,
      simulationEnabled: preferences.simulationEnabled,
      productTourCompleted: hasCompletedProductTour(),
    });
    onAuthSessionCleared(() => {
      this.handleAuthSessionExpired();
    });
  }

  async start(mapContainer: HTMLElement): Promise<void> {
    this.store.patch({
      mapStatus: 'loading',
      loadingMessage: 'Loading map SDK…\nFirst open can take 1–2 minutes.',
      loadingProgress: 28,
    });

    // Warm FingerprintJS in parallel with map load (no backend call yet).
    void initializeFingerprint().catch((error) => {
      appWarn('Guest', 'Fingerprint agent failed to initialize', error);
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
      const preferredLanguage = loadPreferredMapLanguage();
      const offline =
        typeof navigator !== 'undefined' && navigator.onLine === false;
      if (offline) {
        this.store.patch({
          loadingMessage: 'Loading cached map…',
          loadingProgress: 35,
        });
      } else {
        this.store.patch({
          loadingMessage: 'Getting map credentials…',
          loadingProgress: 32,
        });
      }

      const mapCredentials = await resolveMappedinMapCredentials();
      const resolved = await resolveMapData({
        ...toGetMapDataAuth(mapCredentials),
        mapId: mapCredentials.mapId,
        ...(preferredLanguage ? { language: preferredLanguage } : {}),
        fallbackToNavigatorLanguage: true,
      });
      this.mapData = resolved.mapData;

      this.store.patch({
        loadingMessage: resolved.fromCache
          ? 'Starting 3D map from cache…'
          : 'Starting 3D map…',
        loadingProgress: 55,
      });

      this.mapView = await show3dMap(mapContainer, this.mapData);
      this.suppressNativeMapBlueDot();
      this.routePlanner = new RoutePlanner(
        this.mapView,
        this.mapData,
        mapCredentials.mapId,
      );
      this.blueDotService = new BlueDotService(this.mapView);
      this.blueDotService.attachHandlers({
        onPosition: (position) => this.handleBlueDotSensorPosition(position),
        onAnimatedPosition: (position) => this.handleBlueDotAnimatedPosition(position),
        onStatus: (status) => this.handleBlueDotStatus(status),
      });
      this.blueDotService.prepare({
        simulatorBoot: this.store.get().simulationEnabled,
      });

      this.wireMapEvents();
      this.publishFloors();
      this.publishMapLanguages();

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

      warmArIframe();
      this.cameraFollowReleaseUnsub?.();
      this.cameraFollowReleaseUnsub = installCameraFollowRelease(
        mapContainer,
        () => this.releaseCameraFollowFromUserPan(),
      );

      void this.bootstrapAuthFlow();

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

      if (isAuthCredentialFailure(error)) {
        clearStoredAuthTokens();
        clearStoredAuthUser();
        clearReturningSession();
        markDeviceHasUsedApp();
        this.pendingSignInAfterSessionExpiry = true;
        this.store.patch({
          authUser: null,
          onboardingComplete: false,
          mapStatus: 'error',
          mapError: message,
          loadingMessage: 'Your session expired. Refresh to sign in again.',
          loadingProgress: 0,
        });
        return;
      }

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
    const state = this.store.get();
    // Tapping Navigate again from the indoor map returns to venue home.
    if (
      tab === 'map' &&
      state.activeTab === 'map' &&
      state.navigateView === 'map'
    ) {
      this.store.patch({
        navigateView: 'home',
        homeExperience: this.resolveHomeExperience(state.selectedVenueId),
        homeVenueSearchQuery: '',
        profileView: 'main',
        settingsConfirm: null,
        notificationsOpen: false,
      });
      return;
    }

    this.store.patch({
      activeTab: tab,
      profileView: 'main',
      settingsConfirm: null,
      notificationsOpen: false,
      socialLocation: tab === 'social' ? null : state.socialLocation,
      socialDraft: this.captureSocialDraft(),
      venueFeedDraft: this.captureVenueFeedDraft(),
    });
  }

  setHomeVenueSearchQuery(query: string): void {
    this.store.patch({ homeVenueSearchQuery: query });
  }

  openNavigateMap(): void {
    this.store.patch({
      activeTab: 'map',
      navigateView: 'map',
      homeVenueSearchQuery: '',
    });
    void this.consumeGuest2dMapTrial();
  }

  selectHomeRecentVenue(venueId: string): void {
    const state = this.store.get();
    const recent = state.homeContent?.recentlyVisited.find(
      (item) => item.id === venueId,
    );
    const matchedForumVenue = state.forumVenues.find(
      (venue) =>
        String(venue.id) === venueId ||
        venue.name.toLowerCase() === recent?.name.toLowerCase(),
    );

    if (matchedForumVenue) {
      this.store.patch({
        selectedVenueId: String(matchedForumVenue.id),
        homeVenueSearchQuery: '',
        navigateView: 'map',
        activeTab: 'map',
      });
      void this.consumeGuest2dMapTrial();
      this.showToast(`Opening ${matchedForumVenue.name}`);
      return;
    }

    // Demo recent venues may not match the live forum catalog yet.
    this.store.patch({
      homeVenueSearchQuery: '',
      navigateView: 'map',
      activeTab: 'map',
    });
    void this.consumeGuest2dMapTrial();
    if (recent) {
      this.showToast(`Opening ${recent.name}`);
    }
  }

  private async loadReturningHomeContent(): Promise<void> {
    try {
      const homeContent = await homeRepository.getReturningHomeContent();
      this.store.patch({ homeContent });
    } catch (error) {
      appWarn('Home', 'Could not load returning-home content', error);
    }
  }

  openProfileSettings(): void {
    this.store.patch({
      activeTab: 'profile',
      profileView: 'settings',
      settingsConfirm: null,
    });
  }

  closeProfileSettings(): void {
    this.store.patch({ profileView: 'main', settingsConfirm: null });
  }

  openMapLanguageSettings(): void {
    this.store.patch({
      activeTab: 'profile',
      profileView: 'language',
      settingsConfirm: null,
    });
  }

  closeMapLanguageSettings(): void {
    this.store.patch({ profileView: 'settings' });
  }

  openEditProfileFromSettings(): void {
    const state = this.store.get();
    const user = state.authUser;
    if (!user || !hasStoredAuthTokens()) {
      this.showLogin();
      return;
    }
    const existingName =
      user.pseudo_name?.trim() || state.pseudoNameDraft.trim() || '';
    const interests = user.interests?.length ? [...user.interests] : [];
    this.store.patch({
      activeTab: 'profile',
      profileView: 'edit-profile',
      settingsConfirm: null,
      authFieldErrors: {},
      pseudoNameDraft: existingName,
      pseudoNameHint: state.pseudoNameHint || generatePseudoName(),
      selectedInterests: interests,
    });
  }

  closeEditProfileSettings(): void {
    this.store.patch({
      profileView: 'settings',
      authFieldErrors: {},
      authLoading: false,
    });
  }

  openChangePasswordFromSettings(): void {
    const state = this.store.get();
    if (!state.authUser || !hasStoredAuthTokens()) {
      this.showLogin();
      return;
    }
    this.store.patch({
      activeTab: 'profile',
      profileView: 'change-password',
      settingsConfirm: null,
      authFieldErrors: {},
      authLoading: false,
    });
  }

  closeChangePasswordSettings(): void {
    this.store.patch({
      profileView: 'settings',
      authFieldErrors: {},
      authLoading: false,
    });
  }

  async submitChangePassword(
    oldPassword: string,
    newPassword: string,
  ): Promise<void> {
    const fieldErrors: Record<string, string> = {};
    if (!oldPassword) {
      fieldErrors.old_password = 'Current password is required.';
    }
    if (!newPassword) {
      fieldErrors.new_password = 'New password is required.';
    } else if (evaluatePasswordStrength(newPassword) !== 'strong') {
      fieldErrors.new_password =
        'Use at least 8 characters with a letter and a number.';
    } else if (oldPassword && newPassword === oldPassword) {
      fieldErrors.new_password = 'Choose a password different from the current one.';
    }

    if (Object.keys(fieldErrors).length > 0) {
      this.store.patch({ authFieldErrors: fieldErrors });
      return;
    }

    if (!hasStoredAuthTokens()) {
      this.store.patch({
        authFieldErrors: {
          _form: 'Your session expired. Please log in to continue.',
        },
      });
      this.showLogin();
      return;
    }

    this.store.patch({ authLoading: true, authFieldErrors: {} });
    try {
      const message = await changePassword({
        old_password: oldPassword,
        new_password: newPassword,
      });
      this.store.patch({
        authLoading: false,
        authFieldErrors: {},
        profileView: 'settings',
      });
      this.showToast(message || 'Password updated.');
    } catch (error) {
      this.handleAuthFailure(
        error,
        'Could not change your password. Please try again.',
      );
    }
  }

  async submitProfileEditFromSettings(pseudoName: string): Promise<void> {
    const trimmed = pseudoName.trim();
    if (!trimmed) {
      this.store.patch({
        authFieldErrors: { pseudo_name: 'Pick a pseudo-name to continue.' },
        pseudoNameDraft: trimmed,
      });
      return;
    }
    if (trimmed.length < 3) {
      this.store.patch({
        authFieldErrors: {
          pseudo_name: 'Pseudo-name must be at least 3 characters.',
        },
        pseudoNameDraft: trimmed,
      });
      return;
    }
    if (trimmed.length > 50) {
      this.store.patch({
        authFieldErrors: {
          pseudo_name: 'Pseudo-name must be 50 characters or fewer.',
        },
        pseudoNameDraft: trimmed,
      });
      return;
    }
    if (!hasStoredAuthTokens()) {
      this.store.patch({
        authFieldErrors: {
          _form: 'Your session expired. Please log in to continue.',
        },
      });
      this.showLogin();
      return;
    }

    const interests = this.store.get().selectedInterests;
    this.store.patch({
      authLoading: true,
      authFieldErrors: {},
      pseudoNameDraft: trimmed,
    });

    try {
      const user = await updateCurrentUser({
        pseudo_name: trimmed,
        interests: interests.length > 0 ? interests : null,
      });
      const refreshed = await this.refreshProfileQuietly(user);
      this.store.patch({
        authLoading: false,
        authUser: refreshed,
        pseudoNameDraft: refreshed.pseudo_name?.trim() || trimmed,
        selectedInterests: refreshed.interests?.length
          ? [...refreshed.interests]
          : interests,
        authFieldErrors: {},
        profileView: 'settings',
      });
      this.showToast('Profile updated.');
    } catch (error) {
      this.handleAuthFailure(error, 'Could not update your profile. Please try again.');
    }
  }

  openAboutSettings(): void {
    this.store.patch({
      activeTab: 'profile',
      profileView: 'about',
      settingsConfirm: null,
    });
  }

  openPrivacySettings(): void {
    this.store.patch({
      activeTab: 'profile',
      profileView: 'privacy',
      settingsConfirm: null,
    });
  }

  openTermsSettings(): void {
    this.store.patch({
      activeTab: 'profile',
      profileView: 'settings',
      settingsConfirm: null,
      legalWebView: 'terms',
    });
  }

  closeSecondarySettings(): void {
    this.store.patch({
      profileView: 'settings',
      settingsConfirm: null,
      legalWebView: null,
    });
  }

  dismissLegalWebView(): void {
    this.store.patch({ legalWebView: null });
  }

  requestLogoutConfirm(): void {
    this.store.patch({ settingsConfirm: 'logout' });
  }

  requestDeleteAccountConfirm(): void {
    this.store.patch({ settingsConfirm: 'delete-account' });
  }

  dismissSettingsConfirm(): void {
    if (this.store.get().authLoading) return;
    this.store.patch({ settingsConfirm: null });
  }

  async setMapLanguage(code: string): Promise<void> {
    if (!this.mapData) return;
    const trimmed = code.trim();
    if (!trimmed) return;
    if (this.store.get().mapLanguageCode === trimmed) {
      this.store.patch({ profileView: 'settings' });
      return;
    }

    this.store.patch({ mapLanguageChanging: true });
    try {
      await this.mapData.changeLanguage(trimmed);
      savePreferredMapLanguage(trimmed);
      this.store.patch({ profileView: 'settings' });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not change map language.';
      this.showToast(message);
      appWarn('Map', 'Language change failed', error);
    } finally {
      this.store.patch({ mapLanguageChanging: false });
    }
  }

  toggleNotifications(): void {
    const enabled = !this.store.get().notificationsEnabled;
    patchAppPreferences({ notificationsEnabled: enabled });
    this.store.patch({ notificationsEnabled: enabled });
    if (enabled) {
      void this.bootstrapPersonalNotifications();
    } else {
      this.disconnectPersonalNotifications();
    }
  }

  openNotifications(): void {
    this.store.patch({
      activeTab: 'social',
      notificationsOpen: true,
      notificationDetail: null,
      notificationDetailError: null,
      notificationDetailLoading: false,
    });
    void this.refreshNotificationsInbox();
  }

  closeNotifications(): void {
    this.store.patch({
      notificationsOpen: false,
      notificationDetail: null,
      notificationDetailError: null,
      notificationDetailLoading: false,
    });
  }

  closeNotificationDetail(): void {
    this.store.patch({
      notificationDetail: null,
      notificationDetailError: null,
      notificationDetailLoading: false,
    });
  }

  async openNotificationDetail(notificationId: string): Promise<void> {
    const id = Number(notificationId);
    if (!Number.isFinite(id)) return;

    const cached =
      this.store.get().notifications.find((item) => item.id === id) ?? null;
    this.store.patch({
      activeTab: 'social',
      notificationsOpen: true,
      notificationDetail: cached,
      notificationDetailLoading: true,
      notificationDetailError: null,
    });

    if (cached && !cached.isRead) {
      void this.markNotificationAsRead(String(id));
    }

    try {
      const remote = await getNotification(id);
      const mapped = mapNotificationToItem(remote);
      const latest = this.store.get();
      this.store.patch({
        notificationDetail: mapped,
        notificationDetailLoading: false,
        notificationDetailError: null,
        notifications: latest.notifications.some((item) => item.id === id)
          ? latest.notifications.map((item) => (item.id === id ? mapped : item))
          : latest.notifications,
      });
      if (!mapped.isRead) {
        void this.markNotificationAsRead(String(id));
      }
    } catch (error) {
      this.store.patch({
        notificationDetailLoading: false,
        notificationDetailError:
          error instanceof Error
            ? error.message
            : 'Could not load this notification.',
      });
      appWarn('Notifications', 'Could not load notification detail', error);
    }
  }

  async refreshNotificationsInbox(): Promise<void> {
    if (!hasStoredAuthTokens()) return;
    if (this.store.get().notificationsLoading) return;

    this.store.patch({ notificationsLoading: true });
    try {
      const page = await loadInitialNotifications();
      const notifications = page.results.map(mapNotificationToItem);
      let unread = countUnread(page.results);
      try {
        unread = await fetchUnreadNotificationCount();
      } catch (error) {
        appWarn('Notifications', 'unread_count failed; using list count', error);
      }
      this.store.patch({
        notifications,
        notificationsNext: page.next,
        notificationsUnreadCount: unread,
        notificationsLoading: false,
      });
    } catch (error) {
      this.store.patch({ notificationsLoading: false });
      appWarn('Notifications', 'Could not load notification inbox', error);
      this.showToast('Could not load notifications.');
    }
  }

  async loadMoreNotifications(): Promise<void> {
    const state = this.store.get();
    if (!state.notificationsNext || state.notificationsLoading) return;
    if (!hasStoredAuthTokens()) return;

    const nextUrl = state.notificationsNext;
    const pageMatch = /[?&]page=(\d+)/.exec(nextUrl);
    const page = pageMatch ? Number(pageMatch[1]) : 2;
    if (!Number.isFinite(page) || page < 2) return;

    this.store.patch({ notificationsLoading: true });
    try {
      const response = await listNotifications(page);
      const existingIds = new Set(state.notifications.map((item) => item.id));
      const appended = response.results
        .map(mapNotificationToItem)
        .filter((item) => !existingIds.has(item.id));
      const mergedDomain = [
        ...state.notifications.map(notificationItemToDomain),
        ...response.results,
      ];
      this.store.patch({
        notifications: [...state.notifications, ...appended],
        notificationsNext: response.next,
        notificationsUnreadCount: countUnread(mergedDomain),
        notificationsLoading: false,
      });
    } catch (error) {
      this.store.patch({ notificationsLoading: false });
      appWarn('Notifications', 'Could not load more notifications', error);
      this.showToast('Could not load more notifications.');
    }
  }

  async markNotificationAsRead(notificationId: string): Promise<void> {
    const id = Number(notificationId);
    if (!Number.isFinite(id)) return;

    const state = this.store.get();
    const current = state.notifications.find((item) => item.id === id);
    if (!current || current.isRead) return;

    this.store.patch({
      notifications: state.notifications.map((item) =>
        item.id === id ? { ...item, isRead: true } : item,
      ),
      notificationsUnreadCount: Math.max(0, state.notificationsUnreadCount - 1),
    });

    try {
      const updated = await markNotificationRead(id);
      if (updated) {
        const mapped = mapNotificationToItem(updated);
        const latest = this.store.get();
        this.store.patch({
          notifications: latest.notifications.map((item) =>
            item.id === id ? mapped : item,
          ),
        });
      }
    } catch (error) {
      const latest = this.store.get();
      this.store.patch({
        notifications: latest.notifications.map((item) =>
          item.id === id ? { ...item, isRead: false } : item,
        ),
        notificationsUnreadCount: latest.notificationsUnreadCount + 1,
      });
      appWarn('Notifications', 'Mark read failed', error);
      this.showToast('Could not mark notification as read.');
    }
  }

  async markAllNotificationsAsRead(): Promise<void> {
    if (!hasStoredAuthTokens()) return;
    const state = this.store.get();
    if (state.notificationsUnreadCount <= 0 || state.notificationsMarkingAll) {
      return;
    }

    const previous = state.notifications;
    const previousUnread = state.notificationsUnreadCount;
    this.store.patch({
      notificationsMarkingAll: true,
      notifications: previous.map((item) => ({ ...item, isRead: true })),
      notificationsUnreadCount: 0,
    });

    try {
      await markAllNotificationsRead();
      this.store.patch({ notificationsMarkingAll: false });
    } catch (error) {
      this.store.patch({
        notificationsMarkingAll: false,
        notifications: previous,
        notificationsUnreadCount: previousUnread,
      });
      appWarn('Notifications', 'Mark all read failed', error);
      this.showToast('Could not mark all notifications as read.');
    }
  }

  toggleSimulation(): void {
    const enabled = !this.store.get().simulationEnabled;
    const wasNavigating =
      this.store.get().routeSimulating || this.liveRouteTracking;
    const progressMeters = this.store.get().routeTraveledMeters;

    patchAppPreferences({ simulationEnabled: enabled });
    this.store.patch({ simulationEnabled: enabled });

    const path = this.store.get().route?.pathCoordinates;
    if (!path?.length) {
      if (!enabled) {
        this.liveRouteTracking = false;
      }
      return;
    }

    this.applyNavigationPositionMode({
      path,
      resumeNavigating: wasNavigating,
      alongPathMeters: progressMeters,
    });
  }

  completeOnboarding(options?: { homeExperience?: HomeExperience }): void {
    const state = this.store.get();
    const homeExperience =
      options?.homeExperience ??
      this.resolveHomeExperience(state.selectedVenueId);
    if (state.selectedVenueId) {
      venueVisitRepository.markVisited(state.selectedVenueId);
    }
    markDeviceHasUsedApp();
    saveReturningSession({
      onboardingComplete: true,
      mode: state.authUser ? 'auth' : 'guest',
      selectedVenueId: state.selectedVenueId,
      selectedGateId: state.selectedGateId,
      guestId: state.guestId,
    });
    this.store.patch({
      onboardingComplete: true,
      authStep: 'none',
      authStepBeforeLocation: null,
      locationGateLoading: false,
      locationGateError: null,
      activeTab: 'map',
      navigateView: 'home',
      homeExperience,
      homeVenueSearchQuery: '',
    });
    void this.loadReturningHomeContent();
    this.maybeStartProductTour();
  }

  /** Replay the coach-mark tour from Settings. */
  startProductTour(): void {
    this.beginProductTour({ replay: true });
  }

  advanceProductTour(): void {
    const state = this.store.get();
    if (state.productTourStepIndex == null) return;
    const steps = stepsForHomeExperience(state.homeExperience);
    const next = nextProductTourIndex(state.productTourStepIndex, steps.length);
    if (next === 'complete') {
      this.finishProductTour();
      return;
    }
    this.applyProductTourIndex(next);
  }

  backProductTour(): void {
    const state = this.store.get();
    if (state.productTourStepIndex == null) return;
    this.applyProductTourIndex(
      previousProductTourIndex(state.productTourStepIndex),
    );
  }

  skipProductTour(): void {
    this.finishProductTour();
  }

  private maybeStartProductTour(): void {
    const state = this.store.get();
    if (
      !shouldAutoStartProductTour({
        onboardingComplete: state.onboardingComplete,
        tourCompleted: state.productTourCompleted,
        tourActive: state.productTourStepIndex != null,
      })
    ) {
      return;
    }
    this.beginProductTour({ replay: false });
  }

  private beginProductTour(options: { replay: boolean }): void {
    const state = this.store.get();
    if (!state.onboardingComplete) return;
    if (!options.replay && state.productTourCompleted) return;
    const steps = stepsForHomeExperience(state.homeExperience);
    if (!steps.length) return;
    this.applyProductTourIndex(0);
  }

  private finishProductTour(): void {
    markProductTourCompleted();
    this.store.patch({
      productTourStepIndex: null,
      productTourCompleted: true,
      activeTab: 'map',
      navigateView: 'home',
      profileView: 'main',
      settingsConfirm: null,
      notificationsOpen: false,
      postCommentsOpen: false,
    });
  }

  private applyProductTourIndex(index: number): void {
    const state = this.store.get();
    const steps = stepsForHomeExperience(state.homeExperience);
    const step = steps[index];
    if (!step) {
      this.finishProductTour();
      return;
    }
    this.store.patch({
      ...this.productTourSurfacePatch(step.surface),
      productTourStepIndex: index,
    });
  }

  private productTourSurfacePatch(
    surface: ProductTourSurface,
  ): Partial<AppState> {
    const common: Partial<AppState> = {
      profileView: 'main',
      settingsConfirm: null,
      notificationsOpen: false,
      postCommentsOpen: false,
      locationActionPrompt: null,
      arrivalDialogOpen: false,
      guestArGatePrompt: null,
      arRoutePromptOpen: false,
    };
    switch (surface) {
      case 'home':
        return { ...common, activeTab: 'map', navigateView: 'home' };
      case 'map':
        return {
          ...common,
          activeTab: 'map',
          navigateView: 'map',
          showRouteSheet: false,
        };
      case 'social':
        return { ...common, activeTab: 'social' };
      case 'profile':
        return { ...common, activeTab: 'profile' };
    }
  }

  /**
   * First enter of a venue → first-visit dashboard; later visits → returning home.
   */
  private resolveHomeExperience(venueId: string | null): HomeExperience {
    return resolveHomeExperience(
      venueId,
      venueId ? venueVisitRepository.hasVisited(venueId) : false,
    );
  }

  /** Discover / See all posts from the first-visit venue home. */
  openVenueDiscover(): void {
    this.store.patch({
      activeTab: 'social',
      notificationsOpen: false,
      profileView: 'main',
      settingsConfirm: null,
    });
  }

  /** Try AR from the first-visit venue home. */
  async openVenueArFromHome(): Promise<void> {
    if (isGuestMode()) {
      this.store.patch({ guestArGateLoading: true });
      try {
        const eligibility = await resolveGuestArEligibility();
        this.store.patch({
          guestHasTriedArView: eligibility.preferences.hasTriedArView,
          guestHasTried2dView: eligibility.preferences.hasTried2dView,
          guestArGateLoading: false,
        });
        if (!eligibility.allowed) {
          this.store.patch({ guestArGatePrompt: 'already-used' });
          return;
        }
      } catch (error) {
        this.store.patch({ guestArGateLoading: false });
        appWarn('Guest', 'Could not resolve AR eligibility from home', error);
      }
    }

    if (this.store.get().route) {
      this.store.patch({ arRoutePromptOpen: false });
      this.openNavigateMap();
      await this.openAr();
      return;
    }

    // Stay on venue home - dialog explains start/end, then user opens the map.
    this.store.patch({ arRoutePromptOpen: true });
  }

  dismissArRoutePrompt(): void {
    this.store.patch({ arRoutePromptOpen: false });
  }

  /** Confirm Try AR dialog → map with search ready for start/end. */
  confirmArRoutePrompt(): void {
    this.pendingMapSearchFocus = true;
    this.store.patch({
      arRoutePromptOpen: false,
      activeTab: 'map',
      navigateView: 'map',
      homeVenueSearchQuery: '',
      searchQuery: '',
      searchResults: [],
      categoryFilter: null,
      isSearching: false,
      arRouteSetupActive: true,
    });
    void this.consumeGuest2dMapTrial();
  }

  /** Whether the map search field should be focused after render. */
  shouldFocusMapSearch(): boolean {
    return this.pendingMapSearchFocus;
  }

  /** Called by UI after focusing the map search field. */
  consumeMapSearchFocus(): void {
    this.pendingMapSearchFocus = false;
  }

  /** After auth + venue setup, gate the main app on geolocation. */
  beginLocationPermissionGate(): void {
    const state = this.store.get();
    const underlyingStep = isLocationGateAuthStep(state.authStep)
      ? state.authStepBeforeLocation ?? 'none'
      : state.authStep;

    // Never mount the location dialog over the welcome "Find places" screen.
    if (underlyingStep === 'none') {
      void this.continueAfterLocationGranted();
      return;
    }

    this.store.patch({
      onboardingComplete: false,
      authStep: 'location-permission',
      authStepBeforeLocation: underlyingStep,
      authLoading: false,
      locationGateLoading: false,
      locationPermanentlyDenied: false,
      locationGateError: null,
    });
  }

  showArTeaser(): void {
    this.store.patch({
      authStep: 'ar-teaser',
      authFieldErrors: {},
      authLegalDocument: null,
      legalWebView: null,
    });
  }

  showIntroduction(): void {
    this.store.patch({
      authStep: 'introduction',
      authFieldErrors: {},
      authLegalDocument: null,
      legalWebView: null,
    });
  }

  showFeatures(): void {
    this.store.patch({
      authStep: 'features',
      authFieldErrors: {},
      authLegalDocument: null,
      legalWebView: null,
    });
  }

  showPseudoNameSetup(): void {
    const state = this.store.get();
    if (state.onboardingComplete) return;
    const existingName =
      state.authUser?.pseudo_name?.trim() ||
      state.pseudoNameDraft.trim() ||
      '';
    const existingInterests = state.authUser?.interests?.length
      ? [...state.authUser.interests]
      : state.selectedInterests;
    this.store.patch({
      authStep: 'pseudo-name',
      authStepBeforeLocation: null,
      locationGateLoading: false,
      onboardingComplete: false,
      authFieldErrors: {},
      pseudoNameDraft: existingName,
      pseudoNameHint: state.pseudoNameHint || generatePseudoName(),
      selectedInterests: existingInterests,
    });
  }

  dismissPseudoNameSetup(): void {
    // Authenticated users must finish pseudo-name; send them to login instead of verify.
    if (hasStoredAuthTokens()) {
      return;
    }
    this.store.patch({ authStep: 'login', authFieldErrors: {} });
  }

  shufflePseudoName(): void {
    const state = this.store.get();
    const next = generatePseudoName(
      state.pseudoNameDraft.trim() || state.pseudoNameHint,
    );
    this.store.patch({
      pseudoNameDraft: next,
      pseudoNameHint: next,
      authFieldErrors: {
        ...state.authFieldErrors,
        pseudo_name: '',
      },
    });
  }

  toggleInterest(interest: string): void {
    const selected = this.store.get().selectedInterests;
    const next = selected.includes(interest)
      ? selected.filter((item) => item !== interest)
      : [...selected, interest];
    this.store.patch({ selectedInterests: next });
  }

  async submitPseudoNameSetup(pseudoName: string): Promise<void> {
    const trimmed = pseudoName.trim();
    if (!trimmed) {
      this.store.patch({
        authFieldErrors: { pseudo_name: 'Pick a pseudo-name to continue.' },
        pseudoNameDraft: trimmed,
      });
      return;
    }

    if (trimmed.length < 3) {
      this.store.patch({
        authFieldErrors: {
          pseudo_name: 'Pseudo-name must be at least 3 characters.',
        },
        pseudoNameDraft: trimmed,
      });
      return;
    }

    if (trimmed.length > 50) {
      this.store.patch({
        authFieldErrors: {
          pseudo_name: 'Pseudo-name must be 50 characters or fewer.',
        },
        pseudoNameDraft: trimmed,
      });
      return;
    }

    if (!hasStoredAuthTokens()) {
      this.store.patch({
        authFieldErrors: {
          _form: 'Your session expired. Please log in to continue.',
        },
        authStep: 'login',
        pseudoNameDraft: trimmed,
      });
      return;
    }

    const interests = this.store.get().selectedInterests;

    this.store.patch({
      authLoading: true,
      authFieldErrors: {},
      pseudoNameDraft: trimmed,
    });

    try {
      const user = await updateCurrentUser({
        pseudo_name: trimmed,
        interests: interests.length > 0 ? interests : null,
      });
      const refreshed = await this.refreshProfileQuietly(user);
      this.store.patch({
        authLoading: false,
        authUser: refreshed,
        pseudoNameDraft: refreshed.pseudo_name?.trim() || trimmed,
        selectedInterests: refreshed.interests?.length
          ? [...refreshed.interests]
          : interests,
        authFieldErrors: {},
      });
      this.showVenueSelect();
    } catch (error) {
      this.handleAuthFailure(error, 'Could not save your profile. Please try again.');
    }
  }

  showVenueSelect(): void {
    this.store.patch({
      authStep: 'venue-select',
      authStepBeforeLocation: null,
      locationGateLoading: false,
      onboardingComplete: false,
      authFieldErrors: {},
    });
    void this.loadOnboardingVenues();
  }

  /** Re-open venue picker from settings without clearing the saved preference until submit. */
  openVenueSelectFromSettings(): void {
    const state = this.store.get();
    if (!state.authUser || !hasStoredAuthTokens()) {
      this.showLogin();
      return;
    }
    this.store.patch({
      profileView: 'main',
      activeTab: 'map',
      settingsConfirm: null,
    });
    this.showVenueSelect();
  }

  dismissVenueSelect(): void {
    const state = this.store.get();
    const user = state.authUser;
    const selection = user ? loadVenueSelection(user.id) : null;
    if (user && resolveOnboardingStep(user, selection) === 'home' && selection) {
      this.store.patch({
        selectedVenueId: selection.venueId,
        selectedGateId: selection.sectionId,
        authFieldErrors: {},
      });
      void this.enterSelectedVenue({
        skipLocationGate: true,
        welcomeToast: false,
        homeExperience: 'returning',
      });
      return;
    }
    this.showPseudoNameSetup();
  }

  setVenueSearchQuery(query: string): void {
    this.store.patch({ venueSearchQuery: query });
  }

  selectOnboardingVenue(venueId: string): void {
    this.store.patch({
      selectedVenueId: venueId,
      selectedGateId: null,
      forumSections: [],
      authFieldErrors: {},
    });
    void this.loadOnboardingSections(venueId);
  }

  selectOnboardingGate(gateId: string): void {
    this.store.patch({
      selectedGateId: gateId,
      authFieldErrors: {},
    });
  }

  submitVenueSelect(): void {
    void this.enterSelectedVenue({ skipLocationGate: true });
  }

  private async loadOnboardingVenues(): Promise<void> {
    this.store.patch({ authLoading: true, authFieldErrors: {} });
    try {
      const venues = await listAllVenues();
      const state = this.store.get();
      const existingStillValid = venues.some(
        (venue) => String(venue.id) === state.selectedVenueId,
      );
      const selectedVenueId = existingStillValid
        ? state.selectedVenueId
        : venues[0]
          ? String(venues[0].id)
          : null;

      this.store.patch({
        forumVenues: venues.map((venue) => ({
          id: venue.id,
          name: venue.name,
          location: venue.location,
        })),
        selectedVenueId,
        selectedGateId: existingStillValid ? state.selectedGateId : null,
        forumSections: existingStillValid ? state.forumSections : [],
        authLoading: false,
        authFieldErrors: venues.length
          ? {}
          : { _form: 'No venues are available right now.' },
      });

      if (selectedVenueId) {
        await this.loadOnboardingSections(selectedVenueId);
      }
    } catch (error) {
      this.handleAuthFailure(
        error,
        'Could not load venues. Please try again.',
      );
    }
  }

  private async loadOnboardingSections(venueId: string): Promise<void> {
    const numericId = Number(venueId);
    if (!Number.isFinite(numericId)) return;

    this.store.patch({ authLoading: true, authFieldErrors: {} });
    try {
      const { sections, categories } = await loadVenueCatalog(numericId);
      const state = this.store.get();
      if (state.selectedVenueId !== venueId) return;

      const sectionStillValid = sections.some(
        (section) => String(section.id) === state.selectedGateId,
      );

      this.store.patch({
        forumSections: sections.map((section) => ({
          id: section.id,
          venue: section.venue,
          name: section.name,
          code: section.code,
          is_active: section.is_active,
        })),
        forumCategories: categories.map((category) => ({
          id: category.id,
          name: category.name,
          slug: category.slug,
          description: category.description,
          disclaimer: category.disclaimer,
          order: category.order,
          is_active: category.is_active,
        })),
        selectedGateId: sectionStillValid
          ? state.selectedGateId
          : defaultSectionId(sections),
        authLoading: false,
        authFieldErrors: sections.length
          ? {}
          : { _form: 'This venue has no sections yet.' },
      });
    } catch (error) {
      this.handleAuthFailure(
        error,
        'Could not load sections for this venue.',
      );
    }
  }

  private async enterSelectedVenue(options?: {
    welcomeToast?: boolean;
    /** Location was already granted after create / sign-in / guest. */
    skipLocationGate?: boolean;
    /** Signed-in session restore lands on Recently visited, not first-visit. */
    homeExperience?: HomeExperience;
  }): Promise<void> {
    if (this.venueEnterInFlight) return;

    const state = this.store.get();
    if (!state.selectedVenueId || !state.selectedGateId) {
      this.store.patch({
        authFieldErrors: {
          _form: 'Select a venue and section to continue.',
        },
      });
      return;
    }

    const venueId = Number(state.selectedVenueId);
    if (!Number.isFinite(venueId)) {
      this.store.patch({
        authFieldErrors: { _form: 'Invalid venue selection.' },
      });
      return;
    }

    const selection: VenueSelection = {
      venueId: state.selectedVenueId,
      sectionId: state.selectedGateId,
    };
    let venue = state.forumVenues.find(
      (item) => String(item.id) === state.selectedVenueId,
    );
    let forumVenues = state.forumVenues;

    this.venueEnterInFlight = true;
    this.store.patch({ authLoading: true, authFieldErrors: {} });
    try {
      if (!venue) {
        try {
          const fetched = await getForumVenue(venueId);
          venue = {
            id: fetched.id,
            name: fetched.name,
            location: fetched.location,
          };
          forumVenues = [
            ...state.forumVenues.filter((item) => item.id !== fetched.id),
            venue,
          ];
        } catch (error) {
          appWarn('Venue', 'Could not load venue name', error);
        }
      }

      let sections = state.forumSections;
      let categories = state.forumCategories;
      if (sections.length === 0 || categories.length === 0) {
        const catalog = await loadVenueCatalog(venueId);
        sections = catalog.sections.map((section) => ({
          id: section.id,
          venue: section.venue,
          name: section.name,
          code: section.code,
          is_active: section.is_active,
        }));
        categories = catalog.categories.map((category) => ({
          id: category.id,
          name: category.name,
          slug: category.slug,
          description: category.description,
          disclaimer: category.disclaimer,
          order: category.order,
          is_active: category.is_active,
        }));
      }

      const feed = await loadInitialVenueFeed(venueId);
      const venueFeedPosts = mapForumPostsToVenueFeed(
        feed.results,
        sections,
        categories,
      );
      const upvotedPostIds = venueFeedPosts
        .filter((post) => post.hasUpvoted)
        .map((post) => post.id);

      const user = state.authUser;
      if (user) {
        saveVenueSelection(user.id, selection);
      }

      const refreshedUser = user
        ? await this.refreshProfileQuietly(user)
        : null;

      this.store.patch({
        authUser: refreshedUser ?? user,
        forumVenues,
        forumSections: sections,
        forumCategories: categories,
        selectedVenueId: selection.venueId,
        selectedGateId: selection.sectionId,
        venueFeedPosts,
        forumFeedNext: feed.next,
        forumFeedCount: feed.count,
        upvotedPostIds,
        venueFeedFilter: 'all',
        sectionHeatmap: [],
        sectionHeatmapActive: false,
        venueLiveStatus: 'idle',
        authLoading: false,
        authFieldErrors: {},
      });
      this.connectVenueLiveFeed(venueId);
      void this.bootstrapPersonalNotifications();
      if (options?.welcomeToast !== false) {
        this.showToast(
          venue ? `Welcome to ${venue.name}. You're in.` : 'Welcome to fplaces!',
        );
      }

      // Location dialog only after create / sign-in / guest - not after venue pick.
      if (options?.skipLocationGate || this.store.get().userLocation) {
        this.completeOnboarding({
          homeExperience: options?.homeExperience,
        });
      } else {
        this.beginLocationPermissionGate();
      }
    } catch (error) {
      this.handleAuthFailure(
        error,
        'Could not load the venue feed. Please try again.',
      );
    } finally {
      this.venueEnterInFlight = false;
    }
  }

  private connectVenueLiveFeed(venueId: number): void {
    this.disconnectVenueLiveFeed();
    this.store.patch({ venueLiveStatus: 'connecting' });
    this.venueLiveSubscription = subscribeVenueLiveFeed(
      venueId,
      (event) => {
        this.applyVenueLiveEvent(event);
      },
      (status) => {
        this.store.patch({ venueLiveStatus: status });
      },
    );
  }

  private disconnectVenueLiveFeed(): void {
    this.venueLiveSubscription?.disconnect();
    this.venueLiveSubscription = null;
    this.store.patch({ venueLiveStatus: 'idle' });
  }

  private async bootstrapPersonalNotifications(): Promise<void> {
    if (!hasStoredAuthTokens()) return;
    if (!this.store.get().notificationsEnabled) return;
    if (this.personalNotificationsBootstrapInFlight) return;

    this.personalNotificationsBootstrapInFlight = true;
    try {
      const page = await loadInitialNotifications();
      const notifications = page.results.map(mapNotificationToItem);
      this.store.patch({
        notifications,
        notificationsNext: page.next,
        notificationsUnreadCount: countUnread(page.results),
      });
      this.connectPersonalNotifications();
    } catch (error) {
      appWarn('Notifications', 'Initial inbox fetch failed', error);
      // Still open the socket so live badge updates can arrive.
      this.connectPersonalNotifications();
    } finally {
      this.personalNotificationsBootstrapInFlight = false;
    }
  }

  private connectPersonalNotifications(): void {
    if (this.personalNotificationsSubscription) return;
    if (!hasStoredAuthTokens()) return;
    if (!this.store.get().notificationsEnabled) return;

    this.personalNotificationsSubscription = subscribePersonalNotifications(
      (event) => {
        this.applyPersonalNotificationEvent(event);
      },
    );
    appLog('NotificationsWS', 'Connected to personal notifications room');
  }

  private disconnectPersonalNotifications(): void {
    this.personalNotificationsSubscription?.disconnect();
    this.personalNotificationsSubscription = null;
  }

  private applyPersonalNotificationEvent(
    event: PersonalNotificationEvent,
  ): void {
    if (!this.store.get().notificationsEnabled) return;
    if (event.type !== 'new_notification') return;

    const mapped = mapNotificationToItem(event.notification);
    const state = this.store.get();
    if (state.notifications.some((item) => item.id === mapped.id)) return;

    this.store.patch({
      notifications: [mapped, ...state.notifications],
      notificationsUnreadCount: mapped.isRead
        ? state.notificationsUnreadCount
        : state.notificationsUnreadCount + 1,
    });
  }

  private applyVenueLiveEvent(event: VenueLiveEvent): void {
    switch (event.type) {
      case 'new_post': {
        this.mergeForumPostIntoFeed(event.post);
        return;
      }
      case 'upvote_update': {
        const state = this.store.get();
        const postId = String(event.update.postId);
        const upvoted = event.update.upvoted;
        const venueFeedPosts = state.venueFeedPosts.map((post) =>
          post.id === postId
            ? {
                ...post,
                upvotes: event.update.upvotesCount,
                ...(typeof upvoted === 'boolean'
                  ? { hasUpvoted: upvoted }
                  : {}),
              }
            : post,
        );
        let upvotedPostIds = state.upvotedPostIds;
        if (typeof upvoted === 'boolean') {
          upvotedPostIds = upvoted
            ? [...new Set([...state.upvotedPostIds, postId])]
            : state.upvotedPostIds.filter((id) => id !== postId);
        }
        this.store.patch({ venueFeedPosts, upvotedPostIds });
        return;
      }
      case 'post_hidden': {
        this.removeVenueFeedPost(String(event.postId));
        return;
      }
      case 'section_heat_update': {
        this.store.patch({
          sectionHeatmap: event.heatmap.map((entry) => ({
            sectionId: entry.sectionId,
            postCount: entry.postCount,
            priority: entry.priority,
          })),
          sectionHeatmapActive: true,
        });
        return;
      }
      default:
        return;
    }
  }

  private async bootstrapAuthFlow(): Promise<void> {
    if (this.authFlowBootstrapped) return;
    this.authFlowBootstrapped = true;

    // Password-reset email deep links (uid + token → confirm screen) must win
    // over guest/auth routing so /api/users/password-reset-confirm/ can complete.
    if (this.tryOpenPasswordResetFromUrl()) {
      return;
    }

    // Expired session during splash → open sign-in once the map is ready.
    if (this.pendingSignInAfterSessionExpiry) {
      this.pendingSignInAfterSessionExpiry = false;
      this.resetAuthState({
        showLogin: true,
        formError: 'Your session expired. Please log in again.',
        toast: 'Session expired. Please log in again.',
      });
      return;
    }

    // Fingerprint + guest validation before deciding welcome vs create-account.
    // Registered users with JWTs still get fingerprinted for future association,
    // but are not blocked by guest limits.
    this.store.patch({ authLoading: true, authFieldErrors: {} });
    const guestGatePassed = await this.resolveGuestFingerprintGate();
    if (!guestGatePassed) {
      return;
    }

    const returning =
      loadReturningSession() ?? this.inferReturningSessionFromLocalAuth();
    const destination = resolveStartupDestination({
      hasReturningSession: isReturningSession(returning),
      hasAuthTokens: hasStoredAuthTokens(),
      deviceHasUsedApp: hasDeviceUsedApp() || Boolean(loadStoredUser()),
    });

    if (destination === 'app' && isReturningSession(returning)) {
      // Skip welcome/marketing - restore home for auth or guest returners.
      await this.restoreReturningSession(returning);
      return;
    }

    if (destination === 'app' && hasStoredAuthTokens()) {
      // Keep marketing UI hidden while profile restore runs.
      this.store.patch({ authLoading: true, authFieldErrors: {} });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          void this.resumeAuthSession();
        });
      });
      return;
    }

    if (destination === 'sign-in') {
      markDeviceHasUsedApp();
      this.store.patch({
        authLoading: false,
        authFieldErrors: {},
        authLegalDocument: null,
        legalWebView: null,
      });
      this.showLogin();
      return;
    }

    // Brand-new device - Find places / marketing onboarding.
    this.store.patch({
      authStep: 'none',
      authLoading: false,
      authFieldErrors: {},
    });
  }

  /**
   * Auth users who finished venue setup before returning-session persistence
   * still count as returners (tokens + profile + venue preference).
   */
  private inferReturningSessionFromLocalAuth(): ReturningSessionSnapshot | null {
    if (!hasStoredAuthTokens()) return null;
    const user = loadStoredUser();
    if (!user) return null;
    const selection = loadVenueSelection(user.id);
    if (!selection || resolveOnboardingStep(user, selection) !== 'home') {
      return null;
    }
    return {
      onboardingComplete: true,
      mode: 'auth',
      selectedVenueId: selection.venueId,
      selectedGateId: selection.sectionId,
      guestId: null,
    };
  }

  /**
   * Reload a previously completed onboarding session without showing welcome.
   * Auth users refresh profile + venue feed; guests re-enter their last venue.
   */
  private async restoreReturningSession(
    snapshot: ReturningSessionSnapshot,
  ): Promise<void> {
    let venueId = snapshot.selectedVenueId;
    let gateId = snapshot.selectedGateId;
    const storedUser = loadStoredUser();
    if (storedUser) {
      const preference = loadVenueSelection(storedUser.id);
      if (preference) {
        venueId = preference.venueId;
        gateId = preference.sectionId;
      }
    }

    if (venueId) {
      venueVisitRepository.markVisited(venueId);
    }

    this.store.patch({
      selectedVenueId: venueId,
      selectedGateId: gateId,
      guestId: snapshot.guestId ?? this.store.get().guestId,
      authStep: 'none',
      authStepBeforeLocation: null,
      authLoading: true,
      authFieldErrors: {},
      navigateView: 'home',
      homeExperience: 'returning',
    });

    if (hasStoredAuthTokens()) {
      try {
        const user = await fetchCurrentUser();
        this.persistSessionUser(user);
        this.store.patch({
          authUser: user,
          authEmail: user.email,
          selectedInterests: user.interests?.length
            ? [...user.interests]
            : this.store.get().selectedInterests,
        });

        const selection =
          loadVenueSelection(user.id) ??
          (venueId && gateId
            ? { venueId, sectionId: gateId }
            : null);
        const step = resolveOnboardingStep(user, selection);
        if (step !== 'home' || !selection) {
          this.store.patch({ authLoading: false, onboardingComplete: false });
          await this.continueAfterLocationGranted();
          return;
        }

        this.store.patch({
          selectedVenueId: selection.venueId,
          selectedGateId: selection.sectionId,
        });
        await this.enterSelectedVenue({
          skipLocationGate: true,
          welcomeToast: false,
          homeExperience: 'returning',
        });
        return;
      } catch (error) {
        clearStoredAuthTokens();
        clearStoredAuthUser();
        this.store.patch({ authUser: null });
        appWarn('Auth', 'Returning session tokens expired', error);

        if (snapshot.mode !== 'guest' || !venueId || !gateId) {
          clearReturningSession();
          this.store.patch({
            authLoading: false,
            onboardingComplete: false,
            selectedVenueId: null,
            selectedGateId: null,
          });
          this.showLogin();
          this.showToast('Session expired. Please log in again.');
          return;
        }
        // Guest-mode snapshot can still restore after JWT wipe.
      }
    }

    if (this.store.get().guestAccessAllowed === false) {
      clearReturningSession();
      this.redirectToCreateAccountForGuestDenial(
        this.store.get().guestAccessReason ?? 'Guest limit reached',
      );
      return;
    }

    if (venueId && gateId) {
      this.store.patch({
        selectedVenueId: venueId,
        selectedGateId: gateId,
        authLoading: true,
      });
      await this.enterSelectedVenue({
        skipLocationGate: true,
        welcomeToast: false,
        homeExperience: 'returning',
      });
      return;
    }

    this.store.patch({ authLoading: false, onboardingComplete: false });
    this.showVenueSelect();
  }

  /**
   * Generate the browser fingerprint and obtain/refresh a guest JWT via
   * POST /api/users/guest/. Returns false when the trial is exhausted and the
   * user was redirected to create account / sign-in.
   */
  private async resolveGuestFingerprintGate(): Promise<boolean> {
    try {
      const result = await validateCurrentGuestAccess();
      this.store.patch({
        visitorId: result.visitorId,
        guestId: result.guestId ?? null,
        guestAccessAllowed: result.allowed,
        guestAccessReason: result.reason,
        guestTrialExpiresAt: result.session?.trialExpiresAt ?? null,
        guestHasTriedArView: result.session?.hasTriedArView === true,
        guestHasTried2dView: result.session?.hasTried2dView === true,
      });
      appLog('Guest', 'Guest session validated', {
        visitorId: result.visitorId,
        allowed: result.allowed,
        guestId: result.guestId,
        reason: result.reason,
        trialExpiresAt: result.session?.trialExpiresAt,
      });

      // Authenticated sessions bypass the guest denial redirect.
      if (!result.allowed && !hasStoredAuthTokens()) {
        if (hasDeviceUsedApp() || Boolean(loadStoredUser())) {
          markDeviceHasUsedApp();
          this.store.patch({
            authLoading: false,
            guestAccessAllowed: false,
            guestAccessReason: result.reason,
          });
          this.showLogin();
          this.showToast(guestDenialUserMessage(result.reason));
          return false;
        }
        this.redirectToCreateAccountForGuestDenial(
          result.reason ?? 'Guest trial expired',
        );
        return false;
      }

      return true;
    } catch (error) {
      // Fail open for anonymous users so a guest-API outage does not brick onboarding.
      appWarn('Guest', 'Guest token validation failed; continuing', error);
      this.store.patch({
        visitorId: null,
        guestId: null,
        guestAccessAllowed: null,
        guestAccessReason: null,
        guestTrialExpiresAt: null,
        guestHasTriedArView: false,
        guestHasTried2dView: false,
        guestArGatePrompt: null,
        guestArGateLoading: false,
      });
      return true;
    }
  }

  private redirectToCreateAccountForGuestDenial(reason: string): void {
    this.store.patch({
      authStep: 'create',
      authLoading: false,
      authFieldErrors: {},
      guestAccessAllowed: false,
      guestAccessReason: reason,
    });
    this.showToast(guestDenialUserMessage(reason));
  }

  private async resumeAuthSession(): Promise<void> {
    if (this.authResumeInFlight) return;

    const state = this.store.get();
    if (state.mapStatus !== 'ready' || state.onboardingComplete) {
      return;
    }

    if (!hasStoredAuthTokens()) {
      // Stay on welcome/onboarding when there is no stored session.
      return;
    }

    // Only auto-route from the idle gate; leave in-progress auth forms alone.
    if (state.authStep !== 'none') {
      return;
    }

    this.authResumeInFlight = true;
    this.store.patch({ authLoading: true, authFieldErrors: {} });
    try {
      const user = await fetchCurrentUser();
      this.persistSessionUser(user);
      this.store.patch({
        authUser: user,
        authEmail: user.email,
        selectedInterests: user.interests?.length
          ? [...user.interests]
          : state.selectedInterests,
      });
      await this.continueAfterAuthenticated(user, {
        welcomeToast: false,
        promptLocation: false,
      });
    } catch (error) {
      clearStoredAuthTokens();
      clearStoredAuthUser();
      markDeviceHasUsedApp();
      this.store.patch({
        authLoading: false,
        authUser: null,
        authFieldErrors: {},
      });
      appWarn('Auth', 'Stored session expired', error);
      this.showLogin();
      this.showToast('Session expired. Please log in again.');
    } finally {
      this.authResumeInFlight = false;
    }
  }

  showCreateAccount(): void {
    this.store.patch({ authStep: 'create', authFieldErrors: {} });
  }

  /**
   * Skip account creation and continue anonymously when the guest fingerprint
   * gate allows it. Location dialog is shown next; venue select comes after.
   */
  async continueAsGuest(): Promise<void> {
    const state = this.store.get();
    if (state.guestAccessAllowed === false) {
      this.showToast(guestDenialUserMessage(state.guestAccessReason));
      return;
    }

    markDeviceHasUsedApp();
    this.store.patch({ authLoading: true, authFieldErrors: {} });
    try {
      const result = await registerCurrentGuestFingerprint();
      this.store.patch({
        visitorId: result.visitorId,
        guestId: result.guestId ?? null,
        guestAccessAllowed: result.allowed,
        guestAccessReason: result.reason ?? null,
        guestTrialExpiresAt: result.session?.trialExpiresAt ?? null,
        guestHasTriedArView: result.session?.hasTriedArView === true,
        guestHasTried2dView: result.session?.hasTried2dView === true,
      });

      if (!result.allowed) {
        this.redirectToCreateAccountForGuestDenial(
          result.reason ?? 'Guest trial expired',
        );
        return;
      }

      this.store.patch({
        authLoading: false,
        authFieldErrors: {},
        authLegalDocument: null,
        legalWebView: null,
      });
      // Stay on create-account underneath; location dialog opens next.
      this.beginLocationPermissionGate();
    } catch (error) {
      appWarn('Guest', 'Continue as guest failed', error);
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Could not continue as guest. Please try again.';
      this.store.patch({
        authLoading: false,
        authFieldErrors: {
          _form: message,
        },
      });
    }
  }

  dismissCreateAccount(): void {
    // Guests denied by fingerprint must stay on account creation / sign-in.
    if (this.store.get().guestAccessAllowed === false) {
      this.store.patch({
        authStep: 'create',
        authFieldErrors: {},
        authLegalDocument: null,
        legalWebView: null,
      });
      return;
    }

    this.store.patch({
      authStep: 'none',
      authFieldErrors: {},
      authLegalDocument: null,
      legalWebView: null,
    });
  }

  showLogin(): void {
    markDeviceHasUsedApp();
    this.store.patch({
      authStep: 'login',
      checkEmailPurpose: null,
      authFieldErrors: {},
      authLegalDocument: null,
      legalWebView: null,
    });
  }

  dismissLogin(): void {
    this.store.patch({
      authStep: 'none',
      authFieldErrors: {},
      authLegalDocument: null,
      legalWebView: null,
    });
  }

  showForgotPassword(): void {
    this.store.patch({
      authStep: 'forgot-password',
      authFieldErrors: {},
      authLegalDocument: null,
      legalWebView: null,
    });
  }

  dismissForgotPassword(): void {
    this.store.patch({
      authStep: 'login',
      authFieldErrors: {},
      authLegalDocument: null,
      legalWebView: null,
    });
  }

  /** Opens the reset-confirm screen when the email deep link is present. */
  tryOpenPasswordResetFromUrl(): boolean {
    const params = consumePasswordResetLink();
    if (!params) return false;

    markDeviceHasUsedApp();
    this.pendingSignInAfterSessionExpiry = false;
    this.store.patch({
      onboardingComplete: false,
      authStep: 'reset-password-confirm',
      authStepBeforeLocation: null,
      passwordResetUid: params.uid,
      passwordResetToken: params.token,
      checkEmailPurpose: null,
      authLoading: false,
      authFieldErrors: {},
      authLegalDocument: null,
      legalWebView: null,
    });
    return true;
  }

  showResetPasswordConfirm(uid: string, token: string): void {
    this.store.patch({
      authStep: 'reset-password-confirm',
      passwordResetUid: uid,
      passwordResetToken: token,
      authFieldErrors: {},
      authLegalDocument: null,
      legalWebView: null,
    });
  }

  dismissResetPasswordConfirm(): void {
    this.store.patch({
      authStep: 'login',
      passwordResetUid: '',
      passwordResetToken: '',
      authFieldErrors: {},
      authLegalDocument: null,
      legalWebView: null,
    });
  }

  async submitResetPasswordConfirm(newPassword: string): Promise<void> {
    const state = this.store.get();
    const uid = state.passwordResetUid.trim();
    const token = state.passwordResetToken.trim();
    const fieldErrors: Record<string, string> = {};

    if (!uid || !token) {
      fieldErrors._form =
        'This reset link is invalid or expired. Request a new one.';
    }
    if (!newPassword) {
      fieldErrors.new_password = 'New password is required.';
    } else if (evaluatePasswordStrength(newPassword) !== 'strong') {
      fieldErrors.new_password =
        'Use at least 8 characters with a letter and a number.';
    }

    if (Object.keys(fieldErrors).length > 0) {
      this.store.patch({ authFieldErrors: fieldErrors });
      return;
    }

    this.store.patch({ authLoading: true, authFieldErrors: {} });
    try {
      const message = await confirmPasswordReset({
        uid,
        token,
        new_password: newPassword,
      });
      this.store.patch({
        authLoading: false,
        authFieldErrors: {},
        authStep: 'login',
        checkEmailPurpose: null,
        passwordResetUid: '',
        passwordResetToken: '',
      });
      this.showToast(message || 'Password updated. You can log in now.');
    } catch (error) {
      this.handleAuthFailure(
        error,
        'Could not reset your password. The link may have expired.',
      );
    }
  }

  async submitForgotPassword(email: string): Promise<void> {
    const fieldErrors: Record<string, string> = {};
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      fieldErrors.email = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      fieldErrors.email = 'Enter a valid email address.';
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
      const message = await requestPasswordReset(trimmedEmail);
      this.store.patch({
        authLoading: false,
        authFieldErrors: {},
        authEmail: trimmedEmail,
        authStep: 'check-email',
        checkEmailPurpose: 'password-reset',
      });
      this.showToast(message || 'Reset link sent. Check your email.');
    } catch (error) {
      this.handleAuthFailure(
        error,
        error instanceof TypeError
          ? 'Cannot reach the password reset service. Try again.'
          : 'Could not send a reset link. Please try again.',
      );
    }
  }

  openAuthTerms(): void {
    this.store.patch({ legalWebView: 'terms' });
  }

  openAuthPrivacy(): void {
    this.store.patch({ authLegalDocument: 'privacy' });
  }

  dismissAuthLegal(): void {
    this.store.patch({ authLegalDocument: null, legalWebView: null });
  }

  async submitRegistration(
    email: string,
    password: string,
    passwordConfirm: string,
    termsAccepted: boolean,
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

    if (!termsAccepted) {
      fieldErrors.terms = 'Please agree to the Terms of Service and Privacy Policy.';
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
      this.pendingAuthPassword = password;
      this.persistSessionUser(user);
      this.store.patch({
        authLoading: false,
        authUser: user,
        authEmail: trimmedEmail,
        authStep: 'verify',
        authFieldErrors: {},
      });
    } catch (error) {
      this.pendingAuthPassword = null;
      this.handleAuthFailure(
        error,
        error instanceof TypeError
          ? 'Cannot reach the registration service. Restart the dev server and try again.'
          : 'Could not create your account. Please try again.',
      );
    }
  }

  dismissCheckEmail(): void {
    const purpose = this.store.get().checkEmailPurpose;
    this.store.patch({
      authStep: purpose === 'password-reset' ? 'forgot-password' : 'create',
      checkEmailPurpose: null,
      authFieldErrors: {},
    });
  }

  /** Resend from the check-email screen — verify OTP or password-reset link. */
  async resendCheckEmail(): Promise<boolean> {
    const state = this.store.get();
    if (state.checkEmailPurpose === 'password-reset') {
      const email = state.authEmail.trim();
      if (!email) {
        this.showToast('Missing email for password reset.');
        return false;
      }
      this.store.patch({ authLoading: true });
      try {
        const message = await requestPasswordReset(email);
        this.store.patch({ authLoading: false });
        this.showToast(message || 'Reset link sent. Check your email.');
        return true;
      } catch (error) {
        this.store.patch({ authLoading: false });
        const message =
          error instanceof AuthApiError
            ? error.summary
            : 'Could not resend the reset link.';
        this.showToast(message);
        appWarn('Auth', 'Resend password reset failed', error);
        return false;
      }
    }
    return this.resendVerificationCode();
  }

  dismissVerifyEmail(): void {
    this.store.patch({ authStep: 'create', authFieldErrors: {} });
  }

  async submitVerification(otp: string): Promise<void> {
    const state = this.store.get();
    const email = state.authEmail || state.authUser?.email || '';
    const trimmedOtp = otp.trim();
    const fieldErrors: Record<string, string> = {};

    if (!isCompleteOtpCode(trimmedOtp)) {
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
      const verifiedUser = await verifyEmail(email, trimmedOtp);
      if (!verifiedUser.is_email_verified) {
        this.store.patch({
          authLoading: false,
          authFieldErrors: {
            _form: 'Verification did not complete. Please try again.',
          },
        });
        return;
      }

      let user = verifiedUser;
      const password = this.pendingAuthPassword;
      this.pendingAuthPassword = null;

      if (password) {
        try {
          const session = await loginUser({ email, password });
          user = session.user;
        } catch (loginError) {
          this.persistSessionUser(verifiedUser);
          this.store.patch({
            authLoading: false,
            authUser: verifiedUser,
            authEmail: email,
            authStep: 'login',
            authFieldErrors: {
              _form:
                loginError instanceof AuthApiError
                  ? 'Email verified. Please log in to continue setup.'
                  : 'Email verified. Log in to finish setting up your profile.',
            },
          });
          this.showToast('Email verified. Please log in to continue.');
          return;
        }
      } else if (!hasStoredAuthTokens()) {
        this.persistSessionUser(verifiedUser);
        this.store.patch({
          authLoading: false,
          authUser: verifiedUser,
          authEmail: email,
          authStep: 'login',
          authFieldErrors: {
            _form: 'Email verified. Please log in to continue setup.',
          },
        });
        this.showToast('Email verified. Please log in to continue.');
        return;
      }

      this.persistSessionUser(user);
      this.store.patch({
        authLoading: false,
        authUser: user,
        authEmail: user.email,
        authFieldErrors: {},
      });
      await this.continueAfterAuthenticated(user, { promptLocation: true });
      this.showToast(
        userNeedsPseudoName(user)
          ? 'Email verified. Pick a name to continue.'
          : 'Email verified.',
      );
    } catch (error) {
      this.handleAuthFailure(
        error,
        error instanceof TypeError
          ? 'Cannot reach the verification service. Try again.'
          : 'Could not verify your email. Please try again.',
      );
    }
  }

  async submitLogin(email: string, password: string): Promise<void> {
    const fieldErrors: Record<string, string> = {};
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      fieldErrors.email = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      fieldErrors.email = 'Enter a valid email address.';
    }

    if (!password) {
      fieldErrors.password = 'Password is required.';
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
      const session = await loginUser({
        email: trimmedEmail,
        password,
      });
      this.pendingAuthPassword = null;
      this.persistSessionUser(session.user);
      this.store.patch({
        authUser: session.user,
        authEmail: session.user.email,
        selectedInterests: session.user.interests?.length
          ? [...session.user.interests]
          : this.store.get().selectedInterests,
        authFieldErrors: {},
      });
      await this.continueAfterAuthenticated(session.user, {
        promptLocation: true,
      });
    } catch (error) {
      this.handleAuthFailure(
        error,
        error instanceof TypeError
          ? 'Cannot reach the login service. Try again.'
          : 'Could not log in. Check your email and password.',
      );
    }
  }

  async submitGoogleSignIn(): Promise<void> {
    this.store.patch({ authLoading: true, authFieldErrors: {} });

    try {
      const session = await signInWithGoogle();
      this.pendingAuthPassword = null;
      this.persistSessionUser(session.user);
      this.store.patch({
        authUser: session.user,
        authEmail: session.user.email,
        selectedInterests: session.user.interests?.length
          ? [...session.user.interests]
          : this.store.get().selectedInterests,
        authFieldErrors: {},
      });
      await this.continueAfterAuthenticated(session.user, {
        promptLocation: true,
      });
    } catch (error) {
      const message =
        error instanceof AuthApiError
          ? error.summary
          : error instanceof Error
            ? error.message
            : 'Google sign-in failed. Please try again.';
      this.store.patch({
        authLoading: false,
        authFieldErrors: { _form: message },
      });
      appWarn('Auth', 'Google sign-in failed', error);
    }
  }

  async logout(): Promise<void> {
    this.store.patch({ authLoading: true, settingsConfirm: 'logout' });
    this.disconnectVenueLiveFeed();
    this.disconnectPersonalNotifications();
    try {
      await logoutUser();
    } catch (error) {
      clearStoredAuthTokens();
      appWarn('Auth', 'Logout request failed; cleared local session', error);
    }
    this.resetAuthState({ showLogin: true, toast: 'Logged out.' });
  }

  async deleteAccount(): Promise<void> {
    const userId = this.store.get().authUser?.id;
    this.store.patch({ authLoading: true, settingsConfirm: 'delete-account' });
    this.disconnectVenueLiveFeed();
    this.disconnectPersonalNotifications();

    try {
      await deleteCurrentAccount();
      if (typeof userId === 'number') {
        clearVenueSelection(userId);
      }
      this.resetAuthState({
        showCreate: true,
        toast: 'Your account has been deleted.',
        preserveAsNewDevice: true,
      });
    } catch (error) {
      this.store.patch({ authLoading: false, settingsConfirm: null });
      const message =
        error instanceof AuthApiError
          ? error.summary
          : error instanceof Error
            ? error.message
            : 'Could not delete your account.';
      this.showToast(message);
      appWarn('Auth', 'Delete account failed', error);
    }
  }

  private resetAuthState(options?: {
    showCreate?: boolean;
    showLogin?: boolean;
    formError?: string;
    toast?: string;
    /** After account deletion, allow marketing onboarding again. */
    preserveAsNewDevice?: boolean;
  }): void {
    this.pendingAuthPassword = null;
    clearStoredAuthUser();
    clearReturningSession();
    venueVisitRepository.clear();
    if (options?.preserveAsNewDevice) {
      clearDeviceHasUsedApp();
    } else {
      markDeviceHasUsedApp();
    }
    this.disconnectVenueLiveFeed();
    this.disconnectPersonalNotifications();
    this.store.patch({
      authUser: null,
      authEmail: '',
      authLoading: false,
      authFieldErrors: options?.formError
        ? { _form: options.formError }
        : {},
      authStep: 'none',
      authStepBeforeLocation: null,
      onboardingComplete: false,
      homeExperience: 'returning',
      userLocation: null,
      locationGateLoading: false,
      locationPermanentlyDenied: false,
      locationGateError: null,
      guestId: null,
      guestAccessAllowed: null,
      guestAccessReason: null,
      guestTrialExpiresAt: null,
      guestHasTriedArView: false,
      guestHasTried2dView: false,
      guestArGatePrompt: null,
      guestArGateLoading: false,
      pseudoNameDraft: '',
      pseudoNameHint: '',
      selectedInterests: [],
      selectedVenueId: null,
      selectedGateId: null,
      forumVenues: [],
      forumSections: [],
      forumCategories: [],
      forumFeedNext: null,
      forumFeedCount: 0,
      sectionHeatmap: [],
      sectionHeatmapActive: false,
      venueLiveStatus: 'idle',
      venueFeedPosts: [],
      venueFeedFilter: 'all',
      upvotedPostIds: [],
      notificationsOpen: false,
      notifications: [],
      notificationsUnreadCount: 0,
      notificationsNext: null,
      notificationsLoading: false,
      notificationsMarkingAll: false,
      notificationDetail: null,
      notificationDetailLoading: false,
      notificationDetailError: null,
      postCommentsOpen: false,
      postCommentsPostId: null,
      postComments: [],
      postCommentsDraft: '',
      postCommentsLoading: false,
      postCommentsSubmitting: false,
      postCommentsEditing: false,
      postCommentsError: null,
      profileView: 'main',
      settingsConfirm: null,
      productTourStepIndex: null,
      productTourCompleted: options?.preserveAsNewDevice
        ? false
        : this.store.get().productTourCompleted,
    });
    if (options?.preserveAsNewDevice) {
      clearProductTourProgress();
    }
    if (options?.showLogin) {
      this.showLogin();
    } else if (options?.showCreate !== false) {
      this.showCreateAccount();
    }
    if (options?.toast) {
      this.showToast(options.toast);
    }
  }

  private handleAuthSessionExpired(): void {
    if (this.handlingSessionExpiry) return;
    this.handlingSessionExpiry = true;
    try {
      this.disconnectVenueLiveFeed();
      this.disconnectPersonalNotifications();
      clearReturningSession();
      clearStoredAuthUser();
      markDeviceHasUsedApp();

      // Map still booting: finish as guest, then route to sign-in in bootstrap.
      if (this.store.get().mapStatus !== 'ready') {
        this.pendingSignInAfterSessionExpiry = true;
        this.store.patch({
          authUser: null,
          onboardingComplete: false,
          authLoading: false,
        });
        return;
      }

      this.resetAuthState({
        showLogin: true,
        formError: 'Your session expired. Please log in again.',
        toast: 'Session expired. Please log in again.',
      });
    } finally {
      this.handlingSessionExpiry = false;
    }
  }

  private persistSessionUser(user: RegisteredUser): void {
    storeAuthUser(user);
  }

  private async refreshProfileQuietly(
    fallback: RegisteredUser,
  ): Promise<RegisteredUser> {
    try {
      const user = await fetchCurrentUser();
      this.persistSessionUser(user);
      return user;
    } catch (error) {
      appWarn('Auth', 'Could not refresh profile after onboarding step', error);
      this.persistSessionUser(fallback);
      return fallback;
    }
  }

  private async continueAfterAuthenticated(
    user: RegisteredUser,
    options?: { welcomeToast?: boolean; promptLocation?: boolean },
  ): Promise<void> {
    markDeviceHasUsedApp();
    const selection = loadVenueSelection(user.id);
    if (selection) {
      venueVisitRepository.markVisited(selection.venueId);
      this.store.patch({
        selectedVenueId: selection.venueId,
        selectedGateId: selection.sectionId,
      });
    }

    this.store.patch({
      authLoading: false,
      authFieldErrors: {},
      authLegalDocument: null,
      legalWebView: null,
    });

    // Location dialog only after explicit create / sign-in / guest - never on
    // silent session restore over the welcome screen.
    if (options?.promptLocation) {
      this.beginLocationPermissionGate();
      return;
    }

    await this.continueAfterLocationGranted();
    if (options?.welcomeToast !== false) {
      /* returning-session path uses enterSelectedVenue toast when applicable */
    }
  }

  /**
   * After the location dialog succeeds, continue onboarding (pseudo-name /
   * venue select) or enter a saved venue and land on home.
   */
  private async continueAfterLocationGranted(): Promise<void> {
    const state = this.store.get();
    const user = state.authUser;

    // Do not clear authStepBeforeLocation here while authStep is still a
    // location-gate step - that briefly renders Find places behind the dialog.
    // Destination helpers clear it in the same patch as the next authStep.

    if (!user) {
      // Guest (or anonymous) path: reuse a prior venue pick when present.
      if (state.selectedVenueId && state.selectedGateId) {
        await this.enterSelectedVenue({ skipLocationGate: true });
        return;
      }
      this.showVenueSelect();
      return;
    }

    const selection = loadVenueSelection(user.id);
    const step = resolveOnboardingStep(user, selection);

    if (step === 'pseudo-name') {
      this.showPseudoNameSetup();
      return;
    }

    if (step === 'venue-select') {
      if (selection?.venueId) {
        this.store.patch({
          selectedVenueId: selection.venueId,
          selectedGateId: selection.sectionId ?? null,
        });
      }
      this.showVenueSelect();
      return;
    }

    this.store.patch({
      selectedVenueId: selection!.venueId,
      selectedGateId: selection!.sectionId,
      authLoading: true,
      // Keep location dialog + underlying screen until completeOnboarding.
      locationGateLoading: true,
    });
    await this.enterSelectedVenue({
      skipLocationGate: true,
      welcomeToast: true,
      homeExperience: 'returning',
    });
  }

  private handleAuthFailure(error: unknown, fallbackMessage: string): void {
    if (error instanceof AuthApiError) {
      const knownFields = new Set([
        'email',
        'password',
        'password_confirm',
        'old_password',
        'new_password',
        'uid',
        'token',
        'otp',
        'pseudo_name',
        'id_token',
        '_form',
      ]);
      const fieldErrors: Record<string, string> = {};
      const orphanMessages: string[] = [];

      for (const [key, message] of Object.entries(error.fieldErrors)) {
        if (knownFields.has(key)) {
          fieldErrors[key] = message;
        } else if (message.trim()) {
          orphanMessages.push(message);
        }
      }

      if (
        Object.keys(fieldErrors).length === 0 ||
        orphanMessages.length > 0
      ) {
        fieldErrors._form =
          fieldErrors._form || orphanMessages[0] || error.summary;
      }

      this.store.patch({
        authLoading: false,
        authFieldErrors: fieldErrors,
      });
      return;
    }

    this.store.patch({
      authLoading: false,
      authFieldErrors: { _form: fallbackMessage },
    });
    appWarn('Auth', fallbackMessage, error);
  }

  async resendVerificationCode(): Promise<boolean> {
    const state = this.store.get();
    const email = state.authEmail || state.authUser?.email || '';
    if (!email) {
      this.showToast('Missing email for verification.');
      return false;
    }

    try {
      await resendVerification(email);
      this.showToast('Code sent. Check your email.');
      return true;
    } catch (error) {
      const message =
        error instanceof AuthApiError
          ? error.summary
          : 'Could not resend the verification code.';
      this.showToast(message);
      appWarn('Auth', 'Resend verification failed', error);
      return false;
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
      const continueArSetup =
        this.store.get().arRouteSetupActive && !hasDestination;
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
        ...(continueArSetup
          ? {
              searchQuery: '',
              searchResults: [],
            }
          : {}),
      });

      if (hasDestination) {
        this.scheduleAutoRoute();
      } else if (continueArSetup) {
        this.pendingMapSearchFocus = true;
        this.showToast('Now pick your destination.');
      }
    } catch (error) {
      this.showToast(
        toUserFacingRouteError(error, 'Could not set start point.'),
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
        toUserFacingRouteError(error, 'Could not set destination.'),
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

  async toggleVenueFeedUpvote(postId: string): Promise<void> {
    const numericId = Number(postId);
    if (!Number.isFinite(numericId) || numericId <= 0) return;
    if (this.venueFeedUpvoteInFlight.has(postId)) return;
    if (!hasStoredAuthTokens()) {
      this.showToast('Sign in to upvote posts.');
      return;
    }

    const state = this.store.get();
    const post = state.venueFeedPosts.find((entry) => entry.id === postId);
    if (!post) return;

    const wasUpvoted =
      state.upvotedPostIds.includes(postId) || Boolean(post.hasUpvoted);
    const nextUpvoted = !wasUpvoted;
    const previousUpvotes = post.upvotes;
    this.applyOptimisticVenueFeedUpvote(postId, nextUpvoted);

    this.venueFeedUpvoteInFlight.add(postId);
    try {
      const updated = await toggleForumPostUpvote(numericId, {
        hasUpvotedFallback: nextUpvoted,
      });
      this.mergeForumPostIntoFeed({
        ...updated,
        // Keep the toggled state even if the API omits / mishandles has_upvoted.
        has_upvoted: nextUpvoted,
        upvotes_count: Number.isFinite(updated.upvotes_count)
          ? updated.upvotes_count
          : nextUpvoted
            ? previousUpvotes + 1
            : Math.max(0, previousUpvotes - 1),
      });
    } catch (error) {
      this.applyOptimisticVenueFeedUpvote(postId, wasUpvoted, previousUpvotes);
      const message =
        error instanceof AuthApiError
          ? error.summary
          : 'Could not update upvote. Please try again.';
      this.showToast(message);
      appWarn('Forum', 'Upvote toggle failed', error);
    } finally {
      this.venueFeedUpvoteInFlight.delete(postId);
    }
  }

  async flagVenueFeedPost(postId: string, reason?: string): Promise<void> {
    const numericId = Number(postId);
    if (!Number.isFinite(numericId) || numericId <= 0) return;
    if (this.venueFeedFlagInFlight.has(postId)) return;
    if (!hasStoredAuthTokens()) {
      this.showToast('Sign in to report posts.');
      return;
    }

    this.venueFeedFlagInFlight.add(postId);
    try {
      const updated = await flagForumPost(
        numericId,
        reason?.trim() ? { reason: reason.trim() } : undefined,
      );
      if (updated.status === 'hidden') {
        this.removeVenueFeedPost(String(updated.id));
        this.showToast('Post reported and removed.');
      } else {
        this.mergeForumPostIntoFeed(updated);
        this.showToast('Thanks. Post reported.');
      }
    } catch (error) {
      const message =
        error instanceof AuthApiError
          ? error.summary
          : 'Could not report this post. Please try again.';
      this.showToast(message);
      appWarn('Forum', 'Flag post failed', error);
    } finally {
      this.venueFeedFlagInFlight.delete(postId);
    }
  }

  async submitVenueFeedPost(): Promise<void> {
    if (this.venueFeedCreateInFlight) return;
    if (!hasStoredAuthTokens()) {
      this.showToast('Sign in to post.');
      return;
    }

    const state = this.store.get();
    const content = this.captureVenueFeedDraft().trim().slice(0, 140);
    if (!content) return;

    const venueId = Number(state.selectedVenueId);
    if (!Number.isFinite(venueId) || venueId <= 0) {
      this.showToast('Select a venue before posting.');
      return;
    }

    const section =
      state.forumSections.find(
        (item) => String(item.id) === state.selectedGateId,
      ) ?? null;

    const filterCategory =
      state.venueFeedFilter !== 'all'
        ? state.forumCategories.find(
            (item) => String(item.id) === state.venueFeedFilter,
          )
        : undefined;
    const category =
      filterCategory ??
      state.forumCategories.find((item) => item.slug === 'fan-vibe') ??
      state.forumCategories[0];

    if (!category) {
      this.showToast('Categories are still loading. Try again in a moment.');
      return;
    }

    this.venueFeedCreateInFlight = true;
    this.store.patch({ venueFeedDraft: '' });

    try {
      const created = await createForumPost({
        venue: venueId,
        category: category.id,
        content,
        section: section?.id ?? null,
      });
      this.mergeForumPostIntoFeed(created);
    } catch (error) {
      this.store.patch({ venueFeedDraft: content });
      const message =
        error instanceof AuthApiError
          ? error.summary
          : 'Could not post. Please try again.';
      this.showToast(message);
      appWarn('Forum', 'Create post failed', error);
    } finally {
      this.venueFeedCreateInFlight = false;
    }
  }

  openPostComments(postId: string): void {
    const post = this.store.get().venueFeedPosts.find((entry) => entry.id === postId);
    if (!post) {
      this.showToast('Post not found.');
      return;
    }
    this.store.patch({
      activeTab: 'social',
      postCommentsOpen: true,
      postCommentsPostId: postId,
      postComments: [],
      postCommentsDraft: '',
      postCommentsLoading: true,
      postCommentsSubmitting: false,
      postCommentsEditing: false,
      postCommentsError: null,
      notificationsOpen: false,
    });
    void this.refreshPostComments(postId);
  }

  closePostComments(): void {
    this.store.patch({
      postCommentsOpen: false,
      postCommentsPostId: null,
      postComments: [],
      postCommentsDraft: '',
      postCommentsLoading: false,
      postCommentsSubmitting: false,
      postCommentsEditing: false,
      postCommentsError: null,
    });
  }

  setPostCommentsDraft(draft: string): void {
    this.store.patch({ postCommentsDraft: draft });
  }

  beginEditVenueFeedPost(): void {
    this.store.patch({ postCommentsEditing: true, postCommentsError: null });
  }

  cancelEditVenueFeedPost(): void {
    this.store.patch({ postCommentsEditing: false, postCommentsError: null });
  }

  private async refreshPostComments(postId: string): Promise<void> {
    const numericId = Number(postId);
    if (!Number.isFinite(numericId)) {
      this.store.patch({
        postCommentsLoading: false,
        postCommentsError: 'Invalid post.',
      });
      return;
    }

    try {
      const page = await listForumComments({ post: numericId, ordering: 'created_at' });
      if (this.store.get().postCommentsPostId !== postId) return;
      const items = mapForumCommentsToItems(page.results);
      this.store.patch({
        postComments: items,
        postCommentsLoading: false,
        postCommentsError: null,
        venueFeedPosts: this.store.get().venueFeedPosts.map((post) =>
          post.id === postId ? { ...post, comments: items.length } : post,
        ),
      });
    } catch (error) {
      if (this.store.get().postCommentsPostId !== postId) return;
      this.store.patch({
        postCommentsLoading: false,
        postCommentsError:
          error instanceof AuthApiError
            ? error.summary
            : 'Could not load comments.',
      });
      appWarn('Forum', 'List comments failed', error);
    }
  }

  async submitPostComment(): Promise<void> {
    const state = this.store.get();
    const postId = state.postCommentsPostId;
    const content = state.postCommentsDraft.trim();
    if (!postId || !content || state.postCommentsSubmitting) return;

    if (!hasStoredAuthTokens()) {
      this.showToast('Sign in to comment.');
      return;
    }

    const numericId = Number(postId);
    if (!Number.isFinite(numericId)) return;

    this.store.patch({
      postCommentsSubmitting: true,
      postCommentsError: null,
      postCommentsDraft: '',
    });

    try {
      const created = await createForumComment({
        post: numericId,
        content,
      });
      if (this.store.get().postCommentsPostId !== postId) return;
      const item = mapForumCommentToItem(created);
      const comments = [...this.store.get().postComments, item];
      this.store.patch({
        postComments: comments,
        postCommentsSubmitting: false,
        venueFeedPosts: this.store.get().venueFeedPosts.map((post) =>
          post.id === postId ? { ...post, comments: comments.length } : post,
        ),
      });
    } catch (error) {
      this.store.patch({
        postCommentsSubmitting: false,
        postCommentsDraft: content,
        postCommentsError:
          error instanceof AuthApiError
            ? error.summary
            : 'Could not post comment.',
      });
      appWarn('Forum', 'Create comment failed', error);
    }
  }

  async deletePostComment(commentId: string): Promise<void> {
    const id = Number(commentId);
    if (!Number.isFinite(id) || !hasStoredAuthTokens()) return;
    if (this.store.get().postCommentsSubmitting) return;

    this.store.patch({ postCommentsSubmitting: true, postCommentsError: null });
    try {
      await deleteForumComment(id);
      const postId = this.store.get().postCommentsPostId;
      const comments = this.store.get().postComments.filter(
        (comment) => comment.id !== id,
      );
      this.store.patch({
        postComments: comments,
        postCommentsSubmitting: false,
        venueFeedPosts: postId
          ? this.store.get().venueFeedPosts.map((post) =>
              post.id === postId ? { ...post, comments: comments.length } : post,
            )
          : this.store.get().venueFeedPosts,
      });
    } catch (error) {
      this.store.patch({
        postCommentsSubmitting: false,
        postCommentsError:
          error instanceof AuthApiError
            ? error.summary
            : 'Could not delete comment.',
      });
      appWarn('Forum', 'Delete comment failed', error);
    }
  }

  async saveEditedVenueFeedPost(content: string): Promise<void> {
    const postId = this.store.get().postCommentsPostId;
    const trimmed = content.trim();
    if (!postId || !trimmed) {
      this.store.patch({
        postCommentsError: 'Post content cannot be empty.',
      });
      return;
    }
    if (!hasStoredAuthTokens()) {
      this.showToast('Sign in to edit posts.');
      return;
    }

    const numericId = Number(postId);
    if (!Number.isFinite(numericId)) return;

    this.store.patch({ postCommentsSubmitting: true, postCommentsError: null });
    try {
      const updated = await updateForumPost(numericId, { content: trimmed });
      this.mergeForumPostIntoFeed(updated);
      this.store.patch({
        postCommentsSubmitting: false,
        postCommentsEditing: false,
      });
      this.showToast('Post updated.');
    } catch (error) {
      this.store.patch({
        postCommentsSubmitting: false,
        postCommentsError:
          error instanceof AuthApiError
            ? error.summary
            : 'Could not update post.',
      });
      appWarn('Forum', 'Update post failed', error);
    }
  }

  async deleteOpenVenueFeedPost(): Promise<void> {
    const postId = this.store.get().postCommentsPostId;
    if (!postId || !hasStoredAuthTokens()) return;
    const numericId = Number(postId);
    if (!Number.isFinite(numericId)) return;

    this.store.patch({ postCommentsSubmitting: true, postCommentsError: null });
    try {
      await deleteForumPost(numericId);
      this.removeVenueFeedPost(postId);
      this.closePostComments();
      this.showToast('Post deleted.');
    } catch (error) {
      this.store.patch({
        postCommentsSubmitting: false,
        postCommentsError:
          error instanceof AuthApiError
            ? error.summary
            : 'Could not delete post.',
      });
      appWarn('Forum', 'Delete post failed', error);
    }
  }

  private applyOptimisticVenueFeedUpvote(
    postId: string,
    upvoted: boolean,
    upvotesOverride?: number,
  ): void {
    const state = this.store.get();
    const posts = state.venueFeedPosts.map((entry) => {
      if (entry.id !== postId) return entry;
      const nextUpvotes =
        typeof upvotesOverride === 'number'
          ? upvotesOverride
          : upvoted
            ? entry.upvotes + 1
            : Math.max(0, entry.upvotes - 1);
      return { ...entry, upvotes: nextUpvotes, hasUpvoted: upvoted };
    });
    this.store.patch({
      venueFeedPosts: posts,
      upvotedPostIds: upvoted
        ? [...new Set([...state.upvotedPostIds, postId])]
        : state.upvotedPostIds.filter((id) => id !== postId),
      venueFeedDraft: this.captureVenueFeedDraft(),
    });
  }

  /** Merge a REST `Post` into the feed (create / upvote / flag). WS events also dedupe by id. */
  private mergeForumPostIntoFeed(post: ForumPost): void {
    if (post.status === 'hidden') {
      this.removeVenueFeedPost(String(post.id));
      return;
    }

    const state = this.store.get();
    const postId = String(post.id);
    const existing = state.venueFeedPosts.find((entry) => entry.id === postId);
    const sectionById = new Map(
      state.forumSections.map((section) => [section.id, section]),
    );
    const categoryById = new Map(
      state.forumCategories.map((category) => [category.id, category]),
    );
    const mapped = mapForumPostToVenueFeed(post, sectionById, categoryById);
    const isPartial = !post.content || post.user.id <= 0;

    const merged = existing && isPartial
      ? {
          ...existing,
          upvotes: mapped.upvotes,
          hasUpvoted: mapped.hasUpvoted,
        }
      : mapped;

    const venueFeedPosts = existing
      ? state.venueFeedPosts.map((entry) =>
          entry.id === postId ? merged : entry,
        )
      : [merged, ...state.venueFeedPosts];
    const upvotedPostIds = merged.hasUpvoted
      ? [...new Set([...state.upvotedPostIds, postId])]
      : state.upvotedPostIds.filter((id) => id !== postId);

    this.store.patch({
      venueFeedPosts,
      forumFeedCount: existing ? state.forumFeedCount : state.forumFeedCount + 1,
      upvotedPostIds,
    });
  }

  private removeVenueFeedPost(postId: string): void {
    const state = this.store.get();
    const nextPosts = state.venueFeedPosts.filter((post) => post.id !== postId);
    if (nextPosts.length === state.venueFeedPosts.length) return;
    this.store.patch({
      venueFeedPosts: nextPosts,
      forumFeedCount: Math.max(0, state.forumFeedCount - 1),
      upvotedPostIds: state.upvotedPostIds.filter((id) => id !== postId),
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

    try {
      const target = resolveMapTarget(this.mapData, locationId);
      if (!target) {
        this.showToast(LOCATION_NOT_ROUTABLE_MESSAGE);
        return;
      }

      const needsStart = !this.routePlanner.hasOrigin;
      if (needsStart) {
        if (this.store.get().route) {
          this.routePlanner.clearRoute();
          this.routePlanner.setRoutePlanningPaused(false);
          this.stopPositionProvider();
        }
        await this.routePlanner.setOriginFromLocation(target, name);
        this.routePlanner.clearHighlights();
        const continueArSetup = this.store.get().arRouteSetupActive;
        this.pendingMapSearchFocus = true;
        this.store.patch({
          searchResults: [],
          searchQuery: '',
          markers: this.routePlanner.markersState,
          showRouteSheet: false,
          route: null,
          routeNotFound: false,
          routeSimulating: false,
          routeSimulationComplete: false,
          routeTraveledMeters: 0,
          routeRemainingMeters: null,
        });
        this.showToast(
          continueArSetup
            ? 'Start set. Now search for your destination.'
            : 'Start set. Search for your destination.',
        );
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
        route: null,
        routeNotFound: false,
      });
      this.scheduleAutoRoute();
    } catch (error) {
      const missingStart = !this.routePlanner?.hasOrigin;
      this.showToast(
        toUserFacingRouteError(
          error,
          missingStart
            ? 'Could not set start point.'
            : 'Could not set destination.',
        ),
      );
    }
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
    if (!this.mapView || !this.blueDotService) {
      this.showToast('Map is still loading. Try again in a moment.');
      return;
    }

    try {
      const coords = await this.locationService.requestLocation({
        timeoutMs: 15_000,
      });
      const floorId =
        this.mapView.currentFloor?.id ??
        this.store.get().currentFloorId ??
        undefined;

      this.blueDotService.showLivePosition(
        {
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
          floorId,
        },
        { follow: true },
      );

      if (!this.blueDotService.isTracking) {
        await this.blueDotService.startTracking({
          follow: true,
          watchDevicePosition: true,
        });
        await this.blueDotService.enableHeading().catch(() => undefined);
      } else {
        this.blueDotService.follow();
        this.blueDotService.focusOnUser();
      }

      this.store.patch({
        blueDotFollowing: true,
        blueDotStatus: 'active',
      });

      const origin =
        this.blueDotService.coordinate ??
        this.mapView.createCoordinate?.(
          coords.latitude,
          coords.longitude,
          this.mapView.currentFloor ?? undefined,
        );
      if (origin && this.routePlanner) {
        try {
          this.routePlanner.setOrigin(origin, 'my location');
          this.store.patch({ markers: this.routePlanner.markersState });
          this.scheduleAutoRoute();
        } catch {
          // GPS can fall outside indoor geometry; the marker still shows you.
        }
      }

      this.showToast(
        coords.accuracy != null
          ? `You are here (±${Math.round(coords.accuracy)} m).`
          : 'You are here.',
      );
    } catch (error) {
      const message =
        error instanceof GeolocationPositionError ||
        this.locationService.isPermissionDeniedError(error)
          ? this.locationService.geolocationErrorMessage(
              error as GeolocationPositionError | Error,
            )
          : toUserFacingRouteError(error, 'Could not get your location.');
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

  /** Close the route sheet; if routing failed, fully reset so planning can restart. */
  async dismissRouteSheet(): Promise<void> {
    if (this.store.get().routeNotFound) {
      await this.clearRoutePoints();
      return;
    }
    await this.clearRoute();
  }

  async clearRoute(): Promise<void> {
    if (!this.routePlanner) return;
    this.routePlanner.clearRoute();
    this.routePlanner.endGuidedNavigation();
    this.routePlanner.setRoutePlanningPaused(false);
    this.alongPathStabilizer.reset(0);
    this.store.patch({
      route: null,
      showRouteSheet: false,
      currentLegIndex: 0,
      routeInstructions: '',
      routeTraveledMeters: 0,
      routeRemainingMeters: null,
      routeSimulating: false,
      routeSimulationComplete: false,
      arrivalDialogOpen: false,
      arrivalDialogHandled: false,
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

    if (!isGuestMode()) {
      // Start Chrome's camera prompt on this click before any guest/network awaits.
      beginArMediaPermissionPrime();
    }

    if (isGuestMode()) {
      this.store.patch({ guestArGateLoading: true });
      try {
        const eligibility = await resolveGuestArEligibility();
        this.store.patch({
          guestHasTriedArView: eligibility.preferences.hasTriedArView,
          guestHasTried2dView: eligibility.preferences.hasTried2dView,
          guestArGateLoading: false,
        });

        if (!eligibility.allowed) {
          this.store.patch({ guestArGatePrompt: 'already-used' });
          return;
        }

        // First-time guests must acknowledge the one-time trial before AR opens.
        if (this.store.get().guestArGatePrompt !== 'one-time-info') {
          this.store.patch({ guestArGatePrompt: 'one-time-info' });
          return;
        }
      } catch (error) {
        this.store.patch({ guestArGateLoading: false });
        appWarn('Guest', 'Could not resolve AR eligibility', error);
        this.showToast('Could not verify your AR trial. Please try again.');
        return;
      }
    }

    await this.enterArFullscreen();
  }

  /** Dismiss the guest AR trial dialog without opening AR. */
  dismissGuestArGate(): void {
    this.store.patch({
      guestArGatePrompt: null,
      guestArGateLoading: false,
    });
  }

  /**
   * Guest acknowledged the one-time AR notice - consume the trial on the
   * backend immediately, then open AR.
   */
  async confirmGuestArOneTimeTrial(): Promise<void> {
    if (!isGuestMode()) {
      this.store.patch({ guestArGatePrompt: null });
      await this.openAr();
      return;
    }

    if (!this.store.get().route) {
      this.store.patch({ guestArGatePrompt: null });
      this.showToast('Generate a route before opening AR.');
      return;
    }

    beginArMediaPermissionPrime();

    this.store.patch({ guestArGateLoading: true });
    try {
      const preferences = await markGuestArViewTried();
      this.store.patch({
        guestHasTriedArView: preferences.hasTriedArView,
        guestHasTried2dView: preferences.hasTried2dView,
        guestArGatePrompt: null,
        guestArGateLoading: false,
      });
      await this.enterArFullscreen();
    } catch (error) {
      this.store.patch({ guestArGateLoading: false });
      appWarn('Guest', 'Could not mark AR trial as used', error);
      this.showToast('Could not start your AR trial. Please try again.');
    }
  }

  /** PATCH has_tried_2d_view=true the first time a guest opens the 2D map. */
  private async consumeGuest2dMapTrial(): Promise<void> {
    if (!isGuestMode()) return;
    if (this.store.get().guestHasTried2dView) return;

    try {
      const preferences = await markGuest2dViewTried();
      this.store.patch({
        guestHasTriedArView: preferences.hasTriedArView,
        guestHasTried2dView: preferences.hasTried2dView,
      });
    } catch (error) {
      appWarn('Guest', 'Could not mark 2D map trial as used', error);
    }
  }

  private async enterArFullscreen(): Promise<void> {
    const state = this.store.get();
    if (!state.route) {
      this.showToast('Generate a route before opening AR.');
      return;
    }

    const permissions = await consumeArMediaPermissionPrime();
    const cameraReady = shouldReuseGrantedArCamera(
      permissions.camera,
      isArSameOrigin(),
    );

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
      { cameraReady },
    );
    openArFullscreen(url, routePayload);
    notifyArIframePermissions(
      cameraReady
        ? 'granted'
        : isArSameOrigin()
          ? permissions.camera
          : 'prompt',
    );
    this.store.patch({
      arPresentation: 'fullscreen',
      guestArGatePrompt: null,
      guestArGateLoading: false,
    });
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
    this.maybeRevealArrivalDialog(this.store.get().routeSimulationComplete);
  }

  async dismissArrivalDialog(): Promise<void> {
    this.store.patch({
      arrivalDialogOpen: false,
      arrivalDialogHandled: true,
    });
    await this.clearRoutePoints();
  }

  /** Exit AR and clear the active route (Figma “End navigation”). */
  async endArNavigation(): Promise<void> {
    this.closeAr();
    await this.clearRoutePoints();
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

  private resolveNavigationSource(): PositionSourceType {
    return PositionProviderRegistry.resolveNavigationSource(
      this.store.get().simulationEnabled,
    );
  }

  private isSimulationNavigation(): boolean {
    return this.resolveNavigationSource() === 'simulator';
  }

  /**
   * Switch or (re)start the position provider for the active route without
   * wiping navigation progress. Used by applyRoute, Begin, and Simulation toggle.
   */
  private applyNavigationPositionMode(options: {
    path: RoutePayload['pathCoordinates'];
    resumeNavigating?: boolean;
    alongPathMeters?: number;
  }): void {
    const resumeNavigating = options.resumeNavigating === true;
    const alongPathMeters = options.alongPathMeters ?? this.store.get().routeTraveledMeters;
    const remainingHint =
      this.store.get().routeRemainingMeters ??
      this.store.get().route?.distanceMeters ??
      null;

    this.stopPositionProvider({ preserveProgress: true });
    this.startPositionProvider(options.path);

    if (this.isSimulationNavigation()) {
      this.liveRouteTracking = false;
      const provider = this.getSimulatorProvider();
      provider?.seekAlongPath(alongPathMeters);
      if (resumeNavigating) {
        provider?.startSimulationMove();
        this.blueDotService?.follow();
        const traveled = provider?.getMetersAlongPath() ?? alongPathMeters;
        const total = provider?.getTotalPathMeters() ?? this.store.get().route?.distanceMeters ?? traveled;
        const atEnd = provider?.isAtPathEnd() ?? false;
        this.store.patch({
          blueDotFollowing: true,
          routeSimulating: Boolean(provider?.moving && !atEnd),
          routeSimulationComplete: atEnd && traveled > 0,
          routeTraveledMeters: traveled,
          routeRemainingMeters: Math.max(0, total - traveled),
        });
        this.maybeRevealArrivalDialog(atEnd && traveled > 0);
        if (isArSessionActive(this.store.get().arPresentation)) {
          const snapshot = this.getNavigationProgressSnapshot();
          notifyArSimulatorStarted({
            alongPathMeters: snapshot.alongPathMeters,
            pathPoints: options.path.length,
          });
          syncNavigationToAr(snapshot);
        }
      } else {
        this.store.patch({
          routeTraveledMeters: alongPathMeters,
          routeRemainingMeters: remainingHint,
          routeSimulating: false,
          routeSimulationComplete: false,
        });
      }
      return;
    }

    // Live indoor positioning (GPS / beacons / IPS) projected onto the route.
    this.alongPathStabilizer.reset(alongPathMeters);
    this.liveRouteTracking = true;
    this.blueDotService?.follow();
    this.store.patch({
      blueDotFollowing: true,
      routeSimulating: true,
      routeSimulationComplete: false,
      routeTraveledMeters: alongPathMeters,
      routeRemainingMeters: remainingHint,
    });
    if (isArSessionActive(this.store.get().arPresentation)) {
      syncNavigationToAr(this.getNavigationProgressSnapshot());
    }
  }

  private projectFrameOntoRoute(frame: FplacesPositionFrame): FplacesPositionFrame {
    const path = this.store.get().route?.pathCoordinates;
    if (!path?.length) return frame;

    const snapped = coordinateTransformationService.snapToRoute(
      path,
      frame.latitude,
      frame.longitude,
      {
        preferVenue: true,
        floorId: frame.floorId ?? this.store.get().currentFloorId,
        currentLegIndex: this.store.get().currentLegIndex,
      },
    );
    if (!snapped) return frame;

    return {
      ...frame,
      latitude: snapped.latitude,
      longitude: snapped.longitude,
      floorId: snapped.floorId ?? frame.floorId,
      alongPathMeters: snapped.distanceAlongPathMeters,
      offRouteMeters: snapped.offRouteMeters ?? 0,
    };
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
      ? this.activePositionSource === 'simulator'
        ? 'simulator'
        : this.activePositionSource
      : undefined;

    if (provider && this.isSimulationNavigation()) {
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

    if (!this.isSimulationNavigation() && (state.routeSimulating || this.liveRouteTracking)) {
      source = PositionProviderRegistry.isLiveHardwareSource(this.activePositionSource)
        ? this.activePositionSource
        : 'gps';
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

  /** Continue or start navigation at the current map progress when AR opens. */
  private resumeRouteNavigation(progress: NavigationProgressSnapshot): void {
    const state = this.store.get();
    if (!state.route?.pathCoordinates?.length) return;

    if (this.isSimulationNavigation()) {
      const provider = this.getSimulatorProvider();
      if (provider?.moving) {
        this.syncRouteProgress(true);
        syncNavigationToAr(this.getNavigationProgressSnapshot());
        return;
      }
    } else if (this.liveRouteTracking || state.routeSimulating) {
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

  /** Kick simulated walk or live GPS tracking along the active route. */
  startRouteMovement(options?: {
    alongPathMeters?: number;
    resetProgress?: boolean;
  }): void {
    const state = this.store.get();
    if (!state.route?.pathCoordinates?.length) {
      this.showToast('Generate a route before starting navigation.');
      console.warn('[PWA Bridge] startRouteMovement skipped - no route path');
      return;
    }

    if (state.isCalculatingRoute) {
      this.showToast('Route is still calculating…');
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

    if (!this.isSimulationNavigation()) {
      this.alongPathStabilizer.reset(targetAlong);
      this.applyNavigationPositionMode({
        path: state.route.pathCoordinates,
        resumeNavigating: true,
        alongPathMeters: targetAlong,
      });
      this.lastProgressUiAt = 0;
      appLog('Position', 'Live IPS route tracking armed', {
        alongPathMeters: targetAlong,
        pathPoints: state.route.pathCoordinates.length,
        source: this.resolveNavigationSource(),
      });
      if (isArSessionActive(this.store.get().arPresentation)) {
        syncNavigationToAr(this.getNavigationProgressSnapshot());
      }
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
      console.error('[PWA Bridge] startRouteMovement failed - simulator provider unavailable');
      return;
    }

    this.liveRouteTracking = false;
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
    this.liveRouteTracking = false;
    this.routePlanner?.clearTravelledPathTracking();

    this.lastProgressUiAt = 0;
    this.alongPathStabilizer.reset(0);
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

    if (!this.isSimulationNavigation()) {
      if (!force && !state.routeSimulating && !this.liveRouteTracking && !state.routeSimulationComplete) {
        return;
      }
      const now = performance.now();
      if (!force && !state.routeSimulationComplete && now - this.lastProgressUiAt < 200) return;
      this.lastProgressUiAt = now;
      // Live progress is patched in handleProviderFrame from snapped meters.
      return;
    }

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
    this.routePlanner?.updateDestinationProximity(remaining, total);
    this.maybeRevealArrivalDialog(atEnd && traveled > 0);
  }

  private syncLiveRouteProgress(
    alongPathMeters: number,
    options?: { offRouteMeters?: number; force?: boolean },
  ): void {
    const state = this.store.get();
    if (!state.route) return;
    const force = options?.force === true;
    if (!this.liveRouteTracking && !state.routeSimulating && !force) return;

    const now = performance.now();
    if (!force && now - this.lastProgressUiAt < 200) return;
    this.lastProgressUiAt = now;

    const total =
      state.route.distanceMeters ??
      coordinateTransformationService.totalPathLengthMeters(state.route.pathCoordinates);
    const stabilizedAlong = this.alongPathStabilizer.update({
      nextAlongMeters: alongPathMeters,
      offRouteMeters: options?.offRouteMeters,
    });
    const traveled = Math.max(0, Math.min(total, stabilizedAlong));
    const remaining = computeLiveRemainingMeters({
      totalPathMeters: total,
      alongPathMeters: traveled,
      offRouteMeters: options?.offRouteMeters,
    });
    const atEnd = hasArrivedAtDestination({
      totalPathMeters: total,
      alongPathMeters: traveled,
      offRouteMeters: options?.offRouteMeters,
    });

    this.liveRouteTracking = !atEnd;
    this.store.patch({
      routeTraveledMeters: traveled,
      routeRemainingMeters: remaining,
      routeSimulating: !atEnd,
      routeSimulationComplete: atEnd && traveled > 0,
    });
    this.routePlanner?.updateDestinationProximity(remaining, total);
    this.maybeRevealArrivalDialog(atEnd && traveled > 0);
  }

  private maybeRevealArrivalDialog(atEnd: boolean): void {
    if (!atEnd) return;
    const state = this.store.get();
    if (state.arrivalDialogHandled || state.arrivalDialogOpen) return;
    if (state.arPresentation === 'fullscreen') return;
    this.store.patch({ arrivalDialogOpen: true });
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
          toUserFacingRouteError(error, 'Could not set route point.'),
        );
      }
    });

    this.mapView.on('floor-change', (event) => {
      const floorId =
        (event as { floor?: { id?: string } }).floor?.id ??
        this.mapView?.currentFloor?.id;
      if (floorId) this.store.patch({ currentFloorId: floorId });
    });

    this.mapData?.on('language-change', ({ code, name }) => {
      appLog('Map', `Language changed to ${name} (${code})`);
      savePreferredMapLanguage(code);
      this.handleMapLanguageChanged(code, name);
    });
  }

  private publishMapLanguages(): void {
    if (!this.mapData) return;
    const languages = getSupportedMapLanguages(this.mapData);
    const current = getCurrentMapLanguage(this.mapData);
    this.store.patch({
      mapLanguages: languages,
      mapLanguageCode: current?.code ?? null,
      mapLanguageName: current?.name ?? null,
    });
  }

  private handleMapLanguageChanged(code: string, name: string): void {
    if (!this.mapData) return;
    this.publishFloors();
    this.store.patch({
      mapLanguageCode: code,
      mapLanguageName: name,
      mapLanguages: getSupportedMapLanguages(this.mapData),
      searchChips: getLocationChips(this.mapData),
    });
    this.socialMapMarkers?.refreshForLanguageChange(this.store.get());
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
      const message = toUserFacingRouteError(
        error,
        'Could not build a route. Try different points.',
      );
      this.showToast(message);
      // Keep the sheet open with Reset available so the user can start over.
      this.routePlanner.setRoutePlanningPaused(false);
      this.stopPositionProvider();
      this.alongPathStabilizer.reset(0);
      this.store.patch({
        route: null,
        routeNotFound: true,
        showRouteSheet: true,
        markers: this.routePlanner.markersState,
        routeInstructions: '',
        routeTraveledMeters: 0,
        routeRemainingMeters: null,
        routeSimulating: false,
        routeSimulationComplete: false,
      });
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
    this.liveRouteTracking = false;
    this.alongPathStabilizer.reset(0);

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
      arrivalDialogOpen: false,
      arrivalDialogHandled: false,
      routeNotFound: false,
      arRouteSetupActive: false,
    });

    this.startPositionProvider(route.pathCoordinates);
    this.routePlanner.beginGuidedNavigation(route.distanceMeters ?? null);
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
    this.stopPositionProvider({ preserveProgress: true });
    this.activePositionSource = this.resolveNavigationSource();
    positionTelemetry.setActiveSource(this.activePositionSource);
    this.floorOrchestrator.reset();
    positionTelemetry.setOrchestratorState(this.floorOrchestrator.getState());
    // Inject provider frames into Blue Dot (sim walk or live IPS snapped onto route).
    const drivesAvatar =
      this.activePositionSource === 'simulator' ||
      PositionProviderRegistry.isLiveHardwareSource(this.activePositionSource);
    this.blueDotService?.setSimulatorParallelMode(drivesAvatar);

    const originFloorId = path[0]?.floorId ?? this.store.get().currentFloorId;
    if (originFloorId) {
      this.floorOrchestrator.forceFloor(originFloorId);
      positionTelemetry.setOrchestratorState(this.floorOrchestrator.getState());
      this.applyOrchestratedFloor(originFloorId);
    }

    if (this.activePositionSource === 'simulator' && path[0]) {
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
      simulationEnabled: this.store.get().simulationEnabled,
    });

    if (this.activePositionSource !== 'simulator') {
      // Live IPS: project hardware fixes onto the route and track as they arrive.
      this.liveRouteTracking = true;
      this.blueDotService?.follow();
      this.store.patch({
        blueDotFollowing: true,
        routeSimulating: true,
        routeSimulationComplete: false,
      });
    }
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

  private stopPositionProvider(options?: { preserveProgress?: boolean }): void {
    this.positionProvider?.stop();
    this.positionProvider = null;
    this.blueDotService?.setSimulatorParallelMode(false);
    this.lastArStreamAt = 0;
    this.lastArProviderStreamAt = 0;
    this.lastProviderFix = null;
    this.floorOrchestrator.reset();
    positionTelemetry.setOrchestratorState(this.floorOrchestrator.getState());
    positionTelemetry.setActiveSource('none');
    if (!options?.preserveProgress) {
      this.liveRouteTracking = false;
      this.alongPathStabilizer.reset(0);
      if (
        this.store.get().routeSimulating ||
        this.store.get().routeSimulationComplete
      ) {
        this.store.patch({
          routeSimulating: false,
          routeSimulationComplete: false,
          routeTraveledMeters: 0,
          routeRemainingMeters: null,
        });
      }
    }
  }

  private ingestPositionFrame(frame: FplacesPositionFrame, meta?: { bleUuid?: string; bleMajor?: number; bleMinor?: number; bleRssi?: number }): void {
    const currentFloorId = this.store.get().currentFloorId;
    if (
      frame.floorId &&
      currentFloorId &&
      frame.floorId !== currentFloorId
    ) {
      appLog('Position', 'Floor ID mismatch - frame floor differs from map view', {
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

  private releaseCameraFollowFromUserPan(): void {
    if (!this.blueDotService?.isFollowing) return;
    this.blueDotService.stopFollow();
    this.store.patch({ blueDotFollowing: false });
  }

  private handleProviderFrame(frame: FplacesPositionFrame): void {
    if (
      frame.source !== 'simulator' &&
      isHeadingOnlyPositionFix(this.lastProviderFix, frame)
    ) {
      this.blueDotService?.applyHeadingOnly(frame.heading);
      if (isArFrameVisible() || isArSessionActive(this.store.get().arPresentation)) {
        const now = performance.now();
        if (now - this.lastArProviderStreamAt >= 90) {
          this.lastArProviderStreamAt = now;
          dispatchPositionToAr(frame);
        }
      }
      return;
    }
    this.lastProviderFix = {
      latitude: frame.latitude,
      longitude: frame.longitude,
    };

    const projected =
      frame.source === 'simulator'
        ? frame
        : this.projectFrameOntoRoute(frame);

    this.ingestPositionFrame(projected);

    if (isArFrameVisible() || isArSessionActive(this.store.get().arPresentation)) {
      if (projected.source === 'simulator') {
        // Full simulator clock at 10 Hz - single source of truth for AR.
        syncNavigationToAr(this.getNavigationProgressSnapshot());
      } else if (this.liveRouteTracking || this.store.get().routeSimulating) {
        const now = performance.now();
        if (now - this.lastArProviderStreamAt >= 90) {
          this.lastArProviderStreamAt = now;
          syncNavigationToAr(this.getNavigationProgressSnapshot());
        }
      } else {
        const now = performance.now();
        if (now - this.lastArProviderStreamAt >= 90) {
          this.lastArProviderStreamAt = now;
          dispatchPositionToAr(projected);
        }
      }
    }

    const drivesMapAvatar =
      this.activePositionSource === 'simulator' ||
      PositionProviderRegistry.isLiveHardwareSource(this.activePositionSource);

    if (drivesMapAvatar) {
      this.blueDotService?.applySimulatorFrame(projected);
      const tracking =
        this.activePositionSource === 'simulator'
          ? this.store.get().routeSimulating || this.store.get().routeSimulationComplete
          : this.liveRouteTracking ||
            this.store.get().routeSimulating ||
            this.store.get().routeSimulationComplete;
      if (tracking) {
        this.routePlanner?.updateTravelledPath({
          latitude: projected.latitude,
          longitude: projected.longitude,
          floorId: projected.floorId ?? 'unknown',
        });
      }
      if (this.activePositionSource === 'simulator') {
        this.syncRouteProgress();
      } else if (typeof projected.alongPathMeters === 'number') {
        this.syncLiveRouteProgress(projected.alongPathMeters, {
          offRouteMeters: projected.offRouteMeters,
        });
      }
    } else if (isArSessionActive(this.store.get().arPresentation)) {
      this.blueDotService?.applyProviderFrame(projected);
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
      this.store.get().simulationEnabled
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

  private maybePromptLocation(): void {
    // Location is requested explicitly during the post-auth location gate.
    if (!this.store.get().onboardingComplete) return;
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

  /**
   * Enable Location CTA - request permission via Geolocation API, then read coords.
   */
  async enableLocationPermission(): Promise<void> {
    await this.runLocationGateRequest({ fromPermissionRequired: false });
  }

  /** Try Again on Location Permission Required. */
  async retryLocationPermission(): Promise<void> {
    const permanentlyDenied = await this.locationService.isPermanentlyDenied();
    if (permanentlyDenied) {
      this.store.patch({
        authStep: 'location-required',
        locationPermanentlyDenied: true,
        locationGateLoading: false,
        locationGateError: null,
      });
      return;
    }
    await this.runLocationGateRequest({ fromPermissionRequired: true });
  }

  /** Retry on Location Error - permission already granted; re-read position. */
  async retryLocationRetrieval(): Promise<void> {
    await this.runLocationGateRequest({ fromPermissionRequired: false });
  }

  private async runLocationGateRequest(options: {
    fromPermissionRequired: boolean;
  }): Promise<void> {
    if (this.store.get().locationGateLoading) return;

    // Show progress immediately and keep the underlying auth screen frozen
    // (authStepBeforeLocation) before any async permission / GPS work.
    const currentStep = this.store.get().authStep;
    this.store.patch({
      authStep: options.fromPermissionRequired
        ? 'location-required'
        : currentStep === 'location-error'
          ? 'location-error'
          : 'location-permission',
      locationGateLoading: true,
      locationPermanentlyDenied: false,
      locationGateError: null,
    });

    try {
      const permission = await this.locationService.queryPermission();
      const preflight = resolveLocationGatePreflight(permission);

      if (preflight.action === 'error-unsupported') {
        this.store.patch({
          authStep: 'location-error',
          locationGateLoading: false,
          locationGateError:
            'Geolocation is not supported in this browser. Try another browser or device.',
        });
        return;
      }

      if (preflight.action === 'required-permanent') {
        this.store.patch({
          authStep: 'location-required',
          locationPermanentlyDenied: true,
          locationGateLoading: false,
          locationGateError: null,
        });
        return;
      }

      const coords = await this.locationService.requestLocation();
      // Keep the dialog + underlying screen until continueAfterLocationGranted
      // swaps authStep in one patch (avoids flashing Find places behind).
      this.store.patch({
        userLocation: coords,
        locationGateError: null,
        locationPermanentlyDenied: false,
      });
      await this.continueAfterLocationGranted();
      void this.maybeAutoStartBlueDot();
    } catch (error) {
      const permanentlyDenied =
        this.locationService.isPermissionDeniedError(error)
          ? await this.locationService.isPermanentlyDenied()
          : false;
      const failure = resolveLocationGateFailure(
        error,
        permanentlyDenied,
        (err) =>
          err instanceof Error ||
          (typeof err === 'object' &&
            err !== null &&
            'code' in err &&
            typeof (err as GeolocationPositionError).code === 'number')
            ? this.locationService.geolocationErrorMessage(
                err as GeolocationPositionError | Error,
              )
            : 'Could not get your location.',
      );

      if (failure.action === 'required') {
        this.store.patch({
          authStep: 'location-required',
          locationGateLoading: false,
          locationPermanentlyDenied: failure.permanentlyDenied,
          locationGateError: null,
        });
        return;
      }

      this.store.patch({
        authStep: 'location-error',
        locationGateLoading: false,
        locationGateError: failure.message,
      });
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

function mapNotificationToItem(
  notification: AppNotification,
): NotificationItem {
  return {
    id: notification.id,
    title: notification.title,
    body: notification.body,
    isRead: notification.is_read,
    notificationType: notification.notification_type,
    venueId: notification.venue,
    createdAt: notification.created_at,
    updatedAt: notification.updated_at,
  };
}

function notificationItemToDomain(
  item: NotificationItem,
): AppNotification {
  return {
    id: item.id,
    title: item.title,
    body: item.body,
    is_read: item.isRead,
    notification_type: item.notificationType,
    venue: item.venueId,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}
