import { beginLocationButtonTrace } from '../position/debug/location-button-trace';
import { geoToLocalMeters } from '../utils/geo-math';
import { resolveVenueSimulationAnchor } from '../position/domain/venue-simulation-anchor';
import { haversineMeters } from '../utils/geo-math';
import { createStationaryPositionFilter } from '../position/domain/stationary-position-filter';
import { navigationDiagnostics as navDiag } from '../position/debug/navigation-diagnostics';
import { recordLocationDiagnostic } from '../location/domain/location-diagnostics';
import { show3dMap } from "@mappedin/mappedin-js";
import type { MapData, MapView } from "@mappedin/mappedin-js";

import { appConfig } from "../config";
import { VenueGpsReference } from '../position/domain/venue-gps-reference';
import { recordPhonePosition } from '../position/debug/phone-position-report';
import { isHeadingOnlyPositionFix } from "../position/domain/heading-only-frame";
import { FloorOrchestrator } from "../position/debug/floorOrchestrator";
import { positionTelemetry } from "../position/debug/telemetryLogger";
import {
  closeArFullscreen,
  buildArUrl,
  buildArRoutePayloadForHandoff,
  dispatchPositionToAr,
  isArFrameVisible,
  isArSameOrigin,
  notifyArIframePermissions,
  openArFullscreen,
  setArMaximized,
  setArMinimized,
  syncNavigationToAr,
  warmArIframe,
  type NavigationProgressSnapshot,
} from "./ar-service";
import { coordinateTransformationService } from "../routing/coordinate-transformation-service";
import { navigationStateSynchronizer } from "../routing/navigation-state-synchronizer";
import { routeLifecycleManager } from "../routing/route-lifecycle-manager";
import {
  advanceContinuousAlongMeters,
  computeLiveRemainingMeters,
  hasArrivedAtDestination,
  LiveAlongPathStabilizer,
  resolveLiveNavigationStartAlongMeters,
} from "../routing/route-progress";
import { describePositionFixQuality, isUsableDisplayFix, isUsableLiveFix, isUsableRouteSnap } from "../position/domain/live-fix-quality";
import type { PositionProviderStatus } from "../position/positionProvider";
import { DEFAULT_MAX_ALONG_DELTA_METERS } from "../routing/snap-along-continuity";
import { isArrivalLocked } from "../routing/arrival-lock";
import {
  parseCoordinateNumber,
  shouldPublishUserLocation,
} from "../location/domain/user-relative-distance";
import {
  arNotAtVenueCopy,
  myLocationNotAtVenueCopy,
  remoteArEnabled,
  userVenuePresence,
  venuePresenceAnchor,
} from "../location/domain/venue-presence";
import {
  postingNotAtVenueCopy,
  remoteVenuePostingEnabled,
} from "../forum/domain/venue-posting";
import type { PermissionChoice } from "../permissions/domain/permission-choice";
import {
  AuthApiError,
  clearStoredAuthTokens,
  clearAllVenueSelections,
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
  savePasswordCredential,
  loadSavedPasswordCredential,
  signInWithGoogle,
  updateCurrentUser,
  userNeedsPseudoName,
  verifyEmail,
  type VenueSelection,
  type SavedPasswordCredential,
} from "./auth-service";
import {
  containsTokenNotValidDetail,
  shouldDeferSessionRecoveryUi,
} from "../auth/domain/invalid-access-token";
import {
  isAuthCredentialFailure,
  isInvalidAccessTokenFailure,
  type AuthSessionClearedReason,
} from "../auth/data/datasources/api-client";
import { resolveMapBootErrorMessage } from "../map/domain/map-boot-error";
import { resolveUserFacingApiErrorMessage } from "../auth/domain/user-facing-api-error";
import { consumePasswordResetLink } from "../auth/domain/password-reset-link";
import { evaluatePasswordStrength } from "../auth/domain/password-strength";
import { withRecentPostUpvotes } from "../auth/domain/profile-recent-posts";
import type { AuthUser } from "../auth/domain/entities";
import { interestOptionsAfterFetch } from "../auth/domain/interest-options";
import {
  guestDenialUserMessage,
  initializeFingerprint,
  isGuestMode,
  markGuestArViewTried,
  registerCurrentGuestFingerprint,
  resolveGuestArEligibility,
  validateCurrentGuestAccess,
} from "./guest-access-service";
import {
  resolveMappedinMapCredentials,
  toGetMapDataAuth,
} from "./maps-service";
import {
  clearDeviceHasUsedApp,
  clearReturningSession,
  hasDeviceUsedApp,
  isReturningSession,
  loadReturningSession,
  markDeviceHasUsedApp,
  remainingStartupSplashMs,
  resolveStartupDestination,
  saveReturningSession,
  type ReturningSessionSnapshot,
} from "./session-service";
import { homeRepository } from "../home/data/home-repository-impl";
import { venueVisitRepository } from "../home/data/venue-visit-repository-impl";
import { partitionHomeVenues } from "../home/domain/home-venues";
import { homeVenueRowFromCatalog } from "../home/presentation/returning-home-data";
import {
  resolveHomeExperience,
  type HomeExperience,
  type RecentVenueVisit,
} from "../home/domain/entities";
import { isCompleteOtpCode } from "../auth/domain/otp-code";
import {
  loadAppPreferences,
  patchAppPreferences,
} from "./app-preferences-service";
import {
  clearProductTourProgress,
  contextualProductTourStep,
  initialProductTourSteps,
  isProductTourDontShowAgain,
  loadProductTourPreference,
  nextProductTourIndex,
  preferenceAfterProductTourEnable,
  preferenceAfterProductTourOptOut,
  previousProductTourIndex,
  productTourStepsByIds,
  saveProductTourPreference,
  shouldAutoStartProductTour,
  type ProductTourSurface,
} from "./product-tour-service";

const AR_ROUTE_PROMPT_TOUR_ID = "ar-route-prompt";
import {
  createForumComment,
  createForumPost,
  deleteForumComment,
  deleteForumPost,
  flagForumPost,
  listAllVenues,
  listAllSections,
  getForumVenue,
  listForumComments,
  listLocationMessages,
  listVenuePosts,
  loadAllVenueConversations,
  loadForumCommentCounts,
  loadInitialVenueFeed,
  loadVenueCatalog,
  listActiveInterestNames,
  subscribeVenueLiveFeed,
  toggleForumPostUpvote,
  updateForumPost,
  FORUM_POST_CONTENT_MAX_LENGTH,
  type ForumComment,
  type ForumPost,
  type LocationLiveSubscription,
  type VenueLiveEvent,
  type VenueLiveSubscription,
} from "./forum-service";
import { flaggedPostsLocalDatasource } from "../forum/data/datasources/flagged-posts-local-datasource";
import {
  applyPersonalNotificationEvent,
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
} from "./notifications-service";
import {
  appendCommentOnce,
  mapForumCommentsToItems,
  mapForumCommentToItem,
} from "../ui/post-comments-data";
import {
  getCurrentMapLanguage,
  getSupportedMapLanguages,
  loadPreferredMapLanguage,
  savePreferredMapLanguage,
} from "./map-language-service";
import { resolveMapData } from "./map-offline-service";
import { BlueDotService } from "./blue-dot-service";
import type { PositionProvider } from "../position/positionProvider";
import { PositionProviderRegistry } from "../position/providerRegistry";
import { requestDeviceOrientationPermission } from "../position/providers/gpsProvider";
import {
  beginArMediaPermissionPrime,
  consumeArMediaPermissionPrime,
  shouldRequestArMotionPermission,
  shouldReuseGrantedArCamera,
} from "./media-permission-service";
import type {
  FplacesPositionFrame,
  PositionSourceType,
} from "../position/types";
import {
  scheduleSocialMapMarkers,
  type LocationCardSelection,
  type SocialMapMarkerService,
} from "../map/social-map-markers";
import { LocationService } from "./location-service";
import {
  isLocationGateAuthStep,
  resolveLocationGateEntry,
  resolveLocationGateFailure,
  resolveLocationGatePreflight,
} from "../location/domain/location-gate";
import { permissionChoiceLocalDatasource } from "../permissions/data/datasources/permission-choice-local-datasource";
import {
  LOCATION_NOT_ROUTABLE_MESSAGE,
  toUserFacingRouteError,
} from "../routing/constants";
import { RoutePlanner } from "./route-planner";
import {
  resolveMapTarget,
  getLocationChips,
  searchVenue,
} from "./search-service";
import { AppStore } from "../state/app-store";
import type {
  AppState,
  AppTab,
  BlueDotStatus,
  FloorInfo,
  ForumSectionSummary,
  ForumVenueSummary,
  LocationResult,
  NavigateView,
  NotificationItem,
  RegisteredUser,
  RouteCoordinate,
  RoutePayload,
  SocialCategory,
  SocialPageTab,
  UserLocationCoords,
  VenueFeedFilter,
  VenueFeedPost,
} from "../types";
import {
  clearStoredAuthUser,
  isArSessionActive,
  loadStoredUser,
  storeAuthUser,
} from "../types";
import { installCameraFollowRelease } from "../map/camera-follow-release";
import {
  clientPointToCanvasPoint,
  resolveMapCanvasRect,
} from "../map/map-tap-screen";
import { inferAreaHint } from "../ui/route-summary";
import {
  SOCIAL_CATEGORY_LABELS,
  SOCIAL_LOCATIONS_BY_ID,
  SOCIAL_QUICK_TAG_LABELS,
} from "../ui/social-data";
import {
  appendOlderVenueFeedPosts,
  applyCommentCounts,
  isConversationFeedItem,
  mapForumPostToVenueFeed,
  mapForumPostsToVenueFeed,
  mapLocationMessagesToVenueFeed,
  nextFeedPageFromUrl,
  VENUE_ALL_CONVERSATIONS_NEXT,
} from "../ui/venue-feed-data";
import { generatePseudoName } from "../ui/pseudo-name-data";
import { defaultSectionId } from "../ui/venue-select-data";
import {
  venueMapLoadKey,
  venueMapLoadRequest,
  type VenueMapLoadRequest,
} from "../forum/domain/venue-map-source";
import {
  isPartialForumPostPayload,
  resolveToggledUpvoteCount,
} from "../forum/domain/post-upvote";
import { legInstructions } from "../utils/route-helpers";
import { appLog, appWarn } from "../utils/logger";
import { serializeCoordinate } from "../utils/route-helpers";
import {
  clampVenueZoom,
  isWorldScaleZoom,
  SHOW_VENUE_MAP_OPTIONS,
  VENUE_CAMERA_INTERACTIONS,
  VENUE_MAP_MIN_ZOOM,
} from "../map/domain/venue-map-view";

type EnterVenueOptions = {
  welcomeToast?: boolean;
  /** Location was already granted after create / sign-in / guest. */
  skipLocationGate?: boolean;
  /** Signed-in session restore lands on Recently visited, not first-visit. */
  homeExperience?: HomeExperience;
  /** Home venue tap lands on the indoor map instead of bouncing through home. */
  landOn?: NavigateView;
  /** Internal venue switches can preserve a non-home tab while choosing a view. */
  activeTab?: AppTab;
  /** Caller already holds `venueEnterInFlight`. */
  holdEnterLock?: boolean;
};

export class MapApp {
  private venueGpsReference: VenueGpsReference | null = null;
  private venueGpsReferenceId: string | null = null;
  private lastBlueDotAvailabilityReason: string | null = null;

  get isVenueGeolocationSimulationActive(): boolean {
    return this.venueGpsReference != null;
  }

  private initializeVenueGpsReference(): void {
    if (!appConfig.positioning.enableVenueGeolocationSimulation) return;
    const venueId = this.store.get().selectedVenueId;
    if (!venueId) return;
    if (this.venueGpsReference && this.venueGpsReferenceId === venueId) {
      this.initializeVenueSimulationMapAnchor();
      return;
    }
    navDiag?.record('simulation-reset', 'MapApp.initializeVenueGpsReference', { venueId, previousVenueId: this.venueGpsReferenceId, reason: 'new-reference-instance' });
    const selectedVenue = this.store.get().forumVenues.find(v => String(v.id) === venueId);
    navDiag?.update('venue-reference', 'MapApp.initializeVenueGpsReference', { venueReference: { latitude: selectedVenue?.latitude == null ? null : Number(selectedVenue.latitude), longitude: selectedVenue?.longitude == null ? null : Number(selectedVenue.longitude) } });
    const reference = new VenueGpsReference({ id: venueId, name: selectedVenue?.name });
    this.venueGpsReference = reference;
    this.venueGpsReferenceId = venueId;
    this.initializeVenueSimulationMapAnchor();
    this.blueDotService?.setSimulatorParallelMode(true, { compassGlow: true });
    void this.locationService.getCurrentPosition({ timeoutMs: 8000, maximumAgeMs: 0 }).then(position => {
      if (this.venueGpsReference !== reference) return;
      const coords = position.coords;
      if (!isUsableDisplayFix({ latitude: coords.latitude, longitude: coords.longitude,
        accuracy: coords.accuracy, timestamp: position.timestamp, source: 'gps' })) return;
      reference.capture(coords);
      this.publishUserLocation(coords);
      this.handleProviderFrame({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy, timestamp: position.timestamp, source: 'gps' });
      appLog('Position', 'Development GPS reference captured; using the loaded venue map anchor');
    }).catch(error => {
      if (this.venueGpsReference !== reference) return;
      appWarn('Position', 'Development GPS reference unavailable', error);
    });
  }
  private initializeVenueSimulationMapAnchor(): void {
    const reference = this.venueGpsReference;
    if (!reference || reference.diagnosticSnapshot().mapAnchor || !this.mapData) return;
    const state = this.store.get();
    const section = state.forumSections.find(item => String(item.id) === state.selectedGateId);
    const anchor = resolveVenueSimulationAnchor(this.mapData,
      this.mapView?.currentFloor?.id ?? state.currentFloorId ?? undefined,
      section?.mappedinLocationId);
    if (!anchor) {
      this.reportBlueDotAvailability('simulation-map-anchor-unavailable');
      return;
    }
    reference.anchor(anchor.coordinate, { source: anchor.source, objectId: anchor.objectId, name: anchor.name });
  }

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
  private splashShownAt = 0;
  private splashReadyHold: Promise<void> | null = null;
  /** Local destination applied under splash; skip the auth spinner until splash lifts. */
  private shellDestinationApplied = false;
  private autoRoutePending = false;
  private locationPromptShown = false;
  private locationGateRequestId = 0;
  private lastProgressUiAt = 0;
  /** True while GPS/live navigation is actively tracking along the route (Begin pressed or mid-switch). */
  private liveRouteTracking = false;
  /** Holds remaining distance/time while indoor GPS jitters and the user is standing still. */
  private readonly alongPathStabilizer = new LiveAlongPathStabilizer();
  /** Last route-snap along meters from a live fix (used to seed Begin without yanking to 0). */
  private lastProjectedAlongMeters: number | null = null;
  private lastAlongPublishAt = 0;
  private stopUserLocationWatch: (() => void) | null = null;
  private lastPublishedUserLocation: UserLocationCoords | null = null;
  private lastUserLocationPublishAt = 0;
  private providerPositionFilter?: ReturnType<typeof createStationaryPositionFilter>;
  private providerFilterIdentity?: string;
  private approximatePositionFilter?: ReturnType<typeof createStationaryPositionFilter>;
  private approximateFilterIdentity?: string;
  private lastNavigationPosition?: { route: RoutePayload; frame: FplacesPositionFrame };
  private lastProviderFix: { latitude: number; longitude: number; timestamp?: number } | null =
    null;
  private mapGestureGuard: {
    dispose: () => void;
    shouldIgnoreMapClick: () => boolean;
    getLastPointerClient: () => { x: number; y: number } | null;
  } | null = null;
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private searchGeneration = 0;
  private authFlowBootstrapped = false;
  /** When session dies during splash, finish map load then open sign-in or create-account. */
  private pendingSessionRecovery: AuthSessionClearedReason | null = null;
  private authResumeInFlight = false;
  private venueEnterInFlight = false;
  private handlingSessionExpiry = false;
  private interestOptionsLoaded = false;
  /** One-shot: focus map search after the next UI paint (Try AR flow). */
  private pendingMapSearchFocus = false;
  /** Skip without “don’t show again” hides the tour until the next app launch. */
  private productTourDismissedThisSession = false;
  /** In-memory only - used to obtain JWTs after email verification. */
  private pendingAuthPassword: string | null = null;
  private socialMapMarkers: SocialMapMarkerService | null = null;
  /** Receive-only venue room socket; opened right after the initial feed fetch. */
  private venueLiveSubscription: VenueLiveSubscription | null = null;
  private locationLiveSubscription: LocationLiveSubscription | null = null;
  /** Receive-only personal notifications socket (cross-venue, account-level). */
  private personalNotificationsSubscription: PersonalNotificationSubscription | null =
    null;
  private personalNotificationsBootstrapInFlight = false;
  private venueFeedCreateInFlight = false;
  private readonly venueFeedUpvoteInFlight = new Set<string>();
  private readonly venueFeedFlagInFlight = new Set<string>();
  /** Dedupes REST comment creates against venue-room `new_comment` echoes. */
  private readonly seenForumCommentIds = new Set<number>();
  private venueFeedCommentCountsInFlight = false;
  /** Home shout-out posts parked while the social conversation tab is open. */
  private homeFeedSnapshot: {
    posts: VenueFeedPost[];
    next: string | null;
    count: number;
  } | null = null;
  /** All-conversations feed parked while a single section thread is open. */
  private venueWideFeedSnapshot: {
    posts: VenueFeedPost[];
    next: string | null;
    count: number;
    conversationNextPages?: Map<string, number>;
  } | null = null;
  private allConversationNextPages = new Map<string, number>();
  private venueFeedScopeGeneration = 0;
  private restoringVenueView = false;
  private mapContainer: HTMLElement | null = null;
  private loadedMapKey: string | null = null;
  private loadedVenueMapId: string | null = null;
  private mapLoadGeneration = 0;
  private mapLoadInFlight: Promise<void> | null = null;
  private mapLoadInFlightKey: string | null = null;
  private socialMarkerSyncUnsub: (() => void) | null = null;

  constructor(private readonly store: AppStore) {
    const preferences = loadAppPreferences();
    const storedLocation = permissionChoiceLocalDatasource.loadLocation();
    const tourPreference = loadProductTourPreference();
    this.store.patch({
      notificationsEnabled: preferences.notificationsEnabled,
      simulationEnabled: preferences.simulationEnabled,
      productTourCompleted: tourPreference.completed,
      productTourEnabled: tourPreference.enabled,
      locationPermission: storedLocation,
    });
    if (storedLocation === "granted") {
      this.startLiveUserLocationWatch();
    }
    onAuthSessionCleared((reason) => {
      this.handleAuthSessionExpired(reason);
    });
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          this.restoreVenueMapView();
          void this.refreshLocationGateAfterBrowserSettingsChange();
        }
      });
      window.addEventListener("focus", () => {
        void this.refreshLocationGateAfterBrowserSettingsChange();
      });
      window.setInterval(() => {
        void this.refreshLocationGateAfterBrowserSettingsChange();
      }, 750);
    }
  }

  /**
   * Browser permission changes happen outside the app. Re-check when the tab
   * returns so a stale Location is off dialog closes after the user allows it.
   */
  private async refreshLocationGateAfterBrowserSettingsChange(): Promise<void> {
    const state = this.store.get();
    if (
      state.authStep !== "location-required" ||
      !state.locationPermanentlyDenied ||
      state.locationGateLoading
    ) return;
    // Keep the dialog visibly checking while the browser applies a changed
    // site permission. This also catches settings changes without a reload.
    this.store.patch({ locationGateLoading: true });
    const permission = await this.locationService.queryPermission();
    if (permission !== "granted") {
      if (this.store.get().authStep === "location-required") {
        this.store.patch({ locationGateLoading: false });
      }
      return;
    }
    await this.runLocationGateRequest({
      fromPermissionRequired: false,
      forceRequestWhenDenied: true,
    });
  }

  private syncSocialMapMarkers(state = this.store.get()): void {
    const posts = state.socialLocation
      ? this.homeFeedSnapshot?.posts ?? []
      : state.venueFeedPosts;
    this.socialMapMarkers?.syncState({ ...state, venueFeedPosts: posts });
  }

  async start(mapContainer: HTMLElement): Promise<void> {
    this.mapContainer = mapContainer;
    this.splashShownAt = Date.now();
    this.store.patch({
      mapStatus: "loading",
      loadingMessage: "Loading map…",
      loadingProgress: 28,
    });

    // Warm FingerprintJS in parallel with map load (no backend call yet).
    void initializeFingerprint().catch((error) => {
      appWarn("Guest", "Fingerprint agent failed to initialize", error);
    });

    this.socialMarkerSyncUnsub?.();
    this.socialMarkerSyncUnsub = this.store.subscribe((state) => {
      navDiag?.metadata({ venueId: state.selectedVenueId, venueName: state.forumVenues.find(v => String(v.id) === state.selectedVenueId)?.name ?? null, floorId: state.currentFloorId,
        simulationEnabled: !!this.venueGpsReference, navigationActive: this.liveRouteTracking || state.routeSimulating,
        arActive: state.arPresentation !== 'closed', routeId: state.route?.routeId,
        routeVersion: state.route?.routeVersion, trackingState: state.blueDotStatus });
      navDiag?.update('store', 'MapApp.store', { alongPathMeters: state.routeTraveledMeters,
        remainingMeters: state.routeRemainingMeters, arrivalLatch: state.routeSimulationComplete,
        arrivalDialogOpen: state.arrivalDialogOpen, currentLegIndex: state.currentLegIndex });
      if (state.mapStatus !== "ready") return;
      this.syncSocialMapMarkers(state);
    });

    this.revealStartupShell();
    void this.bootstrapAuthFlow();
    if (this.shouldDeferInitialMapLoad()) {
      // Session restore loads the venue's mappedin_map_id in enterSelectedVenue.
      return;
    }
    void this.loadMappedinScene(
      mapContainer,
      this.selectedVenueMapLoadRequest(),
    );
  }

  /**
   * Dismiss the orange splash from local storage only (no map / network).
   * Token-only restore keeps splash until bootstrap routes away from welcome.
   * Splash stays up for a minimum duration so the loader does not flash off.
   */
  private revealStartupShell(): void {
    if (this.tryOpenPasswordResetFromUrl()) {
      this.shellDestinationApplied = true;
      this.ensureStartupReady();
      return;
    }

    const returning =
      loadReturningSession() ?? this.inferReturningSessionFromLocalAuth();
    const destination = resolveStartupDestination({
      hasReturningSession: isReturningSession(returning),
      hasAuthTokens: hasStoredAuthTokens(),
      deviceHasUsedApp: hasDeviceUsedApp() || Boolean(loadStoredUser()),
    });

    if (destination === "app" && isReturningSession(returning)) {
      this.shellDestinationApplied = true;
      this.store.patch({
        onboardingComplete: true,
        selectedVenueId: returning.selectedVenueId,
        selectedGateId: returning.selectedGateId,
        guestId: returning.guestId ?? this.store.get().guestId,
        authStep: "none",
        authStepBeforeLocation: null,
        authLoading: true,
        authFieldErrors: {},
        navigateView: "home",
        homeExperience: "returning",
      });
      this.ensureStartupReady();
      return;
    }

    if (destination === "sign-in") {
      this.shellDestinationApplied = true;
      markDeviceHasUsedApp();
      this.store.patch({
        authLoading: false,
        authFieldErrors: {},
        authLegalDocument: null,
        legalWebView: null,
      });
      this.showLogin();
      this.ensureStartupReady();
      return;
    }

    if (destination === "marketing") {
      this.shellDestinationApplied = true;
      this.store.patch({
        authStep: "none",
        authLoading: false,
        authFieldErrors: {},
      });
      this.ensureStartupReady();
    }
  }

  private ensureStartupReady(): void {
    if (this.store.get().startupReady) return;
    if (!this.splashReadyHold) {
      this.splashReadyHold = this.holdSplashThenReady();
    }
  }

  private async holdSplashThenReady(): Promise<void> {
    const remaining = remainingStartupSplashMs(this.splashShownAt, Date.now());
    if (remaining > 0) {
      await new Promise((resolve) => {
        setTimeout(resolve, remaining);
      });
    }
    if (!this.store.get().startupReady) {
      this.store.patch({ startupReady: true });
    }
    this.applyPendingSessionRecovery();
  }

  private shouldDeferInitialMapLoad(): boolean {
    // Do not request Mappedin credentials or load the default map on app
    // launch. Map loading starts after the authenticated user selects a venue.
    return true;
  }

  private selectedVenueMapLoadRequest(): VenueMapLoadRequest {
    const state = this.store.get();
    const venue = state.forumVenues.find(
      (item) => String(item.id) === state.selectedVenueId,
    );
    const request = venueMapLoadRequest({
      mappedinMapId: venue?.mappedinMapId,
      defaultMapId: appConfig.mappedin.mapId,
    });
    appLog("VenueMap", "Selected venue map request", {
      selectedVenueId: state.selectedVenueId,
      venueName: venue?.name,
      venueLocation: venue?.location,
      venueMappedinMapId: venue?.mappedinMapId,
      requestMapId: request.mapId,
      defaultMapId: appConfig.mappedin.mapId,
    });
    return request;
  }

  private async ensureSearchVenueContext(): Promise<void> {
    if (!this.store.get().forumVenues.length) {
      appLog("NavigateSearch", "Venue catalog missing; loading before search");
      await this.ensureForumVenuesForHome();
    }

    const state = this.store.get();
    if (state.selectedVenueId) {
      const venue = state.forumVenues.find(
        (item) => String(item.id) === state.selectedVenueId,
      );
      appLog("NavigateSearch", "Using already selected venue for search", {
        selectedVenueId: state.selectedVenueId,
        venueName: venue?.name,
        mapStatus: state.mapStatus,
        hasMapData: Boolean(this.mapData),
        hasRoutePlanner: Boolean(this.routePlanner),
      });
      return;
    }

    const visitedIds = venueVisitRepository.listVisited();
    const recentVenueId = [...visitedIds].reverse()
      .find((id) =>
        state.forumVenues.some((venue) => String(venue.id) === id.trim()),
      );
    const homeFallbackVenue =
      state.homeContent?.recentlyVisited[0] ?? state.homeContent?.otherVenues[0];
    const venue =
      (recentVenueId
        ? state.forumVenues.find((item) => String(item.id) === recentVenueId)
        : null) ??
      (homeFallbackVenue
        ? state.forumVenues.find(
            (item) =>
              String(item.id) === homeFallbackVenue.id ||
              item.name.toLowerCase() === homeFallbackVenue.name.toLowerCase(),
          )
        : null) ??
      state.forumVenues[0];

    if (!venue) {
      appWarn("NavigateSearch", "No venue available for Navigate search", {
        visitedIds,
        homeContentLoaded: Boolean(state.homeContent),
        forumVenueCount: state.forumVenues.length,
      });
      return;
    }

    appLog("NavigateSearch", "Selected fallback venue for fresh search", {
      selectedVenueId: String(venue.id),
      venueName: venue.name,
      source: recentVenueId
        ? "most-recent-visit"
        : homeFallbackVenue
          ? "home-content"
          : "first-forum-venue",
      visitedIds,
      homeFallbackVenueId: homeFallbackVenue?.id,
      forumVenueCount: state.forumVenues.length,
    });

    this.store.patch({
      selectedVenueId: String(venue.id),
      selectedFloorId: null,
      forumFloors: [],
      selectedGateId: null,
      forumSections: [],
      forumCategories: [],
    });
  }

  private async ensureMapForSelectedVenue(): Promise<void> {
    if (!this.mapContainer) return;
    const state = this.store.get();
    const selectedVenue = state.forumVenues.find(
      (item) => String(item.id) === state.selectedVenueId,
    );
    if (
      state.selectedVenueId &&
      selectedVenue &&
      !selectedVenue.mappedinMapId?.trim()
    ) {
      const message = `${selectedVenue.name} needs a Mappedin map configured.`;
      appWarn("VenueMap", "Selected venue is missing mappedinMapId", {
        selectedVenueId: state.selectedVenueId,
        venueName: selectedVenue.name,
        venueLocation: selectedVenue.location,
        defaultMapId: appConfig.mappedin.mapId,
      });
      this.store.patch({
        mapStatus: "error",
        mapError: message,
        loadingMessage: message,
        loadingProgress: 100,
      });
      return;
    }
    const request = this.selectedVenueMapLoadRequest();
    const key = venueMapLoadKey(request);
    if (this.loadedMapKey === key && this.mapView) {
      this.initializeVenueGpsReference();
      void this.maybeAutoStartBlueDot();
      return;
    }
    if (this.mapLoadInFlight && this.mapLoadInFlightKey === key) {
      await this.mapLoadInFlight;
      return;
    }
    if (this.routePlanner) {
      try {
        await this.clearRoutePoints();
      } catch {
        /* previous map may already be tearing down */
      }
    }
    const load = this.loadMappedinScene(this.mapContainer, request);
    this.mapLoadInFlight = load;
    this.mapLoadInFlightKey = key;
    try {
      await load;
    } finally {
      if (this.mapLoadInFlight === load) {
        this.mapLoadInFlight = null;
        this.mapLoadInFlightKey = null;
      }
    }
  }

  private teardownMappedinScene(options?: { cancelInFlight?: boolean }): void {
    navDiag?.record('map-lifecycle', 'MapApp.teardownMappedinScene', { reason: 'map-replacement-or-exit', previousState: { mapId: this.loadedVenueMapId }, newState: { renderer: null } });
    this.venueGpsReference = null;
    this.venueGpsReferenceId = null;
    if (options?.cancelInFlight) {
      this.mapLoadGeneration += 1;
      this.mapLoadInFlight = null;
      this.mapLoadInFlightKey = null;
    }
    this.stopPositionProvider();
    this.mapGestureGuard?.dispose();
    this.mapGestureGuard = null;
    this.socialMapMarkers?.destroy();
    this.socialMapMarkers = null;
    this.blueDotService?.destroy();
    this.blueDotService = null;
    this.routePlanner = null;
    try {
      this.mapView?.destroy();
    } catch {
      /* already torn down */
    }
    this.mapView = null;
    this.mapData = null;
    this.loadedMapKey = null;
    this.loadedVenueMapId = null;
  }

  private async loadMappedinScene(
    mapContainer: HTMLElement,
    request: VenueMapLoadRequest,
  ): Promise<void> {
    const generation = ++this.mapLoadGeneration;
    this.teardownMappedinScene();
    if (this.initTimeout) clearTimeout(this.initTimeout);
    this.initTimeout = setTimeout(() => {
      const state = this.store.get();
      if (
        state.mapStatus !== "ready" &&
        generation === this.mapLoadGeneration
      ) {
        this.showToast(
          "Map is taking longer than expected. Check your network connection.",
        );
      }
    }, appConfig.mapInitTimeoutMs);

    this.store.patch({
      mapStatus: "loading",
      loadingMessage: "Getting map credentials…",
      loadingProgress: 32,
    });

    try {
      const preferredLanguage = loadPreferredMapLanguage();
      const offline =
        typeof navigator !== "undefined" && navigator.onLine === false;
      if (offline) {
        this.store.patch({
          loadingMessage: "Loading cached map…",
          loadingProgress: 35,
        });
      }

      const mapCredentials = await resolveMappedinMapCredentials(request);
      if (generation !== this.mapLoadGeneration) return;
      const resolved = await resolveMapData({
        ...toGetMapDataAuth(mapCredentials),
        mapId: mapCredentials.mapId,
        ...(preferredLanguage ? { language: preferredLanguage } : {}),
        fallbackToNavigatorLanguage: true,
      });
      if (generation !== this.mapLoadGeneration) return;
      this.mapData = resolved.mapData;

      this.store.patch({
        loadingMessage: resolved.fromCache
          ? "Starting 3D map from cache…"
          : "Starting 3D map…",
        loadingProgress: 55,
      });

      const mapView = await show3dMap(
        mapContainer,
        this.mapData,
        SHOW_VENUE_MAP_OPTIONS,
      );
      if (generation !== this.mapLoadGeneration) {
        try {
          mapView.destroy();
        } catch {
          /* superseded load */
        }
        return;
      }
      this.mapView = mapView;
      this.loadedVenueMapId = mapCredentials.mapId;
      this.loadedMapKey = venueMapLoadKey({
        mapId: mapCredentials.mapId,
      });
      this.disableOutdoorWorldView();
      this.mapView.Camera?.interactions?.set?.(VENUE_CAMERA_INTERACTIONS);
      this.suppressNativeMapBlueDot();
      this.routePlanner = new RoutePlanner(
        this.mapView,
        this.mapData,
        mapCredentials.mapId,
      );
      this.blueDotService = new BlueDotService(this.mapView);
      this.blueDotService.attachHandlers({
        onPosition: (position) => this.handleBlueDotSensorPosition(position),
        onAnimatedPosition: (position) =>
          this.handleBlueDotAnimatedPosition(position),
        onStatus: (status) => this.handleBlueDotStatus(status),
      });
      this.blueDotService.prepare({ simulatorBoot: false });
      this.initializeVenueGpsReference();

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

      if (this.initTimeout) clearTimeout(this.initTimeout);
      this.store.patch({
        mapStatus: "ready",
        loadingMessage: "Ready",
        loadingProgress: 100,
        currentFloorId: this.mapView.currentFloor?.id,
        searchChips: getLocationChips(this.mapData),
        markers: {},
        route: null,
        showRouteSheet: false,
        searchResults: [],
      });

      warmArIframe();
      this.mapGestureGuard?.dispose();
      this.mapGestureGuard = installCameraFollowRelease(
        mapContainer,
        () => this.releaseCameraFollowFromUserPan(),
      );

      this.maybePromptLocation();
      void this.maybeAutoStartBlueDot();
      positionTelemetry.setActiveSource(
        PositionProviderRegistry.resolveActiveSource(),
      );
      appLog("Map", "Ready", this.loadedMapKey);
    } catch (error) {
      if (generation !== this.mapLoadGeneration) return;
      if (this.initTimeout) clearTimeout(this.initTimeout);
      const message =
        error instanceof Error ? error.message : "Map failed to load";
      appWarn("Map", "Init failed", error);

      if (isAuthCredentialFailure(error)) {
        clearStoredAuthTokens();
        clearStoredAuthUser();
        markDeviceHasUsedApp();
        const isGuestReadonly = this.shouldRecoverAuthFailureAsReadonlyGuest();
        if (!isGuestReadonly) {
          clearReturningSession();
        }
        const recovery: AuthSessionClearedReason = isGuestReadonly
          ? "guest-expired"
          : isInvalidAccessTokenFailure(error)
            ? "invalid-token"
            : "expired";
        this.pendingSessionRecovery = recovery;
        const recoveryMessage =
          recovery === "guest-expired"
            ? "Your guest trial has ended. You can still view the map."
            : recovery === "invalid-token"
            ? "Create an account to continue."
            : "Your session expired. Please log in again.";
        this.store.patch({
          authUser: null,
          onboardingComplete: isGuestReadonly
            ? this.store.get().onboardingComplete
            : false,
          mapStatus: "error",
          mapError: recoveryMessage,
          loadingMessage: recoveryMessage,
          loadingProgress: 0,
        });
        if (
          !shouldDeferSessionRecoveryUi({
            startupReady: this.store.get().startupReady,
            authShellVisible: this.shellDestinationApplied,
            authFlowBootstrapped: this.authFlowBootstrapped,
          })
        ) {
          this.applyPendingSessionRecovery();
        }
        return;
      }

      const friendly = resolveMapBootErrorMessage(message);
      this.store.patch({
        mapStatus: "error",
        mapError: friendly,
        loadingMessage: friendly,
        loadingProgress: 0,
      });
      if (this.store.get().startupReady) {
        this.showToast(friendly);
      }
    }
  }

  onSearchInput(query: string): void {
    const state = this.store.get();
    const inputSource =
      state.activeTab === "map" && state.navigateView === "home"
        ? "navigate-home"
        : state.activeTab === "map" && state.navigateView === "map"
          ? "2d-map"
          : state.activeTab;
    appLog("NavigateSearch", "Search input changed", {
      query,
      trimmedLength: query.trim().length,
      inputSource,
      selectedVenueId: state.selectedVenueId,
      mapStatus: state.mapStatus,
      hasMapData: Boolean(this.mapData),
      hasRoutePlanner: Boolean(this.routePlanner),
      currentResults: state.searchResults.length,
    });
    const activeChip = state.searchChips.find(
      (chip) => chip.id === state.categoryFilter,
    );
    const categoryFilter =
      activeChip &&
      activeChip.label.toLowerCase() === query.trim().toLowerCase()
        ? state.categoryFilter
        : null;

    this.store.patch({ searchQuery: query, categoryFilter });

    if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);

    if (!query.trim()) {
      if (this.mapData && this.routePlanner) {
        appLog("NavigateSearch", "Clearing search through map search path");
        void this.submitSearch("");
      } else {
        this.searchGeneration += 1;
        appLog("NavigateSearch", "Clearing search before map is ready");
        this.store.patch({ searchResults: [], isSearching: false });
      }
      return;
    }

    if (!this.mapData || !this.routePlanner) {
      const generation = ++this.searchGeneration;
      appLog("NavigateSearch", "Map not ready; preparing venue context", {
        generation,
        query,
        selectedVenueId: this.store.get().selectedVenueId,
        mapStatus: this.store.get().mapStatus,
      });
      this.store.patch({ searchResults: [], isSearching: true });
      void this.ensureSearchVenueContext()
        .then(() => {
          appLog("NavigateSearch", "Ensuring map for Navigate search", {
            generation,
            query,
            selectedVenueId: this.store.get().selectedVenueId,
          });
          return this.ensureMapForSelectedVenue();
        })
        .then(() => {
          if (generation !== this.searchGeneration) {
            appLog("NavigateSearch", "Ignoring stale map-ready search", {
              generation,
              latestGeneration: this.searchGeneration,
              query,
            });
            return;
          }
          if (this.store.get().searchQuery !== query) {
            appLog("NavigateSearch", "Ignoring search because query changed", {
              generation,
              originalQuery: query,
              currentQuery: this.store.get().searchQuery,
            });
            return;
          }
          appLog("NavigateSearch", "Map ready; submitting search", {
            generation,
            query,
            selectedVenueId: this.store.get().selectedVenueId,
            mapStatus: this.store.get().mapStatus,
            hasMapData: Boolean(this.mapData),
            hasRoutePlanner: Boolean(this.routePlanner),
          });
          return this.submitSearch(query);
        })
        .catch((error) => {
          appWarn("NavigateSearch", "Could not prepare map for search", {
            generation,
            query,
            error,
          });
          if (generation === this.searchGeneration) {
            this.store.patch({ isSearching: false });
          }
        });
      return;
    }

    appLog("NavigateSearch", "Debouncing search on ready map", {
      query,
      selectedVenueId: this.store.get().selectedVenueId,
    });
    this.searchDebounceTimer = setTimeout(() => {
      void this.submitSearch(query);
    }, 250);
  }

  async clearSearch(): Promise<void> {
    if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
    this.store.patch({ categoryFilter: null });
    await this.submitSearch("");
  }

  async submitSearch(query: string): Promise<void> {
    if (!this.mapData || !this.routePlanner) {
      appWarn("NavigateSearch", "submitSearch called before map is ready", {
        query,
        hasMapData: Boolean(this.mapData),
        hasRoutePlanner: Boolean(this.routePlanner),
      });
      return;
    }

    const trimmed = query.trim();
    const generation = ++this.searchGeneration;

    appLog("NavigateSearch", "Submitting search", {
      query,
      trimmed,
      generation,
      selectedVenueId: this.store.get().selectedVenueId,
      mapStatus: this.store.get().mapStatus,
    });

    this.store.patch({ searchQuery: query });

    if (!trimmed) {
      this.routePlanner.clearHighlights();
      this.store.patch({ searchResults: [], isSearching: false });
      appLog("NavigateSearch", "Search cleared");
      return;
    }

    this.store.patch({ isSearching: true });
    const results = await searchVenue(this.mapData, query);
    if (generation !== this.searchGeneration) {
      appLog("NavigateSearch", "Ignoring stale search results", {
        generation,
        latestGeneration: this.searchGeneration,
        query,
        resultCount: results.length,
      });
      return;
    }
    const sectionResults = this.sectionSearchResults(query);
    const mergedResults = [
      ...sectionResults,
      ...results.filter(
        (result) => !sectionResults.some((section) => section.id === result.id),
      ),
    ];

    const targets = mergedResults
      .map((r) => resolveMapTarget(this.mapData!, r.id))
      .filter(Boolean);
    this.routePlanner.highlightSearchResults(targets);
    this.store.patch({ searchResults: mergedResults, isSearching: false });
    appLog("NavigateSearch", "Search results ready", {
      query,
      generation,
      mapResultCount: results.length,
      sectionResultCount: sectionResults.length,
      mergedResultCount: mergedResults.length,
      targetCount: targets.length,
      firstResults: mergedResults.slice(0, 5).map((result) => ({
        id: result.id,
        name: result.name,
        floorName: result.floorName,
      })),
    });
  }

  private sectionSearchResults(query: string): LocationResult[] {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return [];
    return this.store
      .get()
      .forumSections.filter((section) => {
        const haystack = `${section.name} ${section.code}`.toLowerCase();
        return haystack.includes(trimmed);
      })
      .map((section) => ({
        id: section.mappedinLocationId || String(section.id),
        name: section.name,
      }));
  }

  async setCategoryFilter(category: string | null): Promise<void> {
    const state = this.store.get();
    const chip = state.searchChips.find((entry) => entry.id === category);
    const next = state.categoryFilter === category ? null : category;
    this.store.patch({
      categoryFilter: next,
      searchQuery: next && chip ? chip.label : "",
    });

    if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);

    if (next && chip) {
      await this.submitSearch(chip.label);
    } else {
      await this.submitSearch("");
    }
  }

  setActiveTab(tab: AppTab): void {
    const state = this.store.get();
    if (tab === "map" && state.homeExperience === "first-visit") {
      this.store.patch({
        activeTab: "home",
        navigateView: "home",
        homeVenueSearchQuery: "",
        profileView: "main",
        settingsConfirm: null,
        notificationsOpen: false,
      });
      return;
    }

    // Tapping Navigate again from the indoor map returns to venue home.
    if (tab === "map" && state.activeTab === "map" && state.navigateView === "map") {
      this.store.patch({
        navigateView: "home",
        homeExperience: this.resolveHomeExperience(state.selectedVenueId),
        homeVenueSearchQuery: "",
        profileView: "main",
        settingsConfirm: null,
        notificationsOpen: false,
      });
      void this.refreshSignedInProfile();
      void this.loadReturningHomeContent();
      return;
    }

    const openingSocialTab = tab === "social";
    const wasInConversation = Boolean(state.socialLocation);
    const leavingSocial = state.activeTab === "social" && tab !== "social";

    if (!state.socialLocation) {
      this.captureHomeFeedSnapshot(state);
    }

    this.store.patch({
      activeTab: tab,
      // Preserve the last Navigate subview when returning from another tab.
      // A second tap while already on the 2D map is still handled above and
      // intentionally toggles back to the venue home view.
      ...(tab === "map" && state.navigateView !== "map"
        ? { navigateView: "home" as const }
        : {}),
      profileView: "main",
      settingsConfirm: null,
      notificationsOpen: false,
      socialLocation: openingSocialTab ? null : state.socialLocation,
      socialLocationName: openingSocialTab ? null : state.socialLocationName,
      socialDraft: this.captureSocialDraft(),
      venueFeedDraft: this.captureVenueFeedDraft(),
      ...(openingSocialTab ? { postCommentsOpen: false } : {}),
    });

    if (openingSocialTab && wasInConversation) {
      this.restoreHomeFeedSnapshot();
      this.venueWideFeedSnapshot = null;
    } else if (leavingSocial) {
      this.restoreHomeFeedSnapshot();
    }

    if (tab === "profile") {
      void this.refreshSignedInProfile();
    }
    if (tab === "map") {
      void this.loadReturningHomeContent();
    }
  }

  isNavigateSurface(): boolean {
    const state = this.store.get();
    return state.activeTab === "map" && state.navigateView === "home";
  }

  setSocialPageTab(tab: SocialPageTab): void {
    this.store.patch({
      socialPageTab: tab,
      venueFeedDraft: this.captureVenueFeedDraft(),
    });
  }

  setSocialExpectTopic(topicId: string | null): void {
    this.store.patch({ socialExpectTopic: topicId });
  }

  setHomeVenueSearchQuery(query: string): void {
    this.store.patch({ homeVenueSearchQuery: query });
  }

  private resolveVenueSelection(
    venueId: string,
    source: "home" | "navigate-ar" | "navigate-discover",
  ): {
    listVenue: RecentVenueVisit | undefined;
    forumVenue: ForumVenueSummary | undefined;
  } {
    const state = this.store.get();
    const venues = [
      ...(state.homeContent?.recentlyVisited ?? []),
      ...(state.homeContent?.otherVenues ?? []),
    ];
    const listVenue = venues.find((item) => item.id === venueId);
    const idMatch = state.forumVenues.find(
      (venue) => String(venue.id) === venueId,
    );
    const nameMatch =
      idMatch || !listVenue
        ? undefined
        : state.forumVenues.find(
            (venue) =>
              venue.name.toLowerCase() === listVenue.name.toLowerCase(),
          );
    const forumVenue = idMatch ?? nameMatch;
    appLog("VenueSelect", "Resolved venue selection", {
      source,
      requestedVenueId: venueId,
      listVenue,
      matchedBy: idMatch ? "id" : nameMatch ? "name-fallback" : "none",
      forumVenue,
      catalogMatches: state.forumVenues
        .filter(
          (venue) =>
            String(venue.id) === venueId ||
            (listVenue &&
              venue.name.toLowerCase() === listVenue.name.toLowerCase()),
        )
        .map((venue) => ({
          id: venue.id,
          name: venue.name,
          location: venue.location,
          mappedinMapId: venue.mappedinMapId,
        })),
    });
    return { listVenue, forumVenue };
  }

  submitNavigateVenueSearch(): void {
    const state = this.store.get();
    const query = state.homeVenueSearchQuery.trim().toLowerCase();
    if (!query) return;
    const venues = [
      ...(state.homeContent?.recentlyVisited ?? []),
      ...(state.homeContent?.otherVenues ?? []),
    ];
    const match = venues.find((venue) =>
      venue.name.toLowerCase().includes(query),
    );
    if (!match) {
      this.showToast("No matching venues.");
      return;
    }
    this.selectHomeRecentVenue(match.id);
  }

  openNavigateDiscoverVenuePicker(): void {
    this.store.patch({
      navigateDiscoverVenuePickerOpen: true,
      navigateDiscoverVenuePickerLoading: false,
      navigateVenuePickerMode: "discover",
    });
  }

  openNavigateArVenuePicker(): void {
    // AR is one product capability even though it has Home and Navigate entry
    // points. Remember the contextual tour as soon as it is shown so moving
    // between those entry points cannot show the same tour twice.
    if (this.maybeShowContextualProductTour("try-ar")) return;
    this.store.patch({
      navigateDiscoverVenuePickerOpen: true,
      navigateDiscoverVenuePickerLoading: false,
      navigateVenuePickerMode: "ar",
    });
  }

  closeNavigateDiscoverVenuePicker(): void {
    if (this.store.get().navigateDiscoverVenuePickerLoading) return;
    this.store.patch({
      navigateDiscoverVenuePickerOpen: false,
      navigateDiscoverVenuePickerLoading: false,
      navigateVenuePickerMode: "discover",
    });
  }

  async openArForNavigateVenue(venueId: string): Promise<void> {
    if (this.store.get().navigateDiscoverVenuePickerLoading) return;
    const state = this.store.get();
    const { forumVenue: matchedForumVenue } = this.resolveVenueSelection(
      venueId,
      "navigate-ar",
    );

    if (!matchedForumVenue) {
      this.showToast("Could not open that venue. Please try again.");
      return;
    }

    this.store.patch({ navigateDiscoverVenuePickerLoading: true });

    try {
      if (String(matchedForumVenue.id) !== state.selectedVenueId) {
        this.store.patch({
          selectedVenueId: String(matchedForumVenue.id),
          selectedGateId: null,
          forumSections: [],
          forumCategories: [],
        });
        await this.loadOnboardingSections(String(matchedForumVenue.id));
        if (!this.store.get().selectedGateId) {
          this.showToast("This venue has no sections yet.");
          this.store.patch({ navigateDiscoverVenuePickerLoading: false });
          return;
        }
        await this.enterSelectedVenue({
          skipLocationGate: true,
          welcomeToast: false,
          homeExperience: "returning",
          landOn: "home",
          activeTab: "map",
        });
      }

      this.store.patch({
        navigateDiscoverVenuePickerOpen: false,
        navigateDiscoverVenuePickerLoading: false,
        navigateVenuePickerMode: "discover",
      });
      await this.openVenueArFromHome();
    } catch (error) {
      appWarn("Navigate", "Could not open AR for venue", error);
      this.showToast("Could not open that venue. Please try again.");
      this.store.patch({ navigateDiscoverVenuePickerLoading: false });
    }
  }

  async openSocialExpectForVenue(venueId: string): Promise<void> {
    if (this.store.get().navigateDiscoverVenuePickerLoading) return;
    const state = this.store.get();
    const { forumVenue: matchedForumVenue } = this.resolveVenueSelection(
      venueId,
      "navigate-discover",
    );

    if (!matchedForumVenue) {
      this.showToast("Could not open that venue. Please try again.");
      return;
    }

    this.store.patch({ navigateDiscoverVenuePickerLoading: true });

    try {
      if (String(matchedForumVenue.id) !== state.selectedVenueId) {
        this.store.patch({
          selectedVenueId: String(matchedForumVenue.id),
          selectedGateId: null,
          forumSections: [],
          forumCategories: [],
        });
        await this.loadOnboardingSections(String(matchedForumVenue.id));
        if (!this.store.get().selectedGateId) {
          this.showToast("This venue has no sections yet.");
          this.store.patch({ navigateDiscoverVenuePickerLoading: false });
          return;
        }
        await this.enterSelectedVenue({
          skipLocationGate: true,
          welcomeToast: false,
          homeExperience: "returning",
          landOn: "home",
        });
      }

      this.store.patch({
        activeTab: "social",
        navigateView: "home",
        socialPageTab: "what-to-expect",
        socialExpectTopic: null,
        notificationsOpen: false,
        postCommentsOpen: false,
        navigateDiscoverVenuePickerOpen: false,
        navigateDiscoverVenuePickerLoading: false,
        navigateVenuePickerMode: "discover",
      });
    } catch (error) {
      appWarn("Navigate", "Could not open What to Expect for venue", error);
      this.showToast("Could not open that venue. Please try again.");
      this.store.patch({ navigateDiscoverVenuePickerLoading: false });
    }
  }

  openNavigateMap(): void {
    const state = this.store.get();
    if (state.mapStatus === "error") {
      this.showToast(
        resolveMapBootErrorMessage(state.loadingMessage || state.mapError),
      );
      void this.retryMapLoadThenEnterNavigate();
      return;
    }
    if (state.mapStatus === "loading" || state.mapStatus === "initial") {
      this.store.patch({
        activeTab: "map",
        navigateView: "home",
        homeVenueSearchQuery: "",
      });
      this.showToast("Still loading the map…");
      void this.waitForMapReadyThenEnterNavigate();
      return;
    }
    this.store.patch({
      activeTab: "map",
      navigateView: "map",
      homeVenueSearchQuery: "",
    });
    this.maybeShowContextualProductTour("map-search");
  }

  private async waitForMapReadyThenEnterNavigate(): Promise<void> {
    await this.ensureMapForSelectedVenue();
    if (this.store.get().mapStatus !== "ready") {
      this.showToast(
        resolveMapBootErrorMessage(
          this.store.get().loadingMessage || this.store.get().mapError,
        ),
      );
      return;
    }
    this.store.patch({
      activeTab: "map",
      navigateView: "map",
      homeVenueSearchQuery: "",
    });
    this.maybeShowContextualProductTour("map-search");
  }

  private async retryMapLoadThenEnterNavigate(): Promise<void> {
    this.loadedMapKey = null;
    this.loadedVenueMapId = null;
    await this.waitForMapReadyThenEnterNavigate();
  }

  selectHomeRecentVenue(venueId: string): void {
    void this.openHomeVenue(venueId);
  }

  selectFirstVisitVenue(venueId: string): void {
    if (venueId === this.store.get().selectedVenueId) return;
    void this.openHomeVenue(venueId, false, true);
  }

  selectNavigateVenue(venueId: string): void {
    void this.openHomeVenue(venueId, true);
  }

  private async openHomeVenue(
    venueId: string,
    fromNavigate = false,
    stayOnFirstVisit = false,
  ): Promise<void> {
    const state = this.store.get();
    const { listVenue: fromLists, forumVenue: matchedForumVenue } =
      this.resolveVenueSelection(venueId, "home");

    const duplicateMapVenues = matchedForumVenue?.mappedinMapId
      ? state.forumVenues.filter(
          (venue) =>
            venue.id !== matchedForumVenue.id &&
            venue.mappedinMapId === matchedForumVenue.mappedinMapId,
        )
      : [];
    if (duplicateMapVenues.length) {
      appWarn(
        "VenueMap",
        "Selected venue shares mappedinMapId with other catalog venue(s)",
        {
          selected: matchedForumVenue,
          duplicates: duplicateMapVenues.map((venue) => ({
            id: venue.id,
            name: venue.name,
            location: venue.location,
            mappedinMapId: venue.mappedinMapId,
          })),
        },
      );
    }

    this.store.patch({ homeVenueSearchQuery: "" });

    if (!matchedForumVenue) {
      this.showToast(
        fromLists
          ? `Could not open ${fromLists.name}. Please try again.`
          : "Could not open that venue. Please try again.",
      );
      return;
    }

    const venueName = matchedForumVenue.name;
    this.showToast(`Opening ${venueName}`);

    if (
      String(matchedForumVenue.id) === state.selectedVenueId &&
      state.mapStatus === "ready" &&
      this.mapView
    ) {
      this.initializeVenueGpsReference();
      this.openNavigateMap();
      return;
    }

    if (this.venueEnterInFlight) {
      this.showToast("Still opening a venue…");
      return;
    }

    this.venueEnterInFlight = true;
    try {
      // Stay on home until sections + map credentials succeed — never land on
      // the orange map boot / error chrome mid-fetch.
      const mapLoad = this.beginBackgroundVenueMapSwitch(matchedForumVenue);
      await this.loadOnboardingSections(String(matchedForumVenue.id));
      if (
        String(this.store.get().selectedVenueId) !==
        String(matchedForumVenue.id)
      ) {
        return;
      }
      if (!this.store.get().selectedGateId) {
        this.showToast("This venue has no sections yet.");
        return;
      }
      await this.enterSelectedVenue({
        skipLocationGate: true,
        welcomeToast: false,
        homeExperience: stayOnFirstVisit ? "first-visit" : "returning",
        landOn: fromNavigate ? "map" : "home",
        holdEnterLock: true,
      });
      await mapLoad;

      if (this.store.get().mapStatus !== "ready") {
        const message = resolveMapBootErrorMessage(
          this.store.get().loadingMessage || this.store.get().mapError,
        );
        this.showToast(message);
        return;
      }

      this.store.patch({
        activeTab: stayOnFirstVisit ? "home" : "map",
        navigateView: stayOnFirstVisit ? "home" : "map",
        homeVenueSearchQuery: "",
      });
      this.showToast(`Welcome to ${venueName}. You're in.`);
    } catch (error) {
      appWarn("Home", "Could not open venue", error);
      const message = resolveUserFacingApiErrorMessage(
        error instanceof Error ? error.message : null,
        "Could not open that venue. Please try again.",
      );
      this.showToast(message);
    } finally {
      this.venueEnterInFlight = false;
    }
  }

  /**
   * Switch venue map data in the background while the user stays on home.
   * Only openNavigateMap / a successful openHomeVenue should flip navigateView.
   */
  private beginBackgroundVenueMapSwitch(
    venue: ForumVenueSummary,
  ): Promise<void> {
    this.disconnectVenueLiveFeed();
    this.disconnectLocationLiveFeed();
    this.homeFeedSnapshot = null;
    this.venueWideFeedSnapshot = null;
    this.allConversationNextPages = new Map();
    this.venueFeedScopeGeneration += 1;
    this.store.patch({
      selectedVenueId: String(venue.id),
      selectedFloorId: null,
      forumFloors: [],
      selectedGateId: null,
      forumSections: [],
      forumCategories: [],
      activeTab: "home",
      navigateView: "home",
      mapStatus: "loading",
      mapError: undefined,
      loadingMessage: "Loading map…",
      loadingProgress: 12,
      venueFeedPosts: [],
      forumFeedNext: null,
      forumFeedCount: 0,
      sectionHeatmap: [],
      sectionHeatmapActive: false,
      venueLiveStatus: "idle",
      venueOnlineCount: null,
      locationLiveStatus: "idle",
      socialLocation: null,
      socialLocationName: null,
      homeVenueSearchQuery: "",
    });
    this.teardownMappedinScene({ cancelInFlight: true });
    return this.ensureMapForSelectedVenue();
  }

  private async ensureForumVenuesForHome(): Promise<void> {
    try {
      const venues = await listAllVenues();
      const venueCoordinates = venues.map((venue) => ({
        id: venue.id,
        name: venue.name,
        latitude: venue.latitude,
        longitude: venue.longitude,
      }));
      appLog("Venue", "Venue coordinates received", venueCoordinates);
      this.store.patch({
        forumVenues: venues.map((venue) => this.toVenueSummary(venue)),
      });
    } catch (error) {
      if (this.store.get().forumVenues.length > 0) return;
      appWarn("Home", "Could not load venues for home", error);
    }
  }

  private async loadReturningHomeContent(): Promise<void> {
    void this.refreshSignedInProfile();
    try {
      const fallback = await homeRepository.getReturningHomeContent();
      await this.ensureForumVenuesForHome();
      const catalog = this.store.get().forumVenues;
      if (catalog.length === 0) {
        this.store.patch({ homeContent: fallback });
        return;
      }
      const split = partitionHomeVenues(
        catalog,
        venueVisitRepository.listVisited(),
      );
      this.store.patch({
        homeContent: {
          recentlyVisited: split.recentlyVisited.map(homeVenueRowFromCatalog),
          otherVenues: split.otherVenues.map(homeVenueRowFromCatalog),
          stats: fallback.stats,
        },
      });
    } catch (error) {
      appWarn("Home", "Could not load returning-home content", error);
    }
  }

  private async refreshSignedInProfile(): Promise<void> {
    const current = this.store.get().authUser;
    if (!current || !hasStoredAuthTokens()) return;
    const user = await this.refreshProfileQuietly(current);
    this.store.patch({ authUser: user });
  }

  openProfileSettings(): void {
    if (this.maybeShowContextualProductTour("profile-settings")) return;
    this.store.patch({
      activeTab: "profile",
      profileView: "settings",
      settingsConfirm: null,
    });
  }

  closeProfileSettings(): void {
    this.store.patch({ profileView: "main", settingsConfirm: null });
  }

  openMapLanguageSettings(): void {
    this.store.patch({
      activeTab: "profile",
      profileView: "language",
      settingsConfirm: null,
    });
  }

  closeMapLanguageSettings(): void {
    this.store.patch({ profileView: "settings" });
  }

  openEditProfileFromSettings(): void {
    const state = this.store.get();
    const user = state.authUser;
    if (!user || !hasStoredAuthTokens()) {
      this.showLogin();
      return;
    }
    const existingName =
      user.pseudo_name?.trim() || state.pseudoNameDraft.trim() || "";
    const interests = user.interests?.length ? [...user.interests] : [];
    this.store.patch({
      activeTab: "profile",
      profileView: "edit-profile",
      settingsConfirm: null,
      authFieldErrors: {},
      profileEditSaving: false,
      pseudoNameDraft: existingName,
      pseudoNameHint: state.pseudoNameHint || generatePseudoName(),
      selectedInterests: interests,
    });
    void this.loadInterestOptions();
  }

  closeEditProfileSettings(): void {
    this.store.patch({
      profileView: "settings",
      authFieldErrors: {},
      profileEditSaving: false,
    });
  }

  openChangePasswordFromSettings(): void {
    const state = this.store.get();
    if (!state.authUser || !hasStoredAuthTokens()) {
      this.showLogin();
      return;
    }
    this.store.patch({
      activeTab: "profile",
      profileView: "change-password",
      settingsConfirm: null,
      authFieldErrors: {},
      authLoading: false,
    });
  }

  closeChangePasswordSettings(): void {
    this.store.patch({
      profileView: "settings",
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
      fieldErrors.old_password = "Current password is required.";
    }
    if (!newPassword) {
      fieldErrors.new_password = "New password is required.";
    } else if (evaluatePasswordStrength(newPassword) !== "strong") {
      fieldErrors.new_password =
        "Use at least 8 characters with a letter and a number.";
    } else if (oldPassword && newPassword === oldPassword) {
      fieldErrors.new_password =
        "Choose a password different from the current one.";
    }

    if (Object.keys(fieldErrors).length > 0) {
      this.store.patch({ authFieldErrors: fieldErrors });
      return;
    }

    if (!hasStoredAuthTokens()) {
      this.store.patch({
        authFieldErrors: {
          _form: "Your session expired. Please log in to continue.",
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
      this.rememberPasswordCredential(
        this.store.get().authUser?.email ?? this.store.get().authEmail,
        newPassword,
      );
      this.store.patch({
        authLoading: false,
        authFieldErrors: {},
        profileView: "settings",
      });
      this.showToast(message || "Password updated.");
    } catch (error) {
      this.handleAuthFailure(
        error,
        "Could not change your password. Please try again.",
      );
    }
  }

  async submitProfileEditFromSettings(pseudoName: string): Promise<void> {
    const trimmed = pseudoName.trim();
    if (!trimmed) {
      this.store.patch({
        authFieldErrors: { pseudo_name: "Pick a pseudo-name to continue." },
        pseudoNameDraft: trimmed,
      });
      return;
    }
    if (trimmed.length < 3) {
      this.store.patch({
        authFieldErrors: {
          pseudo_name: "Pseudo-name must be at least 3 characters.",
        },
        pseudoNameDraft: trimmed,
      });
      return;
    }
    if (trimmed.length > 50) {
      this.store.patch({
        authFieldErrors: {
          pseudo_name: "Pseudo-name must be 50 characters or fewer.",
        },
        pseudoNameDraft: trimmed,
      });
      return;
    }
    if (!hasStoredAuthTokens()) {
      this.store.patch({
        authFieldErrors: {
          _form: "Your session expired. Please log in to continue.",
        },
      });
      this.showLogin();
      return;
    }

    const interests = this.store.get().selectedInterests;
    this.store.patch({
      profileEditSaving: true,
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
        profileEditSaving: false,
        authUser: refreshed,
        pseudoNameDraft: refreshed.pseudo_name?.trim() || trimmed,
        selectedInterests: refreshed.interests?.length
          ? [...refreshed.interests]
          : interests,
        authFieldErrors: {},
        profileView: "settings",
      });
      this.showToast("Profile updated.");
    } catch (error) {
      this.store.patch({ profileEditSaving: false });
      this.handleAuthFailure(
        error,
        "Could not update your profile. Please try again.",
      );
    }
  }

  openAboutSettings(): void {
    this.store.patch({
      activeTab: "profile",
      profileView: "about",
      settingsConfirm: null,
    });
  }

  openPrivacySettings(): void {
    this.store.patch({
      activeTab: "profile",
      profileView: "privacy",
      settingsConfirm: null,
    });
  }

  openTermsSettings(): void {
    this.store.patch({
      activeTab: "profile",
      profileView: "settings",
      settingsConfirm: null,
      legalWebView: "terms",
    });
  }

  closeSecondarySettings(): void {
    this.store.patch({
      profileView: "settings",
      settingsConfirm: null,
      legalWebView: null,
    });
  }

  dismissLegalWebView(): void {
    this.store.patch({ legalWebView: null });
  }

  requestLogoutConfirm(): void {
    this.store.patch({ settingsConfirm: "logout" });
  }

  requestDeleteAccountConfirm(): void {
    this.store.patch({ settingsConfirm: "delete-account" });
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
      this.store.patch({ profileView: "settings" });
      return;
    }

    this.store.patch({ mapLanguageChanging: true });
    try {
      await this.mapData.changeLanguage(trimmed);
      savePreferredMapLanguage(trimmed);
      this.store.patch({ profileView: "settings" });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not change map language.";
      this.showToast(message);
      appWarn("Map", "Language change failed", error);
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

  toggleProductTourEnabled(): void {
    const enabled = !this.store.get().productTourEnabled;
    if (enabled) {
      this.productTourDismissedThisSession = false;
      saveProductTourPreference(preferenceAfterProductTourEnable());
      this.store.patch({
        productTourEnabled: true,
        productTourCompleted: false,
      });
      this.beginProductTour({ replay: true });
      return;
    }
    this.optOutProductTour();
  }

  setProductTourDontShowAgain(dontShow: boolean): void {
    if (dontShow) {
      // This is a global opt-out, not just a preference for the currently
      // visible card. Dismiss any active tour and block all future entry
      // points until the user explicitly re-enables it in Settings.
      this.optOutProductTour();
      return;
    }
    const enabled = !dontShow;
    const current = loadProductTourPreference();
    saveProductTourPreference({ ...current, enabled });
    this.store.patch({ productTourEnabled: enabled });
  }

  openNotifications(): void {
    this.store.patch({
      activeTab: "social",
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
      activeTab: "social",
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
            : "Could not load this notification.",
      });
      appWarn("Notifications", "Could not load notification detail", error);
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
        appWarn(
          "Notifications",
          "unread_count failed; using list count",
          error,
        );
      }
      this.store.patch({
        notifications,
        notificationsNext: page.next,
        notificationsUnreadCount: unread,
        notificationsLoading: false,
      });
    } catch (error) {
      this.store.patch({ notificationsLoading: false });
      appWarn("Notifications", "Could not load notification inbox", error);
      this.showToast("Could not load notifications.");
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
      appWarn("Notifications", "Could not load more notifications", error);
      this.showToast("Could not load more notifications.");
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
      appWarn("Notifications", "Mark read failed", error);
      this.showToast("Could not mark notification as read.");
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
      appWarn("Notifications", "Mark all read failed", error);
      this.showToast("Could not mark all notifications as read.");
    }
  }

  completeOnboarding(options?: {
    homeExperience?: HomeExperience;
    landOn?: NavigateView;
    activeTab?: AppTab;
  }): void {
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
      mode: state.authUser ? "auth" : "guest",
      selectedVenueId: state.selectedVenueId,
      selectedGateId: state.selectedGateId,
      guestId: state.guestId,
    });
    this.store.patch({
      onboardingComplete: true,
      authStep: "none",
      authStepBeforeLocation: null,
      authLoading: false,
      guestContinueLoading: false,
      locationGateLoading: false,
      locationGateError: null,
      activeTab: options?.activeTab ?? (options?.landOn === "map" ? "map" : "home"),
      navigateView: options?.landOn ?? "home",
      homeExperience,
      homeVenueSearchQuery: "",
    });
    void this.loadReturningHomeContent();
    this.maybeStartProductTour();
  }

  advanceProductTour(): void {
    const state = this.store.get();
    if (state.productTourStepIndex == null) return;
    const steps = this.activeProductTourSteps();
    const next = nextProductTourIndex(state.productTourStepIndex, steps.length);
    if (next === "complete") {
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
    if (isProductTourDontShowAgain(this.store.get().productTourEnabled)) {
      this.finishProductTour();
      return;
    }
    this.markActiveContextualProductTourSeen();
    this.productTourDismissedThisSession = true;
    this.dismissProductTourOverlay();
  }

  private maybeStartProductTour(): void {
    const state = this.store.get();
    if (
      !shouldAutoStartProductTour({
        onboardingComplete: state.onboardingComplete,
        tourEnabled: state.productTourEnabled,
        tourCompleted: state.productTourCompleted,
        tourActive: state.productTourStepIndex != null,
        dismissedThisSession: this.productTourDismissedThisSession,
      })
    ) {
      return;
    }
    this.beginProductTour({ replay: false });
  }

  private activeProductTourSteps() {
    const ids = this.store.get().productTourStepIds;
    return ids.length ? productTourStepsByIds(ids) : initialProductTourSteps();
  }

  maybeShowContextualProductTour(stepId: string): boolean {
    const state = this.store.get();
    const step = contextualProductTourStep(stepId);
    if (
      !step ||
      !state.onboardingComplete ||
      !state.productTourEnabled ||
      state.productTourStepIndex != null
    ) {
      return false;
    }
    const preference = loadProductTourPreference();
    if (preference.seenContextualStepIds.includes(stepId)) return false;
    // Mark it immediately, rather than only when the card is dismissed. A
    // user can switch surfaces while the contextual card is open; that should
    // still count as having seen this capability tour.
    saveProductTourPreference({
      ...preference,
      seenContextualStepIds: [
        ...new Set([...preference.seenContextualStepIds, stepId]),
      ],
    });
    this.store.patch({ productTourStepIds: [step.id] });
    this.applyProductTourIndex(0);
    return true;
  }

  private beginProductTour(options: { replay: boolean }): void {
    const state = this.store.get();
    if (!state.onboardingComplete) return;
    if (
      !options.replay &&
      (state.productTourCompleted || !state.productTourEnabled)
    ) {
      return;
    }
    const steps = initialProductTourSteps();
    if (!steps.length) return;
    this.store.patch({ productTourStepIds: steps.map((step) => step.id) });
    this.applyProductTourIndex(0);
  }

  private finishProductTour(): void {
    const activeSteps = this.activeProductTourSteps();
    const activeStepIds = activeSteps.map((step) => step.id);
    const preference = loadProductTourPreference();
    const isContextual =
      activeStepIds.length === 1 &&
      contextualProductTourStep(activeStepIds[0] ?? "") != null;

    if (isContextual) {
      saveProductTourPreference({
        ...preference,
        seenContextualStepIds: [
          ...new Set([
            ...preference.seenContextualStepIds,
            ...activeStepIds,
          ]),
        ],
      });
      this.dismissProductTourOverlay();
      return;
    }

    this.productTourDismissedThisSession = true;
    saveProductTourPreference({
      ...preference,
      completed: true,
      // Once the complete app tour has been seen, Settings should reflect
      // that there is no remaining tour to show. The user can still replay it
      // deliberately by turning the setting back on.
      enabled: false,
    });
    this.store.patch({
      productTourCompleted: true,
      productTourEnabled: false,
      productTourStepIndex: null,
      productTourStepIds: [],
    });
  }

  private optOutProductTour(): void {
    this.productTourDismissedThisSession = true;
    const current = loadProductTourPreference();
    saveProductTourPreference({
      ...preferenceAfterProductTourOptOut(),
      seenContextualStepIds: current.seenContextualStepIds,
    });
    const tourWasActive = this.store.get().productTourStepIndex != null;
    if (!tourWasActive) {
      this.store.patch({
        productTourEnabled: false,
        productTourCompleted: true,
        productTourStepIds: [],
      });
      return;
    }
    this.store.patch({
      productTourEnabled: false,
      productTourCompleted: true,
      productTourStepIndex: null,
      productTourStepIds: [],
      activeTab: "home",
      navigateView: "home",
      profileView: "main",
      settingsConfirm: null,
      notificationsOpen: false,
      postCommentsOpen: false,
    });
  }

  private dismissProductTourOverlay(): void {
    if (this.activeProductTourIsContextual()) {
      this.store.patch({
        productTourStepIndex: null,
        productTourStepIds: [],
      });
      return;
    }
    this.store.patch({
      productTourStepIndex: null,
      productTourStepIds: [],
      activeTab: "home",
      navigateView: "home",
      profileView: "main",
      settingsConfirm: null,
      notificationsOpen: false,
      postCommentsOpen: false,
    });
  }

  private activeProductTourIsContextual(): boolean {
    const activeStepIds = this.activeProductTourSteps().map((step) => step.id);
    return (
      activeStepIds.length === 1 &&
      contextualProductTourStep(activeStepIds[0] ?? "") != null
    );
  }

  private markActiveContextualProductTourSeen(): void {
    const activeStepIds = this.activeProductTourSteps().map((step) => step.id);
    if (
      activeStepIds.length !== 1 ||
      contextualProductTourStep(activeStepIds[0] ?? "") == null
    ) {
      return;
    }
    const preference = loadProductTourPreference();
    saveProductTourPreference({
      ...preference,
      seenContextualStepIds: [
        ...new Set([...preference.seenContextualStepIds, ...activeStepIds]),
      ],
    });
  }

  private applyProductTourIndex(index: number): void {
    const steps = this.activeProductTourSteps();
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
      profileView: "main",
      settingsConfirm: null,
      notificationsOpen: false,
      postCommentsOpen: false,
      locationActionPrompt: null,
      arrivalDialogOpen: false,
      guestArGatePrompt: null,
      arRoutePromptOpen: false,
      arNotAtVenuePromptOpen: false,
    };
    switch (surface) {
      case "home":
        return { ...common, activeTab: "home", navigateView: "home" };
      case "navigate":
        return { ...common, activeTab: "map", navigateView: "home" };
      case "map":
        return {
          ...common,
          activeTab: "map",
          navigateView: "map",
          showRouteSheet: false,
        };
      case "social":
        return { ...common, activeTab: "social" };
      case "profile":
        return { ...common, activeTab: "profile" };
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
    this.setActiveTab("social");
  }

  /** Try AR from the first-visit venue home. */
  async openVenueArFromHome(): Promise<void> {
    if (this.maybeShowContextualProductTour("try-ar")) return;
    if (!(await this.ensureUserLocationForVenuePresence())) return;
    if (await this.blockNavigationOutsideVenue("ar")) return;

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
          this.store.patch({ guestArGatePrompt: "already-used" });
          return;
        }
      } catch (error) {
        this.store.patch({ guestArGateLoading: false });
        appWarn("Guest", "Could not resolve AR eligibility from home", error);
      }
    }

    if (this.store.get().route) {
      this.store.patch({
        arRoutePromptOpen: false,
        arNotAtVenuePromptOpen: false,
      });
      this.openNavigateMap();
      await this.openAr();
      return;
    }

    const tourPreference = loadProductTourPreference();
    if (tourPreference.seenContextualStepIds.includes(AR_ROUTE_PROMPT_TOUR_ID)) {
      // The explanatory AR route dialog is a one-time product-tour step.
      // Continue directly to route setup after it has already been shown.
      await this.confirmArRoutePrompt();
      return;
    }

    saveProductTourPreference({
      ...tourPreference,
      seenContextualStepIds: [
        ...new Set([
          ...tourPreference.seenContextualStepIds,
          AR_ROUTE_PROMPT_TOUR_ID,
        ]),
      ],
    });

    // Stay on venue home - dialog explains start/end, then user opens the map.
    this.store.patch({
      arNotAtVenuePromptOpen: false,
      arRoutePromptOpen: true,
    });
  }

  dismissArRoutePrompt(): void {
    this.store.patch({ arRoutePromptOpen: false });
  }

  dismissArNotAtVenuePrompt(): void {
    this.store.patch({ arNotAtVenuePromptOpen: false });
  }

  private async blockPostingWhenAwayFromVenue(): Promise<boolean> {
    if (remoteVenuePostingEnabled()) return false;
    if (!(await this.ensureUserLocationForVenuePresence())) return true;
    if (!this.isAwayFromSelectedVenue()) return false;
    const state = this.store.get();
    const venue = state.forumVenues.find(
      (item) => String(item.id) === state.selectedVenueId,
    );
    this.showToast(postingNotAtVenueCopy(venue?.name).body);
    return true;
  }

  /**
   * Require an active guest trial plus venue presence for route point selection
   * and AR, while allowing read-only map browsing.
   */
  private async blockNavigationOutsideVenue(
    action: "route" | "ar" = "route",
  ): Promise<boolean> {
    if (remoteArEnabled()) return false;
    if (!(await this.ensureUserLocationForVenuePresence())) return true;
    const state = this.store.get();
    if (!state.authUser && state.guestAccessAllowed === false) {
      this.store.patch({
        arRoutePromptOpen: false,
        arRouteSetupActive: false,
        guestArGatePrompt: null,
        guestArGateLoading: false,
      });
      this.showToast(guestDenialUserMessage(state.guestAccessReason));
      return true;
    }

    const venue = state.forumVenues.find(
      (item) => String(item.id) === state.selectedVenueId,
    );
    const presence = userVenuePresence(
      state.locationPermission,
      state.userLocation,
      venuePresenceAnchor(venue, this.mapPresenceCoordinate()),
    );
    if (presence === "at-venue" || this.venueGpsReference) return false;
    this.store.patch({
      arRoutePromptOpen: false,
      arRouteSetupActive: false,
      guestArGatePrompt: null,
      guestArGateLoading: false,
    });
    if (action === "ar" && presence === "away") {
      this.store.patch({ arNotAtVenuePromptOpen: true });
      this.showToast(arNotAtVenueCopy(venue?.name).body);
      return true;
    }
    this.showToast(
      presence === "away"
        ? `Setting start/end points and using AR are only available at ${venue?.name || "the location"}. Head there to continue.`
        : "We couldn't verify that you're at the location. Enable location access and try again to set start/end points or use AR.",
    );
    return true;
  }

  private isAwayFromSelectedVenue(): boolean {
    const state = this.store.get();
    const venue = state.forumVenues.find(
      (item) => String(item.id) === state.selectedVenueId,
    );
    return (
      userVenuePresence(
        state.locationPermission,
        state.userLocation,
        venuePresenceAnchor(venue, this.mapPresenceCoordinate()),
      ) === "away"
    );
  }

  selectedVenuePresenceAnchor(): {
    latitude: number;
    longitude: number;
  } | null {
    const state = this.store.get();
    const venue = state.forumVenues.find(
      (item) => String(item.id) === state.selectedVenueId,
    );
    const anchor = venuePresenceAnchor(venue, this.mapPresenceCoordinate());
    return anchor?.latitude != null &&
      anchor.longitude != null &&
      Number.isFinite(anchor.latitude) &&
      Number.isFinite(anchor.longitude)
      ? { latitude: anchor.latitude, longitude: anchor.longitude }
      : null;
  }

  private mapPresenceCoordinate(): {
    latitude: number;
    longitude: number;
  } | null {
    if (!this.mapData) return null;
    const types = ["space", "location-profile", "enterprise-location"] as const;
    for (const type of types) {
      for (const item of this.mapData.getByType(type)) {
        const serialized = serializeCoordinate(item);
        if (
          serialized &&
          Number.isFinite(serialized.latitude) &&
          Number.isFinite(serialized.longitude)
        ) {
          return {
            latitude: serialized.latitude,
            longitude: serialized.longitude,
          };
        }
      }
    }
    return null;
  }

  private async ensureUserLocationForVenuePresence(): Promise<boolean> {
    const state = this.store.get();
    if (state.locationPermission !== "granted") {
      await this.ensureLocationEnabledForAction();
      return false;
    }
    if (!this.locationService) return true;
    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const ageMs = this.lastUserLocationPublishAt
      ? now - this.lastUserLocationPublishAt
      : Number.POSITIVE_INFINITY;
    if (state.userLocation && ageMs < 15_000) return true;
    this.store.patch({ locationGateLoading: true });
    try {
      const coords = await this.locationService.requestLocation({
        timeoutMs: 8_000,
      });
      this.lastPublishedUserLocation = coords;
      this.lastUserLocationPublishAt = now;
      this.store.patch({ userLocation: coords });
      return true;
    } catch (error) {
      await this.showLocationGateForRequiredAction(error);
      return false;
    } finally {
      if (!isLocationGateAuthStep(this.store.get().authStep)) {
        this.store.patch({ locationGateLoading: false });
      }
    }
  }

  /** Confirm Try AR dialog → map with search ready for start/end. */
  async confirmArRoutePrompt(): Promise<void> {
    if (await this.blockNavigationOutsideVenue("route")) return;
    this.pendingMapSearchFocus = true;
    this.store.patch({
      arRoutePromptOpen: false,
      arNotAtVenuePromptOpen: false,
      homeVenueSearchQuery: "",
      searchQuery: "",
      searchResults: [],
      categoryFilter: null,
      isSearching: false,
      arRouteSetupActive: true,
    });
    // Stay on home until the map is ready — same gate as openNavigateMap.
    this.openNavigateMap();
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
  beginLocationPermissionGate(): Promise<void> {
    return this.openLocationPermissionGate();
  }

  private persistLocationChoice(choice: PermissionChoice): void {
    permissionChoiceLocalDatasource.saveLocation(choice);
    if (choice === "granted") {
      this.store.patch({ locationPermission: choice });
      this.startLiveUserLocationWatch();
      return;
    }
    this.stopLiveUserLocationWatch();
    this.store.patch({
      locationPermission: choice,
      userLocation: null,
    });
  }

  private startLiveUserLocationWatch(): void {
    if (this.stopUserLocationWatch) return;
    if (this.store.get().locationPermission !== "granted") return;
    this.stopUserLocationWatch = this.locationService.watchLocation(
      (coords) => this.publishUserLocation(coords),
      (error) => {
        appWarn("Location", "Live user location watch failed", error);
      },
    );
  }

  private stopLiveUserLocationWatch(): void {
    this.stopUserLocationWatch?.();
    this.stopUserLocationWatch = null;
    this.lastPublishedUserLocation = null;
    this.lastUserLocationPublishAt = 0;
  }

  private publishUserLocation(coords: UserLocationCoords): void {
    if (this.store.get().locationPermission !== "granted") return;
    if (coords.accuracy != null && coords.accuracy <= 30) this.venueGpsReference?.capture(coords);
    if (this.liveRouteTracking || this.store.get().routeSimulating) return;

    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const previous =
      this.lastPublishedUserLocation ?? this.store.get().userLocation;
    const elapsed = this.lastUserLocationPublishAt
      ? now - this.lastUserLocationPublishAt
      : Number.POSITIVE_INFINITY;
    if (!shouldPublishUserLocation(previous, coords, elapsed)) return;

    this.lastPublishedUserLocation = coords;
    this.lastUserLocationPublishAt = now;
    this.store.patch({ userLocation: coords });
  }

  private toVenueSummary(venue: {
    id: number;
    name: string;
    location: string;
    latitude?: string | number | null;
    longitude?: string | number | null;
    mappedin_map_id?: string | null;
  }): ForumVenueSummary {
    return {
      id: venue.id,
      name: venue.name,
      location: venue.location,
      latitude: parseCoordinateNumber(venue.latitude),
      longitude: parseCoordinateNumber(venue.longitude),
      mappedinMapId: venue.mappedin_map_id?.trim() || null,
    };
  }

  private toSectionSummary(section: {
    id: number;
    venue: number;
    floor?: number | null;
    name: string;
    code: string;
    is_active: boolean;
    mappedin_location_id?: string | null;
    mappedinLocationId?: string | null;
  }): ForumSectionSummary {
    return {
      id: section.id,
      venue: section.venue,
      floor: section.floor ?? null,
      name: section.name,
      code: section.code,
      is_active: section.is_active,
      mappedinLocationId:
        section.mappedin_location_id?.trim() ||
        section.mappedinLocationId?.trim() ||
        null,
    };
  }

  private seedRouteProgressFromUser(route: RoutePayload): {
    traveled: number;
    remaining: number | null;
  } {
    const total =
      route.distanceMeters ??
      coordinateTransformationService.totalPathLengthMeters(
        route.pathCoordinates,
      );
    const remainingFallback =
      total > 0 ? total : (route.distanceMeters ?? null);
    // Indoor GPS nearest-snap often lands on the destination of a short venue
    // path. A new route always starts at the origin: never pretends the user
    // has already walked it.
    return { traveled: 0, remaining: remainingFallback };
  }

  /**
   * Show Enable Location only on the first choice. Later visits reuse grant
   * silently or skip GPS after a deny so the browser is not prompted again.
   */
  private async openLocationPermissionGate(): Promise<void> {
    const state = this.store.get();
    const underlyingStep = isLocationGateAuthStep(state.authStep)
      ? (state.authStepBeforeLocation ?? "none")
      : state.authStep;

    const browser = await this.locationService.queryPermission();
    const stored = permissionChoiceLocalDatasource.loadLocation();
    const entry = resolveLocationGateEntry(browser, stored);

    if (entry.action === "error-unsupported" || entry.action === "skip") {
      if (entry.action === "skip") {
        this.persistLocationChoice("denied");
      }
      await this.continueAfterLocationGranted();
      return;
    }

    if (entry.action === "silent-request") {
      await this.runLocationGateRequest({
        fromPermissionRequired: false,
        silent: true,
      });
      return;
    }

    this.store.patch({
      onboardingComplete: false,
      authStep: "location-permission",
      authStepBeforeLocation: underlyingStep,
      authLoading: false,
      guestContinueLoading: false,
      locationGateLoading: false,
      locationPermanentlyDenied: false,
      locationGateError: null,
    });
  }

  showArTeaser(): void {
    this.store.patch({
      authStep: "ar-teaser",
      authFieldErrors: {},
      authLegalDocument: null,
      legalWebView: null,
    });
  }

  showIntroduction(): void {
    this.store.patch({
      authStep: "introduction",
      authFieldErrors: {},
      authLegalDocument: null,
      legalWebView: null,
    });
  }

  showFeatures(): void {
    this.store.patch({
      authStep: "features",
      authFieldErrors: {},
      authLegalDocument: null,
      legalWebView: null,
    });
  }

  showPseudoNameSetup(): void {
    const state = this.store.get();
    if (state.onboardingComplete) return;
    const existingName =
      state.authUser?.pseudo_name?.trim() || state.pseudoNameDraft.trim() || "";
    const existingInterests = state.authUser?.interests?.length
      ? [...state.authUser.interests]
      : state.selectedInterests;
    this.store.patch({
      authStep: "pseudo-name",
      authStepBeforeLocation: null,
      locationGateLoading: false,
      authLoading: false,
      guestContinueLoading: false,
      onboardingComplete: false,
      authFieldErrors: {},
      pseudoNameDraft: existingName,
      pseudoNameHint: state.pseudoNameHint || generatePseudoName(),
      selectedInterests: existingInterests,
    });
    void this.loadInterestOptions();
  }

  private async loadInterestOptions(): Promise<void> {
    if (this.interestOptionsLoaded) return;
    try {
      const options = await listActiveInterestNames();
      this.interestOptionsLoaded = true;
      this.store.patch({
        interestOptions: interestOptionsAfterFetch(options),
      });
    } catch (error) {
      this.interestOptionsLoaded = true;
      this.store.patch({
        interestOptions: interestOptionsAfterFetch(null),
      });
      appWarn("Auth", "Could not load interest catalog", error);
    }
  }

  dismissPseudoNameSetup(): void {
    // Authenticated users must finish pseudo-name; send them to login instead of verify.
    if (hasStoredAuthTokens()) {
      return;
    }
    this.store.patch({ authStep: "login", authFieldErrors: {} });
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
        pseudo_name: "",
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
        authFieldErrors: { pseudo_name: "Pick a pseudo-name to continue." },
        pseudoNameDraft: trimmed,
      });
      return;
    }

    if (trimmed.length < 3) {
      this.store.patch({
        authFieldErrors: {
          pseudo_name: "Pseudo-name must be at least 3 characters.",
        },
        pseudoNameDraft: trimmed,
      });
      return;
    }

    if (trimmed.length > 50) {
      this.store.patch({
        authFieldErrors: {
          pseudo_name: "Pseudo-name must be 50 characters or fewer.",
        },
        pseudoNameDraft: trimmed,
      });
      return;
    }

    if (!hasStoredAuthTokens()) {
      this.store.patch({
        authFieldErrors: {
          _form: "Your session expired. Please log in to continue.",
        },
        authStep: "login",
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
      this.handleAuthFailure(
        error,
        "Could not save your profile. Please try again.",
      );
    }
  }

  showVenueSelect(): void {
    this.store.patch({
      authStep: "venue-select",
      authStepBeforeLocation: null,
      locationGateLoading: false,
      authLoading: false,
      guestContinueLoading: false,
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
      profileView: "main",
      activeTab: "home",
      settingsConfirm: null,
    });
    this.showVenueSelect();
  }

  dismissVenueSelect(): void {
    const state = this.store.get();
    const user = state.authUser;
    const selection = user ? loadVenueSelection(user.id) : null;
    const step = user ? resolveOnboardingStep(user, selection) : "venue-select";
    if (user && step === "home" && selection) {
      this.store.patch({
        selectedVenueId: selection.venueId,
        selectedGateId: selection.sectionId,
        authFieldErrors: {},
      });
      void this.enterSelectedVenue({
        skipLocationGate: true,
        welcomeToast: false,
        homeExperience: "returning",
      });
      return;
    }
    if (step === "pseudo-name") {
      this.showPseudoNameSetup();
      return;
    }
    this.showVenueSelect();
  }

  setVenueSearchQuery(query: string): void {
    this.store.patch({ venueSearchQuery: query });
  }

  selectOnboardingVenue(venueId: string): void {
    // Re-tapping the already-selected venue used to clear gates and reload,
    // which felt like the screen "went back" while scrolling the list.
    if (this.store.get().selectedVenueId === venueId) return;
    this.store.patch({
      selectedVenueId: venueId,
      selectedFloorId: null,
      selectedGateId: null,
      forumSections: [],
      forumFloors: [],
      authFieldErrors: {},
    });
    void this.loadOnboardingSections(venueId, false);
  }

  selectOnboardingGate(gateId: string): void {
    const state = this.store.get();
    if (state.selectedGateId === gateId) return;
    const patch: Partial<AppState> = { selectedGateId: gateId };
    if (Object.keys(state.authFieldErrors).length > 0) {
      patch.authFieldErrors = {};
    }
    this.store.patch(patch);
  }

  selectOnboardingFloor(floorId: string): void {
    const state = this.store.get();
    if (state.selectedFloorId === floorId) return;
    this.store.patch({ selectedFloorId: floorId, selectedGateId: null, forumSections: [] });
    if (state.selectedVenueId) void this.loadOnboardingSections(state.selectedVenueId);
  }

  submitVenueSelect(): void {
    if (this.store.get().guestAccessAllowed === false) {
      this.showToast("Your guest trial has ended. You can still view the map.");
      void this.routeExpiredGuestToReadonlyMap();
      return;
    }
    void this.enterSelectedVenue({ skipLocationGate: true });
  }

  private async loadOnboardingVenues(): Promise<void> {
    this.store.patch({ authLoading: true, authFieldErrors: {} });
    try {
      const venues = await listAllVenues();
      appLog(
        "Venue",
        "Venue coordinates received",
        venues.map((venue) => ({
          id: venue.id,
          name: venue.name,
          latitude: venue.latitude,
          longitude: venue.longitude,
        })),
      );
      const state = this.store.get();
      const forumVenues = venues.map((venue) => this.toVenueSummary(venue));
      const existingStillValid = forumVenues.some(
        (venue) => String(venue.id) === state.selectedVenueId,
      );
      const firstCatalog = forumVenues[0];
      const selectedVenueId = existingStillValid
        ? state.selectedVenueId
        : firstCatalog
          ? String(firstCatalog.id)
          : null;

      this.store.patch({
        forumVenues,
        selectedVenueId,
        selectedGateId: existingStillValid ? state.selectedGateId : null,
        forumSections: existingStillValid ? state.forumSections : [],
        authLoading: false,
        authFieldErrors: forumVenues.length
          ? {}
          : { _form: "No venues are available right now." },
      });

      if (selectedVenueId) {
        await this.loadOnboardingSections(selectedVenueId, false);
      }
    } catch (error) {
      this.handleAuthFailure(error, "Could not load venues. Please try again.");
    }
  }

  private async loadOnboardingSections(venueId: string, autoSelectFloor = true): Promise<void> {
    const numericId = Number(venueId);
    if (!Number.isFinite(numericId) || numericId <= 0) return;

    this.store.patch({ authLoading: true, authFieldErrors: {} });
    try {
      const { floors, categories } = await loadVenueCatalog(numericId);
      const state = this.store.get();
      if (state.selectedVenueId !== venueId) return;

      const selectedFloorId = floors.some((floor) => String(floor.id) === state.selectedFloorId)
        ? state.selectedFloorId
        : autoSelectFloor && floors[0] ? String(floors[0].id) : null;
      const sections = selectedFloorId
        ? await listAllSections(numericId, Number(selectedFloorId))
        : [];

      const sectionStillValid = sections.some(
        (section) => String(section.id) === state.selectedGateId,
      );

      this.store.patch({
        forumFloors: floors.map((floor) => ({ id: floor.id, venue: floor.venue, name: floor.name, order: floor.order })),
        selectedFloorId,
        forumSections: sections.map((section) =>
          this.toSectionSummary(section),
        ),
        forumCategories: categories.map((category) => ({
          id: category.id,
          name: category.name,
          slug: category.slug,
          description: category.description,
          disclaimer: category.disclaimer,
          iconUrl: category.icon_url ?? null,
          order: category.order,
          is_active: category.is_active,
        })),
        selectedGateId: sectionStillValid
          ? state.selectedGateId
          : defaultSectionId(sections),
        authLoading: false,
        authFieldErrors: !selectedFloorId || sections.length
          ? {}
          : { _form: "This venue has no sections yet." },
      });
    } catch (error) {
      this.handleAuthFailure(error, "Could not load sections for this venue.");
    }
  }

  private async enterSelectedVenue(options?: EnterVenueOptions): Promise<void> {
    if (!options?.holdEnterLock && this.venueEnterInFlight) return;

    const state = this.store.get();
    if (!state.selectedVenueId || !state.selectedGateId) {
      this.store.patch({
        authLoading: false,
        authFieldErrors: {},
      });
      this.showToast("Select a venue and entry gate to continue.");
      return;
    }

    const venueId = Number(state.selectedVenueId);
    if (!Number.isFinite(venueId) || venueId <= 0) {
      this.store.patch({
        authLoading: false,
        authFieldErrors: {},
      });
      this.showToast("That venue is unavailable. Please choose another venue.");
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

    if (!options?.holdEnterLock) {
      this.venueEnterInFlight = true;
    }
    this.homeFeedSnapshot = null;
    this.venueWideFeedSnapshot = null;
    this.allConversationNextPages = new Map();
    this.venueFeedScopeGeneration += 1;
    this.store.patch({
      authLoading: options?.holdEnterLock ? state.authLoading : true,
      authFieldErrors: {},
    });
    try {
      if (!venue) {
        try {
          const fetched = await getForumVenue(venueId);
          venue = this.toVenueSummary(fetched);
          forumVenues = [
            ...state.forumVenues.filter((item) => item.id !== fetched.id),
            venue,
          ];
        } catch (error) {
          appWarn("Venue", "Could not load venue name", error);
        }
      }

      let sections = state.forumSections;
      let categories = state.forumCategories;
      if (sections.length === 0 || categories.length === 0) {
        const catalog = await loadVenueCatalog(venueId);
        sections = catalog.sections.map((section) =>
          this.toSectionSummary(section),
        );
        categories = catalog.categories.map((category) => ({
          id: category.id,
          name: category.name,
          slug: category.slug,
          description: category.description,
          disclaimer: category.disclaimer,
          iconUrl: category.icon_url ?? null,
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
        flaggedPostIds: flaggedPostsLocalDatasource.load(this.flagViewerKey()),
        venueFeedFilter: "all",
        sectionHeatmap: [],
        sectionHeatmapActive: false,
        venueLiveStatus: "idle",
        venueOnlineCount: null,
        locationLiveStatus: "idle",
        socialLocation: null,
        socialLocationName: null,
        socialSectionId: null,
        authFieldErrors: {},
      });
      this.seenForumCommentIds.clear();
      this.homeFeedSnapshot = {
        posts: venueFeedPosts,
        next: feed.next,
        count: feed.count,
      };
      this.venueWideFeedSnapshot = null;
      this.allConversationNextPages = new Map();
      this.disconnectLocationLiveFeed();
      void this.hydrateVenueFeedCommentCounts();
      this.connectVenueLiveFeed(venueId);
      void this.bootstrapPersonalNotifications();
      await this.ensureMapForSelectedVenue();
      if (this.store.get().mapStatus === "error") {
        const message =
          this.store.get().mapError ||
          this.store.get().loadingMessage ||
          "This venue is not available yet.";
        this.store.patch({ authLoading: false });
        this.showToast(message);
        return;
      }
      if (options?.welcomeToast !== false) {
        this.showToast(
          venue
            ? `Welcome to ${venue.name}. You're in.`
            : "Welcome to fplaces!",
        );
      }

      // Location dialog only after create / sign-in / guest - not after venue pick.
      if (options?.skipLocationGate || this.store.get().userLocation) {
        this.completeOnboarding({
          homeExperience: options?.homeExperience,
          landOn: options?.landOn,
          activeTab: options?.activeTab,
        });
      } else {
        this.beginLocationPermissionGate();
      }
    } catch (error) {
      this.handleAuthFailure(
        error,
        "Could not load the venue feed. Please try again.",
      );
    } finally {
      if (!options?.holdEnterLock) {
        this.venueEnterInFlight = false;
      }
    }
  }

  private connectVenueLiveFeed(venueId: number): void {
    this.disconnectVenueLiveFeed();
    if (!Number.isFinite(venueId) || venueId <= 0) return;
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
    this.store.patch({ venueLiveStatus: "idle", venueOnlineCount: null });
  }

  private disconnectLocationLiveFeed(): void {
    this.locationLiveSubscription?.disconnect();
    this.locationLiveSubscription = null;
    this.store.patch({ locationLiveStatus: "idle" });
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
      appWarn("Notifications", "Initial inbox fetch failed", error);
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
  }

  private disconnectPersonalNotifications(): void {
    this.personalNotificationsSubscription?.disconnect();
    this.personalNotificationsSubscription = null;
  }

  private applyPersonalNotificationEvent(
    event: PersonalNotificationEvent,
  ): void {
    if (!this.store.get().notificationsEnabled) return;

    const state = this.store.get();
    const next = applyPersonalNotificationEvent(
      {
        notifications: state.notifications.map(notificationItemToDomain),
        unreadCount: state.notificationsUnreadCount,
      },
      event,
    );
    if (
      next.notifications.length === state.notifications.length &&
      next.unreadCount === state.notificationsUnreadCount
    ) {
      return;
    }

    this.store.patch({
      notifications: next.notifications.map(mapNotificationToItem),
      notificationsUnreadCount: next.unreadCount,
    });
  }

  private applyVenueLiveEvent(event: VenueLiveEvent): void {
    switch (event.type) {
      case "new_post": {
        this.mergeForumPostIntoFeed(event.post);
        return;
      }
      case "new_comment": {
        this.mergeLiveForumComment(event.comment);
        return;
      }
      case "upvote_update": {
        const state = this.store.get();
        const postId = String(event.update.postId);
        const upvoted = event.update.upvoted;
        const authUser = this.withUpvotedRecentPosts(
          state.authUser,
          postId,
          event.update.upvotesCount,
        );
        this.patchParkedFeedPosts(postId, (post) => ({
          ...post,
          upvotes: event.update.upvotesCount,
          ...(typeof upvoted === "boolean" ? { hasUpvoted: upvoted } : {}),
        }));
        if (state.socialLocation) {
          this.store.patch({
            authUser,
            ...(typeof upvoted === "boolean"
              ? {
                  upvotedPostIds: upvoted
                    ? [...new Set([...state.upvotedPostIds, postId])]
                    : state.upvotedPostIds.filter((id) => id !== postId),
                }
              : {}),
          });
          return;
        }
        const venueFeedPosts = state.venueFeedPosts.map((post) =>
          post.id === postId
            ? {
                ...post,
                upvotes: event.update.upvotesCount,
                ...(typeof upvoted === "boolean"
                  ? { hasUpvoted: upvoted }
                  : {}),
              }
            : post,
        );
        let upvotedPostIds = state.upvotedPostIds;
        if (typeof upvoted === "boolean") {
          upvotedPostIds = upvoted
            ? [...new Set([...state.upvotedPostIds, postId])]
            : state.upvotedPostIds.filter((id) => id !== postId);
        }
        this.store.patch({ venueFeedPosts, upvotedPostIds, authUser });
        return;
      }
      case "post_hidden": {
        const postId = String(event.postId);
        this.removeFromVenueWideSnapshot(postId);
        if (this.store.get().socialLocation) return;
        this.removeVenueFeedPost(postId);
        this.syncSocialMapMarkers();
        return;
      }
      case "section_heat_update": {
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
      case "presence_update": {
        this.store.patch({ venueOnlineCount: event.onlineCount });
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
    if (this.store.get().authStep === "reset-password-confirm") {
      this.ensureStartupReady();
      return;
    }
    if (this.tryOpenPasswordResetFromUrl()) {
      this.ensureStartupReady();
      return;
    }

    if (this.pendingSessionRecovery) {
      this.applyPendingSessionRecovery();
      this.ensureStartupReady();
      return;
    }

    // Fingerprint + guest validation. Skip the global auth spinner when the
    // marketing/sign-in/home shell is already queued under the splash.
    if (!this.shellDestinationApplied && !this.store.get().startupReady) {
      this.store.patch({ authLoading: true, authFieldErrors: {} });
    }
    const guestGatePassed = await this.resolveGuestFingerprintGate();
    if (!guestGatePassed) {
      this.ensureStartupReady();
      return;
    }
    if (this.finishIfInvalidTokenRecovery()) {
      return;
    }

    const returning =
      loadReturningSession() ?? this.inferReturningSessionFromLocalAuth();
    const destination = resolveStartupDestination({
      hasReturningSession: isReturningSession(returning),
      hasAuthTokens: hasStoredAuthTokens(),
      deviceHasUsedApp: hasDeviceUsedApp() || Boolean(loadStoredUser()),
    });

    if (destination === "app" && isReturningSession(returning)) {
      await this.restoreReturningSession(returning);
      this.ensureStartupReady();
      return;
    }

    if (destination === "app" && hasStoredAuthTokens()) {
      this.store.patch({ authLoading: true, authFieldErrors: {} });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          void this.resumeAuthSession().finally(() =>
            this.ensureStartupReady(),
          );
        });
      });
      return;
    }

    if (destination === "sign-in") {
      markDeviceHasUsedApp();
      this.store.patch({
        authLoading: false,
        authFieldErrors: {},
        authLegalDocument: null,
        legalWebView: null,
      });
      if (this.pendingSessionRecovery === "invalid-token") {
        this.applyPendingSessionRecovery();
      } else {
        this.showLogin();
      }
      this.ensureStartupReady();
      return;
    }

    if (this.finishIfInvalidTokenRecovery()) {
      return;
    }

    this.store.patch({
      authStep: "none",
      authLoading: false,
      authFieldErrors: {},
    });
    this.ensureStartupReady();
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
    if (!selection || resolveOnboardingStep(user, selection) !== "home") {
      return null;
    }
    return {
      onboardingComplete: true,
      mode: "auth",
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
      authStep: "none",
      authStepBeforeLocation: null,
      authLoading: true,
      authFieldErrors: {},
      navigateView: "home",
      homeExperience: "returning",
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
          (venueId && gateId ? { venueId, sectionId: gateId } : null);
        const step = resolveOnboardingStep(user, selection);
        if (step !== "home" || !selection) {
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
          homeExperience: "returning",
        });
        return;
      } catch (error) {
        clearStoredAuthTokens();
        clearStoredAuthUser();
        this.store.patch({ authUser: null });
        appWarn("Auth", "Returning session tokens expired", error);

        if (
          isInvalidAccessTokenFailure(error) ||
          this.store.get().createAccountPrompt === "invalid-token"
        ) {
          this.routeToCreateAccountForInvalidToken();
          return;
        }

        if (snapshot.mode !== "guest" || !venueId || !gateId) {
          clearReturningSession();
          this.store.patch({
            authLoading: false,
            onboardingComplete: false,
            selectedVenueId: null,
            selectedGateId: null,
          });
          this.showLogin();
          this.showToast("Session expired. Please log in again.");
          return;
        }
        // Guest-mode snapshot can still restore after JWT wipe.
      }
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
        homeExperience: "returning",
      });
      return;
    }

    this.store.patch({ authLoading: false, onboardingComplete: false });
    this.showVenueSelect();
  }

  /**
   * Generate the browser fingerprint and obtain/refresh a guest JWT via
   * POST /api/users/guest/. Expired guests continue into read-only map
   * browsing; route point selection and AR are blocked closer to those actions.
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
      appLog("Guest", "Guest session validated", {
        visitorId: result.visitorId,
        allowed: result.allowed,
        guestId: result.guestId,
        reason: result.reason,
        trialExpiresAt: result.session?.trialExpiresAt,
      });

      if (!result.allowed && !hasStoredAuthTokens()) {
        markDeviceHasUsedApp();
        this.showToast(
          `${guestDenialUserMessage(result.reason)} You can still view the map.`,
        );
      }

      return true;
    } catch (error) {
      // Fail open for anonymous users so a guest-API outage does not brick onboarding.
      appWarn("Guest", "Guest token validation failed; continuing", error);
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
        guestContinueLoading: false,
      });
      return true;
    }
  }

  private async resumeAuthSession(): Promise<void> {
    if (this.authResumeInFlight) return;

    const state = this.store.get();
    if (state.onboardingComplete) {
      return;
    }

    if (!hasStoredAuthTokens()) {
      // Stay on welcome/onboarding when there is no stored session.
      return;
    }

    // Only auto-route from the idle gate; leave in-progress auth forms alone.
    if (state.authStep !== "none") {
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
      appWarn("Auth", "Stored session expired", error);
      if (
        isInvalidAccessTokenFailure(error) ||
        this.store.get().createAccountPrompt === "invalid-token"
      ) {
        this.routeToCreateAccountForInvalidToken();
      } else {
        this.showLogin();
        this.showToast("Session expired. Please log in again.");
      }
    } finally {
      this.authResumeInFlight = false;
    }
  }

  showCreateAccount(): void {
    this.store.patch({ authStep: "create", authFieldErrors: {} });
  }

  dismissInvalidTokenDialog(): void {
    this.store.patch({ createAccountPrompt: null });
  }

  /**
   * Skip account creation and continue anonymously when the guest fingerprint
   * gate allows it. Location dialog is shown next; venue select comes after.
   */
  async continueAsGuest(): Promise<void> {
    const state = this.store.get();

    markDeviceHasUsedApp();
    const fromWelcome = state.authStep === "none";
    this.store.patch({
      authLoading: true,
      authFieldErrors: {},
      guestContinueLoading: true,
    });
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
        this.showToast(
          `${guestDenialUserMessage(result.reason)} You can still view the map.`,
        );
        await this.routeExpiredGuestToReadonlyMap();
        return;
      }

      this.store.patch({
        authFieldErrors: {},
        authLegalDocument: null,
        legalWebView: null,
      });
      // Keep Continuing… until the location dialog (or next screen) is ready.
      await this.beginLocationPermissionGate();
    } catch (error) {
      appWarn("Guest", "Continue as guest failed", error);
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Could not continue as guest. Please try again.";
      this.store.patch({
        authLoading: false,
        guestContinueLoading: false,
        authFieldErrors: {
          _form: message,
        },
      });
      if (fromWelcome) {
        this.showToast(message);
      }
    }
  }

  dismissCreateAccount(): void {
    const state = this.store.get();
    if (state.guestAccessAllowed === false && state.selectedVenueId) {
      this.store.patch({
        authStep: "none",
        authFieldErrors: {},
        authLegalDocument: null,
        legalWebView: null,
        createAccountPrompt: null,
        onboardingComplete: true,
        activeTab: "map",
        navigateView: "map",
      });
      return;
    }

    if (state.guestAccessAllowed === false) {
      this.store.patch({
        authStep: "venue-select",
        authFieldErrors: {},
        authLegalDocument: null,
        legalWebView: null,
        createAccountPrompt: null,
      });
      return;
    }

    this.store.patch({
      authStep: "none",
      authFieldErrors: {},
      authLegalDocument: null,
      legalWebView: null,
    });
  }

  showLogin(): void {
    if (
      this.pendingSessionRecovery === "invalid-token" ||
      this.store.get().createAccountPrompt === "invalid-token"
    ) {
      this.routeToCreateAccountForInvalidToken();
      return;
    }
    markDeviceHasUsedApp();
    this.store.patch({
      authStep: "login",
      checkEmailPurpose: null,
      authFieldErrors: {},
      authLegalDocument: null,
      legalWebView: null,
      createAccountPrompt: null,
    });
  }

  async loadSavedPasswordCredential(): Promise<SavedPasswordCredential | null> {
    return loadSavedPasswordCredential();
  }

  private rememberPasswordCredential(email: string, password: string): void {
    void savePasswordCredential({ email, password });
  }

  dismissLogin(): void {
    this.store.patch({
      authStep: "none",
      authFieldErrors: {},
      authLegalDocument: null,
      legalWebView: null,
    });
  }

  showForgotPassword(): void {
    this.store.patch({
      authStep: "forgot-password",
      authFieldErrors: {},
      authLegalDocument: null,
      legalWebView: null,
    });
  }

  dismissForgotPassword(): void {
    this.store.patch({
      authStep: "login",
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
    this.pendingSessionRecovery = null;
    this.store.patch({
      onboardingComplete: false,
      authStep: "reset-password-confirm",
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
      authStep: "reset-password-confirm",
      passwordResetUid: uid,
      passwordResetToken: token,
      authFieldErrors: {},
      authLegalDocument: null,
      legalWebView: null,
    });
  }

  dismissResetPasswordConfirm(): void {
    this.store.patch({
      authStep: "login",
      passwordResetUid: "",
      passwordResetToken: "",
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
        "This reset link is invalid or expired. Request a new one.";
    }
    if (!newPassword) {
      fieldErrors.new_password = "New password is required.";
    } else if (evaluatePasswordStrength(newPassword) !== "strong") {
      fieldErrors.new_password =
        "Use at least 8 characters with a letter and a number.";
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
      this.rememberPasswordCredential(state.authEmail, newPassword);
      this.store.patch({
        authLoading: false,
        authFieldErrors: {},
        authStep: "login",
        checkEmailPurpose: null,
        passwordResetUid: "",
        passwordResetToken: "",
      });
      this.showToast(message || "Password updated. You can log in now.");
    } catch (error) {
      this.handleAuthFailure(
        error,
        "Could not reset your password. The link may have expired.",
      );
    }
  }

  async submitForgotPassword(email: string): Promise<void> {
    const fieldErrors: Record<string, string> = {};
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      fieldErrors.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      fieldErrors.email = "Enter a valid email address.";
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
        authStep: "check-email",
        checkEmailPurpose: "password-reset",
      });
      this.showToast(message || "Reset link sent. Check your email.");
    } catch (error) {
      this.handleAuthFailure(
        error,
        error instanceof TypeError
          ? "Cannot reach the password reset service. Try again."
          : "Could not send a reset link. Please try again.",
      );
    }
  }

  openAuthTerms(): void {
    this.store.patch({ legalWebView: "terms" });
  }

  openAuthPrivacy(): void {
    this.store.patch({ authLegalDocument: "privacy" });
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
      fieldErrors.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      fieldErrors.email = "Enter a valid email address.";
    }

    if (!password) {
      fieldErrors.password = "Password is required.";
    } else if (evaluatePasswordStrength(password) !== "strong") {
      fieldErrors.password =
        "Use at least 8 characters with a letter and a number.";
    }

    if (!passwordConfirm) {
      fieldErrors.password_confirm = "Please confirm your password.";
    } else if (password !== passwordConfirm) {
      fieldErrors.password_confirm = "Passwords must match.";
    }

    if (!termsAccepted) {
      fieldErrors.terms =
        "Please agree to the Terms of Service and Privacy Policy.";
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
        authStep: "verify",
        authFieldErrors: {},
      });
    } catch (error) {
      this.pendingAuthPassword = null;
      this.handleAuthFailure(
        error,
        error instanceof TypeError
          ? "Cannot reach the registration service. Restart the dev server and try again."
          : "Could not create your account. Please try again.",
      );
    }
  }

  dismissCheckEmail(): void {
    const purpose = this.store.get().checkEmailPurpose;
    this.store.patch({
      authStep: purpose === "password-reset" ? "forgot-password" : "create",
      checkEmailPurpose: null,
      authFieldErrors: {},
    });
  }

  /** Resend from the check-email screen: verify OTP or password-reset link. */
  async resendCheckEmail(): Promise<boolean> {
    const state = this.store.get();
    if (state.checkEmailPurpose === "password-reset") {
      const email = state.authEmail.trim();
      if (!email) {
        this.showToast("Missing email for password reset.");
        return false;
      }
      this.store.patch({ authLoading: true });
      try {
        const message = await requestPasswordReset(email);
        this.store.patch({ authLoading: false });
        this.showToast(message || "Reset link sent. Check your email.");
        return true;
      } catch (error) {
        this.store.patch({ authLoading: false });
        const message =
          error instanceof AuthApiError
            ? error.summary
            : "Could not resend the reset link.";
        this.showToast(message);
        appWarn("Auth", "Resend password reset failed", error);
        return false;
      }
    }
    return this.resendVerificationCode();
  }

  dismissVerifyEmail(): void {
    this.store.patch({ authStep: "create", authFieldErrors: {} });
  }

  async submitVerification(otp: string): Promise<void> {
    const state = this.store.get();
    const email = state.authEmail || state.authUser?.email || "";
    const trimmedOtp = otp.trim();
    const fieldErrors: Record<string, string> = {};

    if (!isCompleteOtpCode(trimmedOtp)) {
      fieldErrors.otp = "Enter the 6-digit code from your email.";
    }

    if (!email) {
      fieldErrors._form =
        "Missing email for verification. Please sign up again.";
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
            _form: "Verification did not complete. Please try again.",
          },
        });
        return;
      }

      let user = verifiedUser;
      const password = this.pendingAuthPassword;
      this.pendingAuthPassword = null;
      if (password) {
        this.rememberPasswordCredential(email, password);
      }

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
            authStep: "login",
            authFieldErrors: {
              _form:
                loginError instanceof AuthApiError
                  ? "Email verified. Please log in to continue setup."
                  : "Email verified. Log in to finish setting up your profile.",
            },
          });
          this.showToast("Email verified. Please log in to continue.");
          return;
        }
      } else if (!hasStoredAuthTokens()) {
        this.persistSessionUser(verifiedUser);
        this.store.patch({
          authLoading: false,
          authUser: verifiedUser,
          authEmail: email,
          authStep: "login",
          authFieldErrors: {
            _form: "Email verified. Please log in to continue setup.",
          },
        });
        this.showToast("Email verified. Please log in to continue.");
        return;
      }

      this.persistSessionUser(user);
      this.store.patch({
        authUser: user,
        authEmail: user.email,
        authFieldErrors: {},
      });
      await this.continueAfterAuthenticated(user, { promptLocation: true });
      this.showToast(
        userNeedsPseudoName(user)
          ? "Email verified. Pick a name to continue."
          : "Email verified.",
      );
    } catch (error) {
      this.handleAuthFailure(
        error,
        error instanceof TypeError
          ? "Cannot reach the verification service. Try again."
          : "Could not verify your email. Please try again.",
      );
    }
  }

  async submitLogin(email: string, password: string): Promise<void> {
    const fieldErrors: Record<string, string> = {};
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      fieldErrors.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      fieldErrors.email = "Enter a valid email address.";
    }

    if (!password) {
      fieldErrors.password = "Password is required.";
    } else if (password.length < 8) {
      fieldErrors.password = "Password must be at least 8 characters.";
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
      this.rememberPasswordCredential(trimmedEmail, password);
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
          ? "Cannot reach the login service. Try again."
          : "Could not log in. Check your email and password.",
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
            : "Google sign-in failed. Please try again.";
      this.store.patch({
        authLoading: false,
        authFieldErrors: { _form: message },
      });
      appWarn("Auth", "Google sign-in failed", error);
    }
  }

  async logout(): Promise<void> {
    this.store.patch({ authLoading: true, settingsConfirm: "logout" });
    this.disconnectVenueLiveFeed();
    this.disconnectLocationLiveFeed();
    this.disconnectPersonalNotifications();
    try {
      await logoutUser();
    } catch (error) {
      clearStoredAuthTokens();
      appWarn("Auth", "Logout request failed; cleared local session", error);
    }
    this.resetAuthState({ showLogin: true, toast: "Logged out." });
  }

  async deleteAccount(): Promise<void> {
    const userId = this.store.get().authUser?.id;
    this.store.patch({ authLoading: true, settingsConfirm: "delete-account" });
    this.disconnectVenueLiveFeed();
    this.disconnectLocationLiveFeed();
    this.disconnectPersonalNotifications();

    try {
      await deleteCurrentAccount();
      if (typeof userId === "number") {
        clearVenueSelection(userId);
      }
      this.resetAuthState({
        showCreate: true,
        toast: "Your account has been deleted.",
        preserveAsNewDevice: true,
      });
    } catch (error) {
      this.store.patch({ authLoading: false, settingsConfirm: null });
      const message =
        error instanceof AuthApiError
          ? error.summary
          : error instanceof Error
            ? error.message
            : "Could not delete your account.";
      this.showToast(message);
      appWarn("Auth", "Delete account failed", error);
    }
  }

  private resetAuthState(options?: {
    showCreate?: boolean;
    showLogin?: boolean;
    formError?: string;
    toast?: string;
    createAccountPrompt?: "invalid-token" | null;
    /** After account deletion, allow marketing onboarding again. */
    preserveAsNewDevice?: boolean;
  }): void {
    this.pendingAuthPassword = null;
    clearStoredAuthUser();
    clearAllVenueSelections();
    clearReturningSession();
    venueVisitRepository.clear();
    if (options?.preserveAsNewDevice) {
      clearDeviceHasUsedApp();
    } else {
      markDeviceHasUsedApp();
    }
    this.disconnectVenueLiveFeed();
    this.disconnectLocationLiveFeed();
    this.disconnectPersonalNotifications();
    this.stopLiveUserLocationWatch();
    this.homeFeedSnapshot = null;
    this.venueWideFeedSnapshot = null;
    this.allConversationNextPages = new Map();
    this.venueFeedScopeGeneration += 1;
    const storedLocation = permissionChoiceLocalDatasource.loadLocation();
    this.store.patch({
      authUser: null,
      authEmail: "",
      authLoading: false,
      profileEditSaving: false,
      authFieldErrors: options?.formError ? { _form: options.formError } : {},
      authStep: "none",
      authStepBeforeLocation: null,
      onboardingComplete: false,
      homeExperience: "returning",
      userLocation: null,
      locationPermission: storedLocation,
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
      guestContinueLoading: false,
      createAccountPrompt: options?.createAccountPrompt ?? null,
      pseudoNameDraft: "",
      pseudoNameHint: "",
      selectedInterests: [],
      selectedVenueId: null,
      selectedGateId: null,
      forumVenues: [],
      homeContent: null,
      forumSections: [],
      forumCategories: [],
      forumFeedNext: null,
      forumFeedCount: 0,
      sectionHeatmap: [],
      sectionHeatmapActive: false,
      venueLiveStatus: "idle",
      venueOnlineCount: null,
      locationLiveStatus: "idle",
      socialLocation: null,
      socialLocationName: null,
      venueFeedPosts: [],
      venueFeedFilter: "all",
      venueFeedLoading: false,
      venueFeedLoadingMore: false,
      venueFeedSubmitting: false,
      upvotedPostIds: [],
      flaggedPostIds: [],
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
      postCommentsDraft: "",
      postCommentsLoading: false,
      postCommentsSubmitting: false,
      postCommentsEditing: false,
      postCommentsError: null,
      profileView: "main",
      settingsConfirm: null,
      productTourStepIndex: null,
      productTourStepIds: [],
      productTourCompleted: options?.preserveAsNewDevice
        ? false
        : this.store.get().productTourCompleted,
      productTourEnabled: options?.preserveAsNewDevice
        ? true
        : this.store.get().productTourEnabled,
    });
    if (options?.preserveAsNewDevice) {
      this.productTourDismissedThisSession = false;
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
    if (storedLocation === "granted") {
      this.startLiveUserLocationWatch();
    }
  }

  private handleAuthSessionExpired(
    reason: AuthSessionClearedReason = "expired",
  ): void {
    if (this.handlingSessionExpiry) return;
    this.handlingSessionExpiry = true;
    try {
      this.disconnectVenueLiveFeed();
      this.disconnectLocationLiveFeed();
      this.disconnectPersonalNotifications();
      if (reason !== "guest-expired") {
        clearReturningSession();
      }
      clearStoredAuthUser();
      markDeviceHasUsedApp();
      this.pendingSessionRecovery = reason;
      this.store.patch({
        authUser: null,
        onboardingComplete:
          reason === "guest-expired"
            ? this.store.get().onboardingComplete
            : false,
        authLoading: false,
      });

      if (
        shouldDeferSessionRecoveryUi({
          startupReady: this.store.get().startupReady,
          authShellVisible: this.shellDestinationApplied,
          authFlowBootstrapped: this.authFlowBootstrapped,
        })
      ) {
        return;
      }

      this.applyPendingSessionRecovery();
    } finally {
      this.handlingSessionExpiry = false;
    }
  }

  private applyPendingSessionRecovery(): void {
    const recovery = this.pendingSessionRecovery;
    if (!recovery) return;
    this.pendingSessionRecovery = null;
    if (recovery === "guest-expired") {
      void this.routeExpiredGuestToReadonlyMap();
      this.store.patch({
        authLoading: false,
        guestAccessAllowed: false,
        guestAccessReason: "Guest trial expired",
        createAccountPrompt: null,
      });
      this.showToast("Your guest trial has ended. You can still view the map.");
      return;
    }
    if (recovery === "invalid-token") {
      this.routeToCreateAccountForInvalidToken();
      return;
    }
    this.resetAuthState({
      showLogin: true,
      formError: "Your session expired. Please log in again.",
      toast: "Session expired. Please log in again.",
    });
  }

  private finishIfInvalidTokenRecovery(): boolean {
    if (
      this.pendingSessionRecovery !== "invalid-token" &&
      this.pendingSessionRecovery !== "guest-expired" &&
      this.store.get().createAccountPrompt !== "invalid-token"
    ) {
      return false;
    }
    this.applyPendingSessionRecovery();
    this.ensureStartupReady();
    return true;
  }

  private routeToCreateAccountForInvalidToken(): void {
    this.pendingSessionRecovery = null;
    this.ensureStartupReady();
    const alreadyPrompted =
      this.store.get().authStep === "create" &&
      this.store.get().createAccountPrompt === "invalid-token";
    if (alreadyPrompted) return;

    this.resetAuthState({
      showCreate: true,
      createAccountPrompt: "invalid-token",
    });
    this.store.patch({
      guestAccessAllowed: false,
    });
  }

  private async routeExpiredGuestToReadonlyMap(): Promise<void> {
    const state = this.store.get();
    this.store.patch({
      authLoading: false,
      guestContinueLoading: false,
      guestAccessAllowed: false,
      guestAccessReason: "Guest trial expired",
      createAccountPrompt: null,
      authFieldErrors: {},
      authLegalDocument: null,
      legalWebView: null,
    });

    if (state.selectedVenueId && state.selectedGateId) {
      this.store.patch({
        authStep: "none",
        onboardingComplete: true,
        activeTab: "map",
        navigateView: "map",
        showRouteSheet: false,
      });
      await this.ensureMapForSelectedVenue();
      return;
    }

    this.showVenueSelect();
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
      appWarn("Auth", "Could not refresh profile after onboarding step", error);
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
      authFieldErrors: {},
      authLegalDocument: null,
      legalWebView: null,
    });

    // Keep Logging in… / Continuing… until the next destination is on screen
    // (location dialog, pseudo-name, venue select, or home). Clearing the
    // spinner here flashes the idle login button before that route is ready.

    if (options?.promptLocation) {
      await this.beginLocationPermissionGate();
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

    if (step === "pseudo-name") {
      this.showPseudoNameSetup();
      return;
    }

    if (step === "venue-select") {
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
      homeExperience: "returning",
    });
  }

  private handleAuthFailure(error: unknown, fallbackMessage: string): void {
    if (isInvalidAccessTokenFailure(error)) {
      if (this.shouldRecoverAuthFailureAsReadonlyGuest()) {
        this.showToast("Your guest trial has ended. You can still view the map.");
        void this.routeExpiredGuestToReadonlyMap();
        return;
      }
      this.routeToCreateAccountForInvalidToken();
      return;
    }
    if (error instanceof AuthApiError) {
      const knownFields = new Set([
        "email",
        "password",
        "password_confirm",
        "old_password",
        "new_password",
        "uid",
        "token",
        "otp",
        "pseudo_name",
        "id_token",
        "_form",
      ]);
      const fieldErrors: Record<string, string> = {};
      const orphanMessages: string[] = [];

      for (const [key, message] of Object.entries(error.fieldErrors)) {
        const userMessage = resolveUserFacingApiErrorMessage(
          message,
          fallbackMessage,
        );
        if (knownFields.has(key)) {
          fieldErrors[key] = userMessage;
        } else if (userMessage.trim()) {
          orphanMessages.push(userMessage);
        }
      }

      if (Object.keys(fieldErrors).length === 0 || orphanMessages.length > 0) {
        fieldErrors._form =
          fieldErrors._form ||
          orphanMessages[0] ||
          resolveUserFacingApiErrorMessage(error.summary, fallbackMessage);
      }

      if (containsTokenNotValidDetail(fieldErrors)) {
        this.routeToCreateAccountForInvalidToken();
        return;
      }

      this.store.patch({
        authLoading: false,
        profileEditSaving: false,
        authFieldErrors: fieldErrors,
      });
      return;
    }

    this.store.patch({
      authLoading: false,
      profileEditSaving: false,
      authFieldErrors: { _form: fallbackMessage },
    });
    appWarn("Auth", fallbackMessage, error);
  }

  private shouldRecoverAuthFailureAsReadonlyGuest(): boolean {
    const state = this.store.get();
    return (
      !state.authUser &&
      (state.guestAccessAllowed === false ||
        Boolean(state.guestId) ||
        state.authStep === "venue-select")
    );
  }

  async resendVerificationCode(): Promise<boolean> {
    const state = this.store.get();
    const email = state.authEmail || state.authUser?.email || "";
    if (!email) {
      this.showToast("Missing email for verification.");
      return false;
    }

    try {
      await resendVerification(email);
      this.showToast("Code sent. Check your email.");
      return true;
    } catch (error) {
      const message =
        error instanceof AuthApiError
          ? error.summary
          : "Could not resend the verification code.";
      this.showToast(message);
      appWarn("Auth", "Resend verification failed", error);
      return false;
    }
  }

  setSocialCategory(category: SocialCategory): void {
    this.store.patch({
      socialCategory: category,
      socialDraft: this.captureSocialDraft(),
    });
  }

  setSocialLocation(
    _locationId: string | null,
    _locationName?: string | null,
  ): void {
    this.store.patch({
      activeTab: "social",
      socialLocation: null,
      socialLocationName: null,
      venueFeedDraft: this.captureVenueFeedDraft(),
    });
  }

  /** Back to all venue posts from a single location thread. */
  clearSocialLocation(): void {
    this.store.patch({
      socialLocation: null,
      socialLocationName: null,
      venueFeedDraft: this.captureVenueFeedDraft(),
    });
    if (this.venueWideFeedSnapshot) {
      this.restoreVenueWideFeed();
      return;
    }
    this.restoreHomeFeedSnapshot();
  }

  private captureHomeFeedSnapshot(state: AppState): void {
    if (state.venueFeedPosts.some((post) => isConversationFeedItem(post))) {
      return;
    }
    this.homeFeedSnapshot = {
      posts: state.venueFeedPosts,
      next: state.forumFeedNext,
      count: state.forumFeedCount,
    };
  }

  private restoreHomeFeedSnapshot(): void {
    this.disconnectLocationLiveFeed();
    this.venueFeedScopeGeneration += 1;
    const snapshot = this.homeFeedSnapshot;
    if (!snapshot) {
      this.store.patch({ venueFeedLoading: false });
      return;
    }
    this.store.patch({
      venueFeedPosts: snapshot.posts,
      forumFeedNext: snapshot.next,
      forumFeedCount: snapshot.count,
      venueFeedLoading: false,
    });
  }

  private applyConversationNextPages(
    nextByLocation: Map<string, number>,
  ): string | null {
    this.allConversationNextPages = nextByLocation;
    return nextByLocation.size ? VENUE_ALL_CONVERSATIONS_NEXT : null;
  }

  private restoreVenueWideFeed(): void {
    this.disconnectLocationLiveFeed();
    const snapshot = this.venueWideFeedSnapshot;
    this.venueWideFeedSnapshot = null;
    this.venueFeedScopeGeneration += 1;
    if (!snapshot) {
      this.store.patch({ venueFeedLoading: false });
      return;
    }
    this.allConversationNextPages = snapshot.conversationNextPages
      ? new Map(snapshot.conversationNextPages)
      : new Map();
    this.store.patch({
      venueFeedPosts: snapshot.posts,
      forumFeedNext: snapshot.next,
      forumFeedCount: snapshot.count,
      venueFeedLoading: false,
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
    this.setSocialLocation(prompt.locationId, prompt.name);
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
    if (await this.blockNavigationOutsideVenue()) return;

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
        activeTab: "map",
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
              searchQuery: "",
              searchResults: [],
            }
          : {}),
      });

      void this.maybeAutoStartBlueDot();
      if (hasDestination) {
        this.scheduleAutoRoute();
      } else if (continueArSetup) {
        this.pendingMapSearchFocus = true;
        this.showToast("Now pick your destination.");
      }
    } catch (error) {
      this.showToast(
        toUserFacingRouteError(error, "Could not set start point."),
      );
    }
  }

  private async setDestinationFromLocationCard(
    selection: LocationCardSelection,
  ): Promise<void> {
    if (!this.routePlanner) return;
    if (await this.blockNavigationOutsideVenue()) return;

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
        activeTab: "map",
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
        toUserFacingRouteError(error, "Could not set destination."),
      );
    }
  }

  async setVenueFeedFilter(filter: VenueFeedFilter): Promise<void> {
    const categoryId = filter === "all" ? undefined : Number(filter);
    if (filter !== "all" && (!Number.isFinite(categoryId) || categoryId! <= 0)) {
      return;
    }
    const state = this.store.get();
    if (
      filter !== "all" &&
      !state.forumCategories.some((category) => category.id === categoryId)
    ) {
      return;
    }
    const venueId = Number(state.selectedVenueId);
    this.store.patch({
      venueFeedFilter: filter,
      venueFeedDraft: this.captureVenueFeedDraft(),
      socialLocation: null,
      socialLocationName: null,
    });
    if (!Number.isFinite(venueId) || venueId <= 0) return;

    const generation = ++this.venueFeedScopeGeneration;
    this.disconnectLocationLiveFeed();
    this.store.patch({
      venueFeedLoading: true,
      venueFeedPosts: [],
      forumFeedNext: null,
      forumFeedCount: 0,
    });
    try {
      const response = await listVenuePosts({
        venue: venueId,
        category: categoryId,
        section: state.socialSectionId ? Number(state.socialSectionId) : undefined,
        latest: true,
        page: 1,
      });
      if (generation !== this.venueFeedScopeGeneration) return;
      const current = this.store.get();
      if (current.venueFeedFilter !== filter) return;
      const venueFeedPosts = mapForumPostsToVenueFeed(
        response.results,
        current.forumSections,
        current.forumCategories,
      );
      this.store.patch({
        venueFeedPosts,
        forumFeedNext: response.next,
        forumFeedCount: response.count,
        venueFeedLoading: false,
      });
      void this.hydrateVenueFeedCommentCounts(
        venueFeedPosts.map((post) => Number(post.id)),
      );
    } catch (error) {
      if (generation !== this.venueFeedScopeGeneration) return;
      this.store.patch({ venueFeedLoading: false });
      appWarn("Forum", "Load category feed failed", error);
      this.showToast("Could not load that category. Please try again.");
    }
  }

  async setVenueFeedSection(sectionId: string | null): Promise<void> {
    const state = this.store.get();
    const normalized = sectionId?.trim() || null;
    if (
      normalized &&
      !state.forumSections.some((section) => String(section.id) === normalized)
    ) {
      return;
    }
    if ((state.socialSectionId ?? null) === normalized) return;

    const venueId = Number(state.selectedVenueId);
    const categoryId =
      state.venueFeedFilter === "all" ? undefined : Number(state.venueFeedFilter);
    if (
      state.venueFeedFilter !== "all" &&
      (!Number.isFinite(categoryId) || categoryId! <= 0)
    ) {
      return;
    }

    this.store.patch({
      socialSectionId: normalized,
      venueFeedDraft: this.captureVenueFeedDraft(),
      socialLocation: null,
      socialLocationName: null,
    });
    if (!Number.isFinite(venueId) || venueId <= 0) return;

    const generation = ++this.venueFeedScopeGeneration;
    this.disconnectLocationLiveFeed();
    this.store.patch({
      venueFeedLoading: true,
      venueFeedPosts: [],
      forumFeedNext: null,
      forumFeedCount: 0,
    });
    try {
      const section = normalized ? Number(normalized) : undefined;
      const response = await listVenuePosts({
        venue: venueId,
        category: categoryId,
        section,
        latest: true,
        page: 1,
      });
      if (generation !== this.venueFeedScopeGeneration) return;
      const current = this.store.get();
      if ((current.socialSectionId ?? null) !== normalized) return;
      const venueFeedPosts = mapForumPostsToVenueFeed(
        response.results,
        current.forumSections,
        current.forumCategories,
      );
      this.store.patch({
        venueFeedPosts,
        forumFeedNext: response.next,
        forumFeedCount: response.count,
        venueFeedLoading: false,
      });
      void this.hydrateVenueFeedCommentCounts(
        venueFeedPosts.map((post) => Number(post.id)),
      );
    } catch (error) {
      if (generation !== this.venueFeedScopeGeneration) return;
      this.store.patch({ venueFeedLoading: false });
      appWarn("Forum", "Load section feed failed", error);
      this.showToast("Could not load that section. Please try again.");
    }
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
      this.showToast("Sign in to upvote posts.");
      return;
    }

    const state = this.store.get();
    const post =
      state.venueFeedPosts.find((entry) => entry.id === postId) ??
      this.venueWideFeedSnapshot?.posts.find((entry) => entry.id === postId);
    if (post && isConversationFeedItem(post)) return;

    const recent = state.authUser?.recent_posts?.find(
      (entry) => entry.id === numericId,
    );
    const wasUpvoted =
      state.upvotedPostIds.includes(postId) || Boolean(post?.hasUpvoted);
    const nextUpvoted = !wasUpvoted;
    const previousUpvotes = post?.upvotes ?? recent?.upvotes_count ?? 0;
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
        upvotes_count: resolveToggledUpvoteCount({
          previousCount: previousUpvotes,
          nextUpvoted,
          apiCount: updated.upvotes_count,
          payloadPartial: isPartialForumPostPayload(updated),
        }),
      });
    } catch (error) {
      this.applyOptimisticVenueFeedUpvote(postId, wasUpvoted, previousUpvotes);
      const message =
        error instanceof AuthApiError
          ? error.summary
          : "Could not update upvote. Please try again.";
      this.showToast(message);
      appWarn("Forum", "Upvote toggle failed", error);
    } finally {
      this.venueFeedUpvoteInFlight.delete(postId);
    }
  }

  /** Storage key isolating each viewer's flagged-post history. */
  private flagViewerKey(): string {
    const state = this.store.get();
    if (state.authUser) return `user:${state.authUser.id}`;
    if (state.guestId) return `guest:${state.guestId}`;
    return "guest";
  }

  /**
   * Toggles the viewer's report on a post. Flagging POSTs to the backend;
   * unflagging only clears the local "Reported" mark because the API has no
   * user-facing unflag endpoint (the server-side flag stays for moderators).
   */
  async flagVenueFeedPost(postId: string, reason?: string): Promise<void> {
    const numericId = Number(postId);
    if (!Number.isFinite(numericId) || numericId <= 0) return;
    if (this.venueFeedFlagInFlight.has(postId)) return;
    if (!hasStoredAuthTokens()) {
      this.showToast("Sign in to report posts.");
      return;
    }
    const flagTarget = this.store
      .get()
      .venueFeedPosts.find((entry) => entry.id === postId);
    if (flagTarget && isConversationFeedItem(flagTarget)) return;

    if (this.store.get().flaggedPostIds.includes(postId)) {
      flaggedPostsLocalDatasource.remove(this.flagViewerKey(), postId);
      this.store.patch({
        flaggedPostIds: this.store
          .get()
          .flaggedPostIds.filter((id) => id !== postId),
      });
      this.showToast("Report removed.");
      return;
    }

    this.venueFeedFlagInFlight.add(postId);
    try {
      const updated = await flagForumPost(
        numericId,
        reason?.trim() ? { reason: reason.trim() } : undefined,
      );
      if (updated.status === "hidden") {
        this.removeVenueFeedPost(String(updated.id));
        this.showToast("Post reported and removed.");
      } else {
        this.mergeForumPostIntoFeed(updated);
        flaggedPostsLocalDatasource.add(this.flagViewerKey(), postId);
        this.store.patch({
          flaggedPostIds: [
            ...new Set([...this.store.get().flaggedPostIds, postId]),
          ],
        });
        this.showToast("Thanks. Post reported.");
      }
    } catch (error) {
      const message =
        error instanceof AuthApiError
          ? error.summary
          : "Could not report this post. Please try again.";
      this.showToast(message);
      appWarn("Forum", "Flag post failed", error);
    } finally {
      this.venueFeedFlagInFlight.delete(postId);
    }
  }

  /** Fetches the next (older) page of venue posts via the stored DRF `next` URL. */
  async loadMoreVenueFeedPosts(): Promise<void> {
    const state = this.store.get();
    if (state.venueFeedLoadingMore) return;

    const venueId = Number(state.selectedVenueId);
    if (!Number.isFinite(venueId) || venueId <= 0) return;

    if (!state.socialLocation && this.allConversationNextPages.size) {
      this.store.patch({
        venueFeedLoadingMore: true,
        venueFeedDraft: this.captureVenueFeedDraft(),
      });
      try {
        const feed = await loadAllVenueConversations(
          venueId,
          [...this.allConversationNextPages.keys()],
          this.allConversationNextPages,
        );
        const current = this.store.get();
        this.store.patch({
          venueFeedPosts: appendOlderVenueFeedPosts(
            current.venueFeedPosts,
            mapLocationMessagesToVenueFeed(feed.results),
          ),
          forumFeedNext: this.applyConversationNextPages(feed.nextByLocation),
          forumFeedCount: Math.max(current.forumFeedCount, feed.count),
          venueFeedLoadingMore: false,
        });
      } catch (error) {
        this.store.patch({ venueFeedLoadingMore: false });
        appWarn("Forum", "Load more conversations failed", error);
        this.showToast("Could not load older messages. Please try again.");
      }
      return;
    }

    const page = nextFeedPageFromUrl(state.forumFeedNext);
    if (page == null) return;

    this.store.patch({
      venueFeedLoadingMore: true,
      venueFeedDraft: this.captureVenueFeedDraft(),
    });
    try {
      if (state.socialLocation) {
        const response = await listLocationMessages({
          venue: venueId,
          location_id: state.socialLocation,
          page,
          ordering: "-created_at",
        });
        const current = this.store.get();
        const older = mapLocationMessagesToVenueFeed(response.results);
        this.store.patch({
          venueFeedPosts: appendOlderVenueFeedPosts(
            current.venueFeedPosts,
            older,
          ),
          forumFeedNext: response.next,
          forumFeedCount: response.count,
          venueFeedLoadingMore: false,
        });
        return;
      }

      const response = await listVenuePosts({
        venue: venueId,
        category:
          state.venueFeedFilter === "all"
            ? undefined
            : Number(state.venueFeedFilter),
        section: state.socialSectionId ? Number(state.socialSectionId) : undefined,
        latest: true,
        page,
      });
      const current = this.store.get();
      const older = mapForumPostsToVenueFeed(
        response.results,
        current.forumSections,
        current.forumCategories,
      );
      const venueFeedPosts = appendOlderVenueFeedPosts(
        current.venueFeedPosts,
        older,
      );
      const olderUpvotedIds = older
        .filter((post) => post.hasUpvoted)
        .map((post) => post.id);
      this.store.patch({
        venueFeedPosts,
        forumFeedNext: response.next,
        forumFeedCount: response.count,
        upvotedPostIds: [
          ...new Set([...current.upvotedPostIds, ...olderUpvotedIds]),
        ],
        venueFeedLoadingMore: false,
      });
      const appendedIds = older
        .map((post) => Number(post.id))
        .filter((id) => Number.isFinite(id) && id > 0);
      void this.hydrateVenueFeedCommentCounts(appendedIds);
    } catch (error) {
      this.store.patch({ venueFeedLoadingMore: false });
      appWarn("Forum", "Load more posts failed", error);
      this.showToast(
        this.store.get().socialLocation
          ? "Could not load older messages. Please try again."
          : "Could not load older posts. Please try again.",
      );
    }
  }

  async submitVenueFeedPost(): Promise<void> {
    if (this.venueFeedCreateInFlight) return;
    if (!hasStoredAuthTokens()) {
      this.showToast("Sign in to post.");
      return;
    }
    if (await this.blockPostingWhenAwayFromVenue()) return;

    const state = this.store.get();
    const categoryId = Number(state.venueFeedFilter);
    if (
      state.venueFeedFilter === "all" ||
      !Number.isFinite(categoryId) ||
      categoryId <= 0 ||
      !state.forumCategories.some((category) => category.id === categoryId)
    ) {
      this.showToast("Pick a category before posting.");
      return;
    }
    const content = this.captureVenueFeedDraft()
      .trim()
      .slice(0, FORUM_POST_CONTENT_MAX_LENGTH);
    if (!content) return;

    const venueId = Number(state.selectedVenueId);
    if (!Number.isFinite(venueId) || venueId <= 0) {
      this.showToast("Select a venue before posting.");
      return;
    }

    this.venueFeedCreateInFlight = true;
    this.store.patch({ venueFeedDraft: "", venueFeedSubmitting: true });
    try {
      const created = await createForumPost({
        venue: venueId,
        category: categoryId,
        content,
        section: state.socialSectionId ? Number(state.socialSectionId) : undefined,
      });
      this.mergeForumPostIntoFeed(created);
    } catch (error) {
      this.store.patch({ venueFeedDraft: content });
      const message =
        error instanceof AuthApiError
          ? error.summary
          : "Could not publish that post. Please try again.";
      this.showToast(message);
      appWarn("Forum", "Create category post failed", error);
    } finally {
      this.venueFeedCreateInFlight = false;
      this.store.patch({ venueFeedSubmitting: false });
    }
  }

  openPostComments(postId: string): void {
    const post = this.store
      .get()
      .venueFeedPosts.find((entry) => entry.id === postId);
    if (!post || isConversationFeedItem(post)) {
      this.showToast("Post not found.");
      return;
    }
    this.store.patch({
      activeTab: "social",
      postCommentsOpen: true,
      postCommentsPostId: postId,
      postComments: [],
      postCommentsDraft: "",
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
      postCommentsDraft: "",
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
        postCommentsError: "Invalid post.",
      });
      return;
    }

    try {
      const page = await listForumComments({
        post: numericId,
        ordering: "created_at",
      });
      if (this.store.get().postCommentsPostId !== postId) return;
      const items = mapForumCommentsToItems(page.results);
      for (const item of items) {
        this.seenForumCommentIds.add(item.id);
      }
      this.store.patch({
        postComments: items,
        postCommentsLoading: false,
        postCommentsError: null,
        venueFeedPosts: this.store
          .get()
          .venueFeedPosts.map((post) =>
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
            : "Could not load comments.",
      });
      appWarn("Forum", "List comments failed", error);
    }
  }

  async submitPostComment(): Promise<void> {
    const state = this.store.get();
    const postId = state.postCommentsPostId;
    const content = state.postCommentsDraft.trim();
    if (!postId || !content || state.postCommentsSubmitting) return;

    if (!hasStoredAuthTokens()) {
      this.showToast("Sign in to comment.");
      return;
    }
    if (await this.blockPostingWhenAwayFromVenue()) return;

    const numericId = Number(postId);
    if (!Number.isFinite(numericId)) return;

    this.store.patch({
      postCommentsSubmitting: true,
      postCommentsError: null,
      postCommentsDraft: "",
    });

    try {
      const created = await createForumComment({
        post: numericId,
        content,
      });
      if (this.store.get().postCommentsPostId !== postId) return;
      const item = mapForumCommentToItem(created);
      this.seenForumCommentIds.add(created.id);
      // The venue WebSocket `new_comment` broadcast can beat this response
      // and already have appended the comment - never add it twice.
      const comments = appendCommentOnce(this.store.get().postComments, item);
      this.store.patch({
        postComments: comments,
        postCommentsSubmitting: false,
        venueFeedPosts: this.store
          .get()
          .venueFeedPosts.map((post) =>
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
            : "Could not post comment.",
      });
      appWarn("Forum", "Create comment failed", error);
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
      const comments = this.store
        .get()
        .postComments.filter((comment) => comment.id !== id);
      this.store.patch({
        postComments: comments,
        postCommentsSubmitting: false,
        venueFeedPosts: postId
          ? this.store
              .get()
              .venueFeedPosts.map((post) =>
                post.id === postId
                  ? { ...post, comments: comments.length }
                  : post,
              )
          : this.store.get().venueFeedPosts,
      });
    } catch (error) {
      this.store.patch({
        postCommentsSubmitting: false,
        postCommentsError:
          error instanceof AuthApiError
            ? error.summary
            : "Could not delete comment.",
      });
      appWarn("Forum", "Delete comment failed", error);
    }
  }

  async saveEditedVenueFeedPost(content: string): Promise<void> {
    const postId = this.store.get().postCommentsPostId;
    const trimmed = content.trim();
    if (!postId || !trimmed) {
      this.store.patch({
        postCommentsError: "Post content cannot be empty.",
      });
      return;
    }
    if (!hasStoredAuthTokens()) {
      this.showToast("Sign in to edit posts.");
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
      this.showToast("Post updated.");
    } catch (error) {
      this.store.patch({
        postCommentsSubmitting: false,
        postCommentsError:
          error instanceof AuthApiError
            ? error.summary
            : "Could not update post.",
      });
      appWarn("Forum", "Update post failed", error);
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
      this.showToast("Post deleted.");
    } catch (error) {
      this.store.patch({
        postCommentsSubmitting: false,
        postCommentsError:
          error instanceof AuthApiError
            ? error.summary
            : "Could not delete post.",
      });
      appWarn("Forum", "Delete post failed", error);
    }
  }

  private applyOptimisticVenueFeedUpvote(
    postId: string,
    upvoted: boolean,
    upvotesOverride?: number,
  ): void {
    const state = this.store.get();
    const nextCount = (current: number) =>
      typeof upvotesOverride === "number"
        ? upvotesOverride
        : upvoted
          ? current + 1
          : Math.max(0, current - 1);

    const currentCount =
      state.venueFeedPosts.find((entry) => entry.id === postId)?.upvotes ??
      this.venueWideFeedSnapshot?.posts.find((entry) => entry.id === postId)
        ?.upvotes ??
      state.authUser?.recent_posts?.find((entry) => String(entry.id) === postId)
        ?.upvotes_count ??
      0;

    const authUser = this.withUpvotedRecentPosts(
      state.authUser, postId, nextCount(currentCount),
    );
    const posts = state.venueFeedPosts.map((entry) => {
      if (entry.id !== postId) return entry;
      return {
        ...entry,
        upvotes: nextCount(currentCount),
        hasUpvoted: upvoted,
      };
    });
    this.patchParkedFeedPosts(postId, (post) => ({
      ...post,
      upvotes: nextCount(currentCount),
      hasUpvoted: upvoted,
    }));

    this.store.patch({
      venueFeedPosts: posts,
      upvotedPostIds: upvoted
        ? [...new Set([...state.upvotedPostIds, postId])]
        : state.upvotedPostIds.filter((id) => id !== postId),
      authUser,
      venueFeedDraft: this.captureVenueFeedDraft(),
    });
  }

  private withUpvotedRecentPosts(
    user: AuthUser | null,
    postId: string,
    upvotesCount: number,
  ): AuthUser | null {
    if (!user) return user;
    const recent_posts = withRecentPostUpvotes(
      user.recent_posts,
      Number(postId),
      upvotesCount,
    );
    const recent = user.recent_posts?.find((post) => String(post.id) === postId);
    const feedPost = this.store.get().venueFeedPosts.find((post) => post.id === postId)
      ?? this.venueWideFeedSnapshot?.posts.find((post) => post.id === postId)
      ?? this.homeFeedSnapshot?.posts.find((post) => post.id === postId);
    const previousCount = recent?.upvotes_count ?? feedPost?.upvotes;
    const ownsPost = Boolean(recent) || feedPost?.authorId === user.id;
    const delta = ownsPost && previousCount != null
      ? Math.max(0, Math.floor(upvotesCount)) - previousCount : 0;
    if (recent_posts === user.recent_posts && (!delta || !user.stat)) return user;
    return {
      ...user,
      recent_posts,
      stat: user.stat && delta
        ? { ...user.stat, upvotes_count: Math.max(0, user.stat.upvotes_count + delta) }
        : user.stat,
    };
  }

  /** Merge a REST `Post` into the feed (create / upvote / flag). WS events also dedupe by id. */
  private mergeForumPostIntoFeed(post: ForumPost): void {
    if (post.status === "hidden") {
      this.removeVenueFeedPost(String(post.id));
      return;
    }

    const state = this.store.get();
    const postId = String(post.id);
    const authUser = this.withUpvotedRecentPosts(
      state.authUser,
      postId,
      post.upvotes_count,
    );
    this.patchParkedFeedPosts(postId, (entry) => ({
      ...entry, upvotes: post.upvotes_count, hasUpvoted: post.has_upvoted,
    }));
    const venueId = Number(state.selectedVenueId);
    const otherVenue =
      Number.isFinite(venueId) &&
      venueId > 0 &&
      post.venue > 0 &&
      post.venue !== venueId;
    if (otherVenue) {
      if (authUser !== state.authUser) {
        this.store.patch({ authUser });
      }
      return;
    }

    const showingConversations =
      Boolean(state.socialLocation);
    const existing = showingConversations
      ? this.homeFeedSnapshot?.posts.find((entry) => entry.id === postId)
      : state.venueFeedPosts.find((entry) => entry.id === postId);
    const sectionById = new Map(
      state.forumSections.map((section) => [section.id, section]),
    );
    const categoryById = new Map(
      state.forumCategories.map((category) => [category.id, category]),
    );
    const mapped = mapForumPostToVenueFeed(
      post,
      sectionById,
      categoryById,
      existing,
    );
    const isPartial = isPartialForumPostPayload(post);

    if (isPartial && !existing) {
      this.mergePostIntoHomeFeedSnapshot(post, mapped);
      this.store.patch({
        authUser,
        upvotedPostIds: post.has_upvoted
          ? [...new Set([...state.upvotedPostIds, postId])]
          : state.upvotedPostIds.filter((id) => id !== postId),
      });
      return;
    }

    const merged =
      existing && isPartial
        ? {
            ...existing,
            upvotes: mapped.upvotes,
            hasUpvoted: mapped.hasUpvoted,
          }
        : mapped;

    this.mergePostIntoHomeFeedSnapshot(post, merged);

    const upvotedPostIds = merged.hasUpvoted
      ? [...new Set([...state.upvotedPostIds, postId])]
      : state.upvotedPostIds.filter((id) => id !== postId);

    if (state.socialLocation) {
      this.store.patch({ authUser, upvotedPostIds });
      return;
    }

    const venueFeedPosts = existing
      ? state.venueFeedPosts.map((entry) =>
          entry.id === postId ? merged : entry,
        )
      : [merged, ...state.venueFeedPosts];

    this.store.patch({
      venueFeedPosts,
      forumFeedCount: existing
        ? state.forumFeedCount
        : state.forumFeedCount + 1,
      upvotedPostIds,
      authUser,
    });
  }

  private patchParkedFeedPosts(
    postId: string,
    patch: (post: VenueFeedPost) => VenueFeedPost,
  ): void {
    for (const snapshot of [
      this.homeFeedSnapshot,
      this.venueWideFeedSnapshot,
    ]) {
      if (!snapshot) continue;
      snapshot.posts = snapshot.posts.map((post) =>
        post.id === postId ? patch(post) : post,
      );
    }
  }

  private removeFromVenueWideSnapshot(postId: string): void {
    for (const snapshot of [
      this.homeFeedSnapshot,
      this.venueWideFeedSnapshot,
    ]) {
      if (!snapshot) continue;
      const before = snapshot.posts.length;
      snapshot.posts = snapshot.posts.filter((post) => post.id !== postId);
      if (snapshot.posts.length < before) {
        snapshot.count = Math.max(0, snapshot.count - 1);
      }
    }
  }

  private mergePostIntoHomeFeedSnapshot(
    post: ForumPost,
    mapped: VenueFeedPost,
  ): void {
    const snapshot = this.homeFeedSnapshot;
    if (!snapshot) return;

    const existing = snapshot.posts.find((entry) => entry.id === mapped.id);
    const isPartial = isPartialForumPostPayload(post);
    if (isPartial && !existing) return;
    const merged =
      existing && isPartial
        ? {
            ...existing,
            upvotes: mapped.upvotes,
            hasUpvoted: mapped.hasUpvoted,
          }
        : mapped;
    snapshot.posts = existing
      ? snapshot.posts.map((entry) => (entry.id === mapped.id ? merged : entry))
      : [merged, ...snapshot.posts];
    if (!existing) {
      snapshot.count += 1;
    }
  }

  /**
   * The post payload has no comment count, so counts start at 0 after a feed
   * load. Fetch the authoritative counts so the feed is correct without
   * opening each thread. Runs on feed load and on Social tab navigation.
   */
  private async hydrateVenueFeedCommentCounts(
    onlyPostIds?: number[],
  ): Promise<void> {
    if (this.venueFeedCommentCountsInFlight) return;
    if (!hasStoredAuthTokens()) return;
    if (this.store.get().socialLocation) return;
    const feedIds = this.store
      .get()
      .venueFeedPosts.filter((post) => !isConversationFeedItem(post))
      .map((post) => Number(post.id))
      .filter((id) => Number.isFinite(id) && id > 0);
    const postIds = onlyPostIds
      ? feedIds.filter((id) => onlyPostIds.includes(id))
      : feedIds;
    if (!postIds.length) return;

    this.venueFeedCommentCountsInFlight = true;
    try {
      const counts = await loadForumCommentCounts(postIds);
      const countsByPostId = new Map(
        [...counts].map(([postId, count]) => [String(postId), count]),
      );
      this.store.patch({
        venueFeedPosts: applyCommentCounts(
          this.store.get().venueFeedPosts,
          countsByPostId,
        ),
      });
    } catch (error) {
      appWarn("Forum", "Comment count refresh failed", error);
    } finally {
      this.venueFeedCommentCountsInFlight = false;
    }
  }

  private mergeLiveForumComment(comment: ForumComment): void {
    if (this.seenForumCommentIds.has(comment.id)) return;
    this.seenForumCommentIds.add(comment.id);

    const postId = String(comment.post);
    const state = this.store.get();
    this.patchParkedFeedPosts(postId, (post) => ({
      ...post, comments: post.comments + 1,
    }));
    const threadOpen =
      state.postCommentsOpen && state.postCommentsPostId === postId;
    const venueFeedPosts = state.venueFeedPosts.map((post) =>
      post.id === postId ? { ...post, comments: post.comments + 1 } : post,
    );
    this.store.patch({
      venueFeedPosts,
      postComments: threadOpen
        ? appendCommentOnce(state.postComments, mapForumCommentToItem(comment))
        : state.postComments,
    });
  }

  private removeVenueFeedPost(postId: string): void {
    const snapshot = this.venueWideFeedSnapshot;
    if (snapshot) {
      const nextSnapshotPosts = snapshot.posts.filter(
        (post) => post.id !== postId,
      );
      if (nextSnapshotPosts.length !== snapshot.posts.length) {
        snapshot.posts = nextSnapshotPosts;
        snapshot.count = Math.max(0, snapshot.count - 1);
      }
    }

    const state = this.store.get();
    const nextPosts = state.venueFeedPosts.filter((post) => post.id !== postId);
    if (nextPosts.length === state.venueFeedPosts.length) return;
    flaggedPostsLocalDatasource.remove(this.flagViewerKey(), postId);
    this.store.patch({
      venueFeedPosts: nextPosts,
      forumFeedCount: Math.max(0, state.forumFeedCount - 1),
      upvotedPostIds: state.upvotedPostIds.filter((id) => id !== postId),
      flaggedPostIds: state.flaggedPostIds.filter((id) => id !== postId),
    });
  }

  private captureVenueFeedDraft(): string {
    return (
      document.querySelector<HTMLInputElement>("#venue-feed-input")?.value ??
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
        ? this.socialTagDraft(SOCIAL_QUICK_TAG_LABELS[nextTag] ?? "", draft)
        : draft,
    });
  }

  toggleSocialUpvote(postId: string): void {
    const state = this.store.get();
    if (!state.socialPosts.length) return;
    const posts = [...state.socialPosts];
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

    const posts = [...state.socialPosts];
    const category =
      state.socialCategory === "all" ? "vibe" : state.socialCategory;
    const locationEntry =
      SOCIAL_LOCATIONS_BY_ID[state.socialLocation ?? "section-114"];

    posts.unshift({
      id: `post-${Date.now()}`,
      author: "You",
      initials: "YO",
      avatarColor: "#12121a",
      location: locationEntry?.label ?? "LA Stadium",
      locationId: state.socialLocation ?? "section-114",
      timeAgo: "just now",
      category,
      categoryLabel: SOCIAL_CATEGORY_LABELS[category],
      content,
      upvotes: 0,
      comments: 0,
    });

    this.store.patch({
      socialPosts: posts,
      socialDraft: "",
      socialTag: null,
    });
  }

  private captureSocialDraft(): string {
    return (
      document.querySelector<HTMLInputElement>("#social-input")?.value ??
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
    if (await this.blockNavigationOutsideVenue()) return;

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
          searchQuery: "",
          markers: this.routePlanner.markersState,
          showRouteSheet: false,
          route: null,
          routeNotFound: false,
          routeSimulating: false,
          routeSimulationComplete: false,
          routeTraveledMeters: 0,
          routeRemainingMeters: null,
        });
        void this.maybeAutoStartBlueDot();
        this.showToast(
          continueArSetup
            ? "Start set. Now search for your destination."
            : "Start set. Search for your destination.",
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
        searchQuery: "",
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
            ? "Could not set start point."
            : "Could not set destination.",
        ),
      );
    }
  }

  async selectNavigateSearchResult(
    locationId: string,
    name: string,
    floorName?: string,
  ): Promise<void> {
    if (!this.mapData || !this.routePlanner) return;
    if (await this.blockNavigationOutsideVenue()) return;

    try {
      const target = resolveMapTarget(this.mapData, locationId);
      if (!target) {
        this.showToast(LOCATION_NOT_ROUTABLE_MESSAGE);
        return;
      }

      if (this.store.get().route) {
        this.routePlanner.clearRoute();
        this.routePlanner.setRoutePlanningPaused(false);
        this.stopPositionProvider();
      }

      this.openNavigateMap();
      await this.routePlanner.setDestinationFromLocation(target, name, {
        floorName,
        areaHint: inferAreaHint(name),
      });
      this.routePlanner.clearHighlights();
      this.store.patch({
        activeTab: "map",
        navigateView: "map",
        searchResults: [],
        searchQuery: "",
        markers: this.routePlanner.markersState,
        showRouteSheet: true,
        route: null,
        routeNotFound: false,
        routeSimulating: false,
        routeSimulationComplete: false,
        routeTraveledMeters: 0,
        routeRemainingMeters: null,
      });
      if (this.routePlanner.hasOrigin) {
        this.scheduleAutoRoute();
      } else {
        this.pendingMapSearchFocus = true;
        this.showToast("Destination set. Choose your start point.");
      }
    } catch (error) {
      this.showToast(toUserFacingRouteError(error, "Could not open that section."));
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
        reason: "floor_change",
      });
    }
  }

  /** Called from AR iframe when user transitions floors during Live View. */
  forceFloor(floorId: string): void {
    void this.selectFloor(floorId);
  }

  zoomIn(): void {
    appLog("MapCamera", "zoomIn requested", { hasMapView: !!this.mapView });
    if (!this.mapView) return;
    const camera = this.mapView.Camera;
    const zoomLevel = clampVenueZoom(
      camera.zoomLevel + 1,
      camera.minZoomLevel,
      camera.maxZoomLevel,
    );
    appLog("MapCamera", "zoomIn animate", {
      current: camera.zoomLevel,
      min: camera.minZoomLevel,
      max: camera.maxZoomLevel,
      target: zoomLevel,
    });
    try {
      void Promise.resolve(camera.animateTo({ zoomLevel }, { duration: 200 }))
        .then(() => appLog("MapCamera", "zoomIn complete"))
        .catch((error) => appWarn("MapCamera", "zoomIn failed", error));
    } catch (error) {
      appWarn("MapCamera", "zoomIn threw", error);
    }
  }

  zoomOut(): void {
    appLog("MapCamera", "zoomOut requested", { hasMapView: !!this.mapView });
    if (!this.mapView) return;
    const camera = this.mapView.Camera;
    const zoomLevel = clampVenueZoom(
      camera.zoomLevel - 1,
      camera.minZoomLevel,
      camera.maxZoomLevel,
    );
    appLog("MapCamera", "zoomOut animate", {
      current: camera.zoomLevel,
      min: camera.minZoomLevel,
      max: camera.maxZoomLevel,
      target: zoomLevel,
    });
    try {
      void Promise.resolve(camera.animateTo({ zoomLevel }, { duration: 200 }))
        .then(() => appLog("MapCamera", "zoomOut complete"))
        .catch((error) => appWarn("MapCamera", "zoomOut failed", error));
    } catch (error) {
      appWarn("MapCamera", "zoomOut threw", error);
    }
  }

  private zoomToOverview(): void {
    if (!this.mapView) return;
    const camera = this.mapView.Camera;
    const overviewZoom = clampVenueZoom(
      camera.zoomLevel - 1,
      camera.minZoomLevel,
      camera.maxZoomLevel,
    );
    void camera.animateTo({ zoomLevel: overviewZoom }, { duration: 350 });
  }

  private disableOutdoorWorldView(): void {
    try {
      this.mapView?.Outdoor?.hide?.();
    } catch {
      /* outdoor module may be absent when disabled at init */
    }
  }

  private restoreVenueMapView(): void {
    if (!this.mapView || this.restoringVenueView) return;
    this.disableOutdoorWorldView();
    const zoom = this.mapView.Camera?.zoomLevel;
    if (!isWorldScaleZoom(zoom)) return;
    const floor = this.mapView.currentFloor;
    if (!floor) return;
    this.restoringVenueView = true;
    const done = () => {
      this.restoringVenueView = false;
    };
    try {
      const result = this.mapView.Camera.focusOn(floor, {
        minZoomLevel: VENUE_MAP_MIN_ZOOM,
        maxZoomLevel: 20,
        duration: 0,
      }) as { finally?: (fn: () => void) => unknown } | undefined;
      if (result && typeof result.finally === "function") {
        void result.finally(done);
      } else {
        window.setTimeout(done, 400);
      }
    } catch {
      done();
    }
  }

  getActivePositionSource(): PositionSourceType {
    return this.activePositionSource;
  }

  /** User-gesture entry for the mobile debugger; never requests or changes GPS. */
  async enableCompassForDiagnostics(): Promise<void> {
    if (!import.meta.env.DEV) return;
    if (!this.blueDotService) {
      navDiag?.record('warning', 'MapApp.enableCompassForDiagnostics', { reason: 'map-not-ready', name: 'compass-enable-request-rejected' });
      throw new Error('Open a venue map before enabling its compass.');
    }
    await this.blueDotService.enableHeading({ forceDuringSimulator: true });
  }

  /** Explicit diagnostic reads never start sensors, providers or navigation. */
  getLocationDiagnosticsSnapshot(): unknown {
    return import.meta.env.DEV ? this.locationButtonDiagnosticContext() : null;
  }

  private locationButtonDiagnosticContext() {
    const state = this.store.get();
    const venue = state.forumVenues.find(item => String(item.id) === state.selectedVenueId);
    const simulation = this.venueGpsReference?.diagnosticSnapshot() ?? null;
    const center = this.mapView?.Camera?.center;
    return {
      selectedVenue: { id: state.selectedVenueId, name: venue?.name ?? null,
        originalGeographicCoordinates: { latitude: venue?.latitude ?? null, longitude: venue?.longitude ?? null },
        loadedMapId: this.loadedVenueMapId ?? null },
      simulation: { configured: appConfig.positioning.enableVenueGeolocationSimulation,
        active: !!this.venueGpsReference, reference: simulation,
        simulatedGeographicReference: { physicalOrigin: simulation?.physical ?? null,
          pairedMapCoordinate: simulation?.mapAnchor ?? null, anchor: simulation?.mapAnchorInfo ?? null },
        catalogCoordinatesAreModified: false },
      permission: state.locationPermission, mapStatus: state.mapStatus, positioningStatus: state.blueDotStatus,
      navigation: { active: this.liveRouteTracking || state.routeSimulating, arrived: state.routeSimulationComplete,
        routePresent: !!state.route, distanceM: state.route?.distanceMeters ?? null, traveledM: state.routeTraveledMeters,
        remainingM: state.routeRemainingMeters, start: state.route?.pathCoordinates[0] ?? null,
        destination: state.route?.pathCoordinates.at(-1) ?? null, legIndex: state.currentLegIndex },
      routeDependency: { routePresent: !!state.route, startSelected: !!state.markers.origin,
        destinationSelected: !!state.markers.destination, routeRequiredByLocationPolicy: false,
        mapAnchorAvailable: !!simulation?.mapAnchor, physicalOriginAvailable: !!simulation?.physical,
        mapAnchorSource: simulation?.mapAnchorInfo?.source ?? null },
      provider: { running: this.positionProvider?.isRunning ?? false, signalStatus: this.positionProvider?.signalStatus ?? null, source: this.activePositionSource ?? null },
      blueDot: this.blueDotService?.getLocationDiagnosticSnapshot?.() ?? null,
      camera: { center: center ? { latitude: center.latitude, longitude: center.longitude, floorId: center.floorId } : null,
        bearing: this.mapView?.Camera?.bearing ?? null,
        floorId: this.mapView?.currentFloor?.id ?? state.currentFloorId ?? null },
    };
  }

  async goToMyLocation(): Promise<void> {
    const trace = beginLocationButtonTrace(() => this.locationButtonDiagnosticContext());
    try {
      if (!this.mapView || !this.blueDotService) {
        this.showToast("Map is still loading. Try again in a moment.");
        trace?.finish('map-not-ready', () => this.locationButtonDiagnosticContext());
        return;
      }

      if (this.maybeShowContextualProductTour("my-location")) {
        trace?.finish('product-tour-shown'); return;
      }
      // Prime the existing compass watcher during the tap, before asynchronous GPS retrieval.
      void this.blueDotService.enableHeading({ forceDuringSimulator: true }).catch(error => {
        trace?.step('BlueDot', 'Compass startup unavailable; location acquisition continues', () => ({ error }), 'warning');
      });
      trace?.step('Location', 'Checking location permission', () => ({ permission: this.store.get().locationPermission }));
      if (!(await this.ensureLocationEnabledForAction())) {
        trace?.finish('permission-action-required', () => this.locationButtonDiagnosticContext()); return;
      }
      trace?.step('Location', 'Location permission accepted', () => ({ permission: this.store.get().locationPermission }), 'success');

      const mapView = this.mapView;
      const blueDotService = this.blueDotService;
      const reference = this.venueGpsReference;
      const restartFailedProvider = this.store.get().blueDotStatus === 'error';
      navDiag?.record("location-button", "MapApp.goToMyLocation", { action: "request", simulated: !!reference });
      try {
        this.store.patch({ locationGateLoading: true });
        trace?.step('Location', 'Requesting device GPS', () => ({ timeoutMs: 15000, preferredAccuracy: 'high',
          fallbackPolicy: 'on timeout, relaxed accuracy with maximumAge 60000ms', requestedAt: new Date().toISOString() }));
        let gpsTimestamp: number | null = null;
        let coords = await this.locationService.requestLocation({
          timeoutMs: 15_000,
          ...(trace ? { onDiagnosticFix: (position: GeolocationPosition, acquisition: { relaxedRetryUsed: boolean; maximumAgeMs: number; enableHighAccuracy: boolean }) => {
            gpsTimestamp = position.timestamp;
            trace.step('Location', 'Device GPS response', () => ({ latitude: position.coords.latitude,
              longitude: position.coords.longitude, accuracyMeters: position.coords.accuracy,
              timestamp: position.timestamp, timestampIso: Number.isFinite(position.timestamp) ? new Date(position.timestamp).toISOString() : null,
              ageMs: Date.now() - position.timestamp, speedMps: position.coords.speed, headingDegrees: position.coords.heading, acquisition }), acquisition.relaxedRetryUsed ? 'warning' : 'success');
          } } : {}),
        });
        // Acquisition time is behavioral evidence in every build, not a DEV-only observer.
        gpsTimestamp = coords.timestamp;
        trace?.step('Location', 'Physical coordinates returned to location action', () => ({ ...coords, timestamp: gpsTimestamp,
          timestampEvidence: gpsTimestamp == null ? 'unavailable from acquisition observer' : 'browser GeolocationPosition.timestamp' }));
        if (this.mapView !== mapView || this.blueDotService !== blueDotService || this.venueGpsReference !== reference) {
          trace?.finish('stale-interaction-ignored', () => ({ mapChanged: this.mapView !== mapView,
            markerServiceChanged: this.blueDotService !== blueDotService, referenceChanged: this.venueGpsReference !== reference }));
          return;
        }
        const physicalFix: FplacesPositionFrame = { ...coords, accuracy: coords.accuracy ?? NaN, source: 'gps' };
        if (!isUsableDisplayFix(physicalFix)) {
          this.handleLivePositionStatus('inactive', 'location-button-fix-rejected');
          this.showToast('GPS is too old or imprecise to place a new position. Keeping the last known position when available.');
          trace?.finish('unusable-display-fix', () => ({ physicalFix, retained: this.blueDotService?.getLocationDiagnosticSnapshot?.() ?? null }));
          return;
        }
        navDiag?.record("location-button", "MapApp.goToMyLocation", { action: "fix", physical: coords, simulated: !!reference });
        this.persistLocationChoice("granted");
        this.publishUserLocation(coords);

        if (this.venueGpsReference) {
          trace?.step('Simulation', 'Reference before initialization', () => this.venueGpsReference?.diagnosticSnapshot());
          this.venueGpsReference.capture(coords);
          this.initializeVenueSimulationMapAnchor();
          trace?.step('Simulation', 'Reference after map-anchor initialization', () => ({
            ...this.venueGpsReference?.diagnosticSnapshot(), routePresent: !!this.store.get().route,
            routeRequiredByLocationPolicy: false }));
          const translated = this.venueGpsReference.translate(coords);
          trace?.step('Simulation', 'Physical-to-map coordinate transformation', () => {
            const snapshot = this.venueGpsReference!.diagnosticSnapshot();
            const offset = snapshot.physical ? geoToLocalMeters(snapshot.physical, coords) : null;
            return { physicalInput: { ...coords, timestamp: gpsTimestamp }, physicalOrigin: snapshot.physical,
              mapOrigin: snapshot.mapAnchor, anchor: snapshot.mapAnchorInfo, revision: snapshot.revision,
              localOffsetMeters: offset ? { east: offset.x, north: -offset.z, slamX: offset.x, slamZ: offset.z } : null,
              coordinateDeltaDegrees: snapshot.physical ? { latitude: coords.latitude - snapshot.physical.latitude,
                longitude: coords.longitude - snapshot.physical.longitude } : null,
              method: 'north-aligned local metre offset; inverse latitude conversion and target mid-latitude cosine for longitude',
              simulatedOutput: translated, inversePhysicalCheck: translated ? this.venueGpsReference!.toPhysical(translated) : null,
              determinedWithoutRoute: !!translated && !this.store.get().route,
              routeUsedAsAnchor: false, mapReferenceIsSimulatedPlacement: true };
          }, translated ? 'success' : 'warning');
          if (!translated) {
            this.reportBlueDotAvailability('simulation-map-anchor-unavailable');
            this.showToast('Development simulation could not find a mapped reference on this floor. Try reopening the venue map.');
            trace?.finish('simulation-reference-unavailable', () => this.locationButtonDiagnosticContext());
            return;
          }
          coords = translated;
        } else {
          trace?.step('Simulation', 'Simulation inactive; using physical coordinates directly', () => ({
            configured: appConfig.positioning.enableVenueGeolocationSimulation, physicalCoordinate: coords }));
        }

        if (!this.venueGpsReference && this.isAwayFromSelectedVenue()) {
          const state = this.store.get();
          const venue = state.forumVenues.find(
            (item) => String(item.id) === state.selectedVenueId,
          );
          this.blueDotService.stopFollow();
          this.store.patch({ blueDotFollowing: false });
          this.showToast(myLocationNotAtVenueCopy(venue?.name).body);
          trace?.finish('outside-selected-venue', () => this.locationButtonDiagnosticContext());
          return;
        }

        const floorId = reference?.diagnosticSnapshot().mapAnchor?.floorId ??
          this.mapView.currentFloor?.id ?? this.store.get().currentFloorId ?? undefined;
        // GPS supplies no indoor floor. Center on the established simulated floor,
        // rather than silently moving the marker to whichever floor is being browsed.
        if (floorId && this.mapView.currentFloor?.id !== floorId) {
          this.mapView.setFloor(floorId);
          this.store.patch({ currentFloorId: floorId });
        }

        trace?.step('BlueDot', 'Submitting blue-dot position and requesting camera follow', () => ({
          renderInput: { ...coords, floorId }, follow: true, simulated: !!reference,
          before: this.blueDotService?.getLocationDiagnosticSnapshot?.(coords) ?? null }));
        this.blueDotService.showLivePosition(
          {
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
            timestamp: gpsTimestamp,
            floorId,
          },
          { follow: true },
        );

        this.store.patch({ blueDotStatus: isUsableLiveFix(physicalFix) ? 'active' : 'inactive' });
        this.blueDotService.setPositionAvailability?.(isUsableLiveFix(physicalFix) ? 'live' : 'approximate');

        trace?.step('BlueDot', 'SDK state immediately after blue-dot submission', () =>
          this.blueDotService?.getLocationDiagnosticSnapshot?.(coords) ?? { unavailable: true });
        trace?.step('Location', 'Ensuring ongoing tracking and centering', () => ({
          alreadyTracking: this.blueDotService?.isTracking, providerRunning: this.positionProvider?.isRunning ?? false,
          requestNativeGpsWatch: !this.venueGpsReference && !this.positionProvider?.isRunning }));
        if (!this.blueDotService.isTracking) {
          await this.blueDotService.startTracking({
            follow: true,
            watchDevicePosition: !this.venueGpsReference && !this.positionProvider?.isRunning,
          });
          await this.blueDotService.enableHeading().catch(error => {
            trace?.step('BlueDot', 'Optional heading initialization failed; location flow continues', () => ({ error }), 'warning');
          });
        } else {
          this.blueDotService.follow();
          this.blueDotService.focusOnUser();
        }

        if (reference && (!this.positionProvider?.isRunning || restartFailedProvider)) {
          trace?.step('Location', 'Starting continuous simulation provider', () => ({ source: 'gps', restartingAfterError: restartFailedProvider,
            routePresent: !!this.store.get().route, routePointCount: this.store.get().route?.pathCoordinates.length ?? 0,
            routeRequiredByLocationPolicy: false }));
          this.startPositionProvider(this.store.get().route?.pathCoordinates ?? []);
        }
        trace?.step('BlueDot', 'Camera centering/follow requested; observing SDK state', () => ({
          requestedCenter: coords, camera: this.locationButtonDiagnosticContext().camera,
          marker: this.blueDotService?.getLocationDiagnosticSnapshot?.(coords) ?? null,
          animationCompletionVerified: false }));
        this.store.patch({
          blueDotFollowing: true,
        });

        // Indoor GPS is often tens of metres off the Mappedin path. Only adopt it
        // as the route start when the fix is tight enough to trust.
        const accuracyOk =
          coords.accuracy != null &&
          Number.isFinite(coords.accuracy) &&
          isUsableLiveFix(physicalFix);
        if (accuracyOk && this.routePlanner && !this.routePlanner.hasOrigin) {
          const origin =
            this.blueDotService.coordinate ??
            this.mapView.createCoordinate?.(
              coords.latitude,
              coords.longitude,
              this.mapView.currentFloor ?? undefined,
            );
          if (origin) {
            try {
              trace?.step('Location', 'Offering located coordinate as optional route origin after positioning', () => ({
                locationAlreadyDetermined: true, originWasRequiredForLocation: false,
                coordinate: serializeCoordinate(origin) }));
              this.routePlanner.setOrigin(origin, "my location");
              this.store.patch({ markers: this.routePlanner.markersState });
              this.scheduleAutoRoute();
            } catch (error) {
              trace?.step('Location', 'Optional route-origin adoption failed; location remains available', () => ({ error }), 'warning');
              // GPS can fall outside indoor geometry; the marker still shows you.
            }
          }
        }

        const state = this.store.get();
        const venue = state.forumVenues.find(item => String(item.id) === state.selectedVenueId);
        const place = venue?.name ? ` at ${venue.name}` : ` (${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)})`;
        const anchorInfo = reference?.diagnosticSnapshot().mapAnchorInfo;
        const referenceLabel = anchorInfo ? `; map reference: ${anchorInfo.name || anchorInfo.objectId || anchorInfo.source}` : '';
        this.showToast(`${reference ? "Development simulated position" : "Your location"}${place}${referenceLabel}${coords.accuracy != null ? ` (${reference ? "GPS uncertainty " : ""}±${Math.round(coords.accuracy)} m)` : ""}.`);
        navDiag?.record("location-button", "MapApp.goToMyLocation", { action: "centered", simulated: !!reference, displayed: coords });
        trace?.step('BlueDot', 'Final comparison against calculated location', () => this.blueDotService?.getLocationDiagnosticSnapshot?.(coords) ?? { unavailable: true });
        trace?.finish('success', () => ({ ...this.locationButtonDiagnosticContext(), calculatedMapPosition: coords }));
      } catch (error) {
        trace?.step('Location', 'Get Current Location failed', () => ({ error }), 'error');
        trace?.finish('failed', () => this.locationButtonDiagnosticContext());
        navDiag?.record("location-button", "MapApp.goToMyLocation", { action: "failed", reason: error instanceof Error ? error.message : String(error) });
        await this.showLocationGateForRequiredAction(error);
      } finally {
        if (!isLocationGateAuthStep(this.store.get().authStep)) {
          this.store.patch({ locationGateLoading: false });
        }
      }
    } catch (error) {
      trace?.step('Location', 'Location action interrupted before or during permission handling', () => ({ error }), 'error');
      trace?.finish('failed', () => this.locationButtonDiagnosticContext());
      throw error;
    } finally {
      trace?.finish('interrupted', () => this.locationButtonDiagnosticContext());
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
    navDiag?.update('route-lifecycle', 'MapApp.clearRoute', { reason: 'route-cleared', path: null, markerRestoration: 'resume-idle-positioning' });
    if (!this.routePlanner) return;
    this.routePlanner.clearRoute();
    this.routePlanner.endGuidedNavigation();
    this.routePlanner.setRoutePlanningPaused(false);
    this.alongPathStabilizer.reset(0);
    this.store.patch({
      route: null,
      showRouteSheet: false,
      currentLegIndex: 0,
      routeInstructions: "",
      routeTraveledMeters: 0,
      routeRemainingMeters: null,
      routeSimulating: false,
      routeSimulationComplete: false,
      arrivalDialogOpen: false,
      arrivalDialogHandled: false,
      routeNotFound: false,
    });

    this.stopPositionProvider();
    void this.maybeAutoStartBlueDot();
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
    const next = Math.min(
      state.route.legs.length - 1,
      state.currentLegIndex + 1,
    );
    this.applyLegIndex(next);
  }

  async openAr(): Promise<void> {
    if (await this.blockNavigationOutsideVenue("ar")) return;
    const state = this.store.get();
    if (!state.route) {
      this.showToast("Generate a route before opening AR.");
      return;
    }

    if (!isGuestMode()) {
      // Same-origin Live View owns getUserMedia in the iframe. Parent priming
      // races the iframe on iOS and surfaces as "Camera blocked".
      beginArMediaPermissionPrime({
        camera: isArSameOrigin() ? 'reuse-only' : 'request',
      });
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
          this.store.patch({ guestArGatePrompt: "already-used" });
          return;
        }

        // First-time guests must acknowledge the one-time trial before AR opens.
        if (this.store.get().guestArGatePrompt !== "one-time-info") {
          this.store.patch({ guestArGatePrompt: "one-time-info" });
          return;
        }
      } catch (error) {
        this.store.patch({ guestArGateLoading: false });
        appWarn("Guest", "Could not resolve AR eligibility", error);
        this.showToast("Could not verify your AR trial. Please try again.");
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
    if (await this.blockNavigationOutsideVenue("ar")) return;
    if (!isGuestMode()) {
      this.store.patch({ guestArGatePrompt: null });
      await this.openAr();
      return;
    }

    if (!this.store.get().route) {
      this.store.patch({ guestArGatePrompt: null });
      this.showToast("Generate a route before opening AR.");
      return;
    }

    beginArMediaPermissionPrime({
      camera: isArSameOrigin() ? 'reuse-only' : 'request',
    });

    this.store.patch({
      guestArGatePrompt: null,
      guestArGateLoading: false,
    });
    await this.enterArFullscreen();
  }

  private async enterArFullscreen(): Promise<void> {
    if (await this.blockNavigationOutsideVenue("ar")) return;
    const state = this.store.get();
    if (!state.route) {
      this.showToast("Generate a route before opening AR.");
      return;
    }

    const cameraReadyHint = shouldReuseGrantedArCamera(
      permissionChoiceLocalDatasource.loadCamera() === "granted"
        ? "granted"
        : "prompt",
      isArSameOrigin(),
    );

    const progress = this.getNavigationProgressSnapshot();
    const userPosition =
      progress.latitude != null && progress.longitude != null
        ? ({
            latitude: progress.latitude,
            longitude: progress.longitude,
            floorId:
              progress.floorId ??
              state.route.pathCoordinates[0]?.floorId ??
              "unknown",
            ...(progress.heading != null ? { heading: progress.heading } : {}),
          } as RouteCoordinate & { heading?: number })
        : (this.blueDotService?.getLastPosition()?.coordinate ??
          serializeCoordinate(state.route.pathCoordinates[0] ?? null));

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
      { cameraReady: cameraReadyHint },
    );
    openArFullscreen(url, routePayload, { cameraReady: cameraReadyHint });
    this.store.patch({
      arPresentation: "fullscreen",
      guestArGatePrompt: null,
      guestArGateLoading: false,
    });
    void this.consumeGuestArTrialAfterLaunch();
    void this.resumeRouteNavigation(progress);
    appLog("AR", "Opened", { url, alongPathMeters: progress.alongPathMeters });

    void consumeArMediaPermissionPrime({
      camera: isArSameOrigin() ? 'reuse-only' : 'request',
    }).then((permissions) => {
      const cameraReady = shouldReuseGrantedArCamera(
        permissions.camera,
        isArSameOrigin(),
      );
      notifyArIframePermissions(
        cameraReady
          ? "granted"
          : isArSameOrigin()
            ? permissions.camera
            : "prompt",
      );
    });
    void this.warmArSensors();
  }

  private async consumeGuestArTrialAfterLaunch(): Promise<void> {
    if (!isGuestMode()) return;
    if (this.store.get().guestHasTriedArView) return;

    try {
      const preferences = await markGuestArViewTried();
      this.store.patch({
        guestHasTriedArView: preferences.hasTriedArView,
        guestHasTried2dView: preferences.hasTried2dView,
      });
    } catch (error) {
      appWarn("Guest", "Could not mark AR trial as used after launch", error);
    }
  }

  private async warmArSensors(): Promise<void> {
    const pendingSource = PositionProviderRegistry.resolveActiveSource();
    if (
      (pendingSource === "gps" || pendingSource === "apple_indoor") &&
      shouldRequestArMotionPermission()
    ) {
      void requestDeviceOrientationPermission();
    }
    if (!this.blueDotService?.isTracking) {
      try {
        await this.blueDotService?.startTracking({ watchDevicePosition: !this.venueGpsReference });
        await this.blueDotService?.enableHeading();
      } catch {
        /* AR can still use one-shot seed */
      }
    }
  }

  minimizeAr(): void {
    if (!isArSessionActive(this.store.get().arPresentation)) return;
    setArMinimized();
    this.store.patch({ arPresentation: "minimized" });
    this.maybeRevealArrivalDialog(this.store.get().routeSimulationComplete);
    appLog("AR", "Minimized to picture-in-picture");
  }

  maximizeAr(): void {
    if (!isArSessionActive(this.store.get().arPresentation)) return;
    setArMaximized();
    this.store.patch({ arPresentation: "fullscreen" });
    syncNavigationToAr(this.getNavigationProgressSnapshot());
    appLog("AR", "Maximized to fullscreen");
  }

  closeAr(): void {
    closeArFullscreen();
    this.store.patch({ arPresentation: "closed" });
    // Arrival already locked from AR or 2D progress - reveal the 2D dialog
    // now that fullscreen AR chrome is gone (unless the user already cleared).
    this.maybeRevealArrivalDialog(this.store.get().routeSimulationComplete);
  }

  async dismissArrivalDialog(): Promise<void> {
    this.store.patch({
      arrivalDialogOpen: false,
      arrivalDialogHandled: true,
    });
    await this.clearRoutePoints();
  }

  /**
   * AR reported arrival - permanently lock 2D navigation progress so GPS
   * jitter cannot reopen turn-by-turn / "End point" chrome.
   */
  lockNavigationArrival(): void {
    const state = this.store.get();
    navDiag?.update('arrival', 'MapApp.lockNavigationArrival:AR-message', {
      remainingMeters: state.routeRemainingMeters, latchBefore: state.routeSimulationComplete,
      eligible: !state.arrivalDialogHandled && state.routeSimulationComplete, triggered: !state.arrivalDialogHandled && state.routeSimulationComplete,
      reason: state.arrivalDialogHandled ? 'already-handled' : !state.routeSimulationComplete ? 'parent-arrival-not-confirmed' : 'AR-arrival-message', basis: 'parent-confirmation', accuracy: null });
    if (state.arrivalDialogHandled || !state.routeSimulationComplete) return;
    this.liveRouteTracking = false;
    const showDialog = state.arPresentation !== "fullscreen";
    this.store.patch({
      routeSimulating: false,
      routeSimulationComplete: true,
      routeRemainingMeters: 0,
      ...(showDialog && !state.arrivalDialogOpen
        ? { arrivalDialogOpen: true }
        : {}),
    });
  }

  /** Exit AR and clear the active route (arrival Okay / End navigation). */
  async endArNavigation(): Promise<void> {
    closeArFullscreen();
    this.liveRouteTracking = false;
    this.store.patch({
      arPresentation: "closed",
      arrivalDialogOpen: false,
      arrivalDialogHandled: true,
    });
    await this.clearRoutePoints();
  }

  async focusRouteStart(): Promise<void> {
    if (await this.blockNavigationOutsideVenue()) return;
    this.routePlanner?.focusRoutePoint("start");
    void this.startRouteMovement({ alongPathMeters: 0, resetProgress: true });
  }

  focusRouteEnd(): void {
    this.routePlanner?.focusRoutePoint("end");
  }

  isArOpen(): boolean {
    return (
      isArSessionActive(this.store.get().arPresentation) || isArFrameVisible()
    );
  }

  private resolveNavigationSource(): PositionSourceType {
    if (this.venueGpsReference) return 'gps';
    return PositionProviderRegistry.resolveNavigationSource(this.loadedVenueMapId ?? undefined);
  }

  /**
   * Switch or (re)start the live position provider for the active route without
   * wiping navigation progress.
   */
  private applyNavigationPositionMode(options: {
    path: RoutePayload["pathCoordinates"];
    resumeNavigating?: boolean;
    alongPathMeters?: number;
  }): void {
    const resumeNavigating = options.resumeNavigating === true;
    const alongPathMeters =
      options.alongPathMeters ?? this.store.get().routeTraveledMeters;
    const totalPathMeters =
      this.store.get().route?.distanceMeters ??
      coordinateTransformationService.totalPathLengthMeters(options.path);
    const remainingHint =
      Number.isFinite(totalPathMeters) && totalPathMeters > 0
        ? Math.max(0, totalPathMeters - alongPathMeters)
        : (this.store.get().routeRemainingMeters ??
          this.store.get().route?.distanceMeters ??
          null);

    const nextSource = this.resolveNavigationSource();
    const canReuseLiveProvider =
      this.positionProvider?.isRunning === true &&
      this.activePositionSource === nextSource;

    if (!canReuseLiveProvider) {
      this.stopPositionProvider({ preserveProgress: true });
      this.startPositionProvider(options.path);
    }

    if (this.store.get().locationPermission !== "granted") {
      this.liveRouteTracking = false;
      this.store.patch({
        routeSimulating: false,
        routeSimulationComplete: false,
        routeTraveledMeters: alongPathMeters,
        routeRemainingMeters: remainingHint,
      });
      return;
    }

    this.alongPathStabilizer.reset(alongPathMeters);
    if (!resumeNavigating) {
      this.liveRouteTracking = false;
      this.store.patch({
        routeTraveledMeters: alongPathMeters,
        routeRemainingMeters: remainingHint,
        routeSimulating: false,
        routeSimulationComplete: false,
      });
      return;
    }

    this.liveRouteTracking = true;
    this.lastAlongPublishAt = performance.now();
    this.blueDotService?.follow();
    void this.blueDotService?.enableHeading({ forceDuringSimulator: true });
    this.store.patch({
      blueDotFollowing: true,
      routeSimulating: true,
      routeSimulationComplete: false,
      routeTraveledMeters: alongPathMeters,
      routeRemainingMeters: remainingHint,
    });
    this.snapBlueDotToAlongPath(alongPathMeters);
    if (isArSessionActive(this.store.get().arPresentation)) {
      syncNavigationToAr(this.getNavigationProgressSnapshot());
    }
  }

  private projectFrameOntoRoute(
    frame: FplacesPositionFrame,
  ): FplacesPositionFrame {
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
        previousAlongMeters: this.store.get().routeTraveledMeters,
      },
    );
    navDiag?.update('route-snap', 'MapApp.projectFrameOntoRoute', { input: frame, snapped,
      previousAlongMeters: this.store.get().routeTraveledMeters });
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

  /** Draw the avatar at the stabilized odometer, not the raw nearest vertex. */
  private bindFrameToStabilizedAlong(
    projected: FplacesPositionFrame,
    alongMeters: number,
  ): FplacesPositionFrame {
    const path = this.store.get().route?.pathCoordinates;
    if (!path?.length) {
      return { ...projected, alongPathMeters: alongMeters };
    }
    const point = coordinateTransformationService.snapAtDistanceAlongPath(
      path,
      alongMeters,
    );
    if (!point) {
      return { ...projected, alongPathMeters: alongMeters };
    }
    return {
      ...projected,
      latitude: point.latitude,
      longitude: point.longitude,
      floorId: point.floorId ?? projected.floorId,
      alongPathMeters: alongMeters,
    };
  }

  /** Place the glowing blue-dot on the route at the navigation seed / odometer. */
  private snapBlueDotToAlongPath(alongMeters: number): void {
    const path = this.store.get().route?.pathCoordinates;
    if (!path?.length) return;
    const point = coordinateTransformationService.snapAtDistanceAlongPath(
      path,
      alongMeters,
    );
    if (!point || point.latitude == null || point.longitude == null) return;
    this.blueDotService?.applySimulatorFrame({
      latitude: point.latitude,
      longitude: point.longitude,
      heading: this.blueDotService.getLastPosition()?.heading,
      accuracy: 4,
      source: "gps",
      floorId: point.floorId,
      alongPathMeters: alongMeters,
      timestamp: Date.now(),
    });
  }

  private getNavigationProgressSnapshot(): NavigationProgressSnapshot {
    const state = this.store.get();

    const alongPathMeters = state.routeTraveledMeters;
    const routeTraveledMeters = state.routeTraveledMeters;
    let routeRemainingMeters = state.routeRemainingMeters;
    const routeSimulating = state.routeSimulating;
    const routeSimulationComplete = state.routeSimulationComplete;
    let source: NavigationProgressSnapshot["source"];

    if (routeRemainingMeters == null && state.route?.distanceMeters != null) {
      routeRemainingMeters = Math.max(
        0,
        state.route.distanceMeters - routeTraveledMeters,
      );
    }

    if (state.routeSimulating || this.liveRouteTracking) {
      // Snapped map progress is venue authority for AR, not raw outdoor GPS.
      source = "pwa";
    }

    const lastPos = this.blueDotService?.getLastPosition();
    const routePosition = state.route && (state.routeSimulating || this.liveRouteTracking)
      ? this.lastNavigationPosition?.route === state.route ? this.lastNavigationPosition.frame
        : coordinateTransformationService.snapAtDistanceAlongPath(state.route.pathCoordinates, routeTraveledMeters)
      : null;
    // The approximate display position must never become AR navigation evidence.
    const coordinate = routePosition ?? lastPos?.coordinate;
    const latitude = coordinate?.latitude;
    const longitude = coordinate?.longitude;
    const heading = lastPos?.heading ?? undefined;
    const floorId = coordinate?.floorId ?? lastPos?.floorId;

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
  private async resumeRouteNavigation(
    progress: NavigationProgressSnapshot,
  ): Promise<void> {
    const state = this.store.get();
    if (!state.route?.pathCoordinates?.length) return;

    if (this.liveRouteTracking || state.routeSimulating) {
      this.syncRouteProgress(true);
      syncNavigationToAr(this.getNavigationProgressSnapshot());
      return;
    }

    if (
      progress.routeSimulating ||
      progress.alongPathMeters > 0.05 ||
      progress.routeSimulationComplete
    ) {
      await this.startRouteMovement({ alongPathMeters: progress.alongPathMeters });
      return;
    }

    await this.startRouteMovement();
  }

  /** Kick live GPS / IPS tracking along the active route. */
  async startRouteMovement(options?: {
    alongPathMeters?: number;
    resetProgress?: boolean;
  }): Promise<void> {
    navDiag?.record('navigation-lifecycle', 'MapApp.startRouteMovement', { reason: 'navigation-start-request', options });
    if (await this.blockNavigationOutsideVenue()) return;
    const state = this.store.get();
    if (!state.route?.pathCoordinates?.length) {
      this.showToast("Generate a route before starting navigation.");
      console.warn("[PWA Bridge] startRouteMovement skipped - no route path");
      return;
    }

    if (state.isCalculatingRoute) {
      this.showToast("Route is still calculating…");
      return;
    }

    const targetAlong =
      typeof options?.alongPathMeters === "number"
        ? options.alongPathMeters
        : options?.resetProgress === true
          ? 0
          : resolveLiveNavigationStartAlongMeters({
              lastProjectedAlongMeters: this.lastProjectedAlongMeters,
              routeTraveledMeters: state.routeTraveledMeters,
            });

    if (!(await this.ensureLocationEnabledForAction())) {
      return;
    }
    this.alongPathStabilizer.reset(targetAlong);
    this.applyNavigationPositionMode({
      path: state.route.pathCoordinates,
      resumeNavigating: true,
      alongPathMeters: targetAlong,
    });
    this.lastProgressUiAt = 0;
    appLog("Position", "Live IPS route tracking armed", {
      alongPathMeters: targetAlong,
      pathPoints: state.route.pathCoordinates.length,
      source: this.resolveNavigationSource(),
    });
    if (isArSessionActive(this.store.get().arPresentation)) {
      syncNavigationToAr(this.getNavigationProgressSnapshot());
    }
  }

  async beginOrResetRoute(): Promise<void> {
    await this.startRouteMovement();
  }

  resetRouteSimulation(): void {
    const state = this.store.get();
    if (!state.route?.pathCoordinates?.length) return;

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
    if (
      !force &&
      !state.routeSimulating &&
      !this.liveRouteTracking &&
      !state.routeSimulationComplete
    ) {
      return;
    }
    const now = performance.now();
    if (
      !force &&
      !state.routeSimulationComplete &&
      now - this.lastProgressUiAt < 200
    )
      return;
    this.lastProgressUiAt = now;
    // Live progress is patched in handleProviderFrame from snapped meters.
  }

  private syncLiveRouteProgress(
    alongPathMeters: number,
    options?: {
      offRouteMeters?: number;
      accuracyMeters?: number | null;
      diagnosticSnapped?: FplacesPositionFrame;
      destinationDistanceM?: number | null;
      force?: boolean;
      positionHeld?: boolean;
    },
  ): number | null {
    const state = this.store.get();
    if (!state.route) return null;
    const force = options?.force === true;
    if (!this.liveRouteTracking && !state.routeSimulating && !force)
      return null;

    // Once arrival is locked, keep navigation frozen until Okay / clearRoute.
    if (isArrivalLocked(state)) {
      navDiag?.update('arrival', 'MapApp.syncLiveRouteProgress', { triggered: false, latchBefore: true, reason: 'already-latched', remainingMeters: state.routeRemainingMeters });
      this.liveRouteTracking = false;
      this.store.patch({
        routeSimulating: false,
        routeSimulationComplete: true,
        routeRemainingMeters: 0,
      });
      this.maybeRevealArrivalDialog(true);
      return state.routeTraveledMeters;
    }

    const total =
      state.route.distanceMeters ??
      coordinateTransformationService.totalPathLengthMeters(
        state.route.pathCoordinates,
      );
    const stabilizedAlong = this.alongPathStabilizer.update({
      nextAlongMeters: alongPathMeters,
      offRouteMeters: options?.offRouteMeters,
      accuracyMeters: options?.accuracyMeters,
    });
    const now = performance.now();
    const dtSeconds =
      this.lastAlongPublishAt > 0
        ? (now - this.lastAlongPublishAt) / 1000
        : 0.5;
    this.lastAlongPublishAt = now;
    // Continuous forward GPS snaps (within the L-path window) must advance the
    // published odometer; otherwise Begin seeds correctly then freezes again.
    const continuousAlong = advanceContinuousAlongMeters({
      previousAlongMeters: stabilizedAlong,
      rawAlongMeters: alongPathMeters,
      dtSeconds,
      maxAlongDeltaMeters: DEFAULT_MAX_ALONG_DELTA_METERS,
    });
    const traveled = options?.positionHeld ? state.routeTraveledMeters : Math.max(
      0,
      Math.min(total, Math.max(stabilizedAlong, continuousAlong)),
    );
    if (traveled > stabilizedAlong) {
      this.alongPathStabilizer.alignTo(traveled, now);
    }
    const remaining = computeLiveRemainingMeters({
      totalPathMeters: total,
      alongPathMeters: traveled,
      offRouteMeters: options?.offRouteMeters,
    });
    const atEnd = options?.destinationDistanceM != null && options.destinationDistanceM <= 4 &&
      options?.accuracyMeters != null && options.accuracyMeters >= 0 && options.accuracyMeters <= 10 && hasArrivedAtDestination({
      totalPathMeters: total,
      alongPathMeters: traveled,
      offRouteMeters: options?.offRouteMeters,
    });

    navDiag?.update('progress', 'MapApp.syncLiveRouteProgress', { alongPathMeters: traveled,
      previousAlongMeters: state.routeTraveledMeters, delta: traveled - state.routeTraveledMeters,
      rawAlongMeters: alongPathMeters, stabilizedAlong, continuousAlong, positionHeld: options?.positionHeld ?? false, remainingMeters: remaining,
      offRouteMeters: options?.offRouteMeters, accuracy: options?.accuracyMeters, currentLegIndex: state.currentLegIndex, maneuver: state.routeInstructions });
    navDiag?.update('arrival', 'MapApp.syncLiveRouteProgress', { thresholdM: 0.75, offRouteThresholdM: 4,
      accuracyThresholdM: 10, accuracy: options?.accuracyMeters, remainingMeters: remaining,
      alongPathMeters: traveled, offRouteMeters: options?.offRouteMeters, latchBefore: false,
      snapped: options?.diagnosticSnapped ?? null, destinationDistanceM: options?.destinationDistanceM ?? null,
      eligible: atEnd, triggered: atEnd && traveled > 0, basis: 'snapped-progress',
      reason: atEnd && traveled > 0 ? '2D-end-criteria-met' : '2D-end-criteria-not-met' });
    if (atEnd && traveled > 0) {
      this.liveRouteTracking = false;
      this.store.patch({
        routeTraveledMeters: traveled,
        routeRemainingMeters: 0,
        routeSimulating: false,
        routeSimulationComplete: true,
      });
      this.routePlanner?.updateDestinationProximity(0, total);
      this.maybeRevealArrivalDialog(true);
      return traveled;
    }

    this.liveRouteTracking = true;
    this.store.patch({
      routeTraveledMeters: traveled,
      routeRemainingMeters: remaining,
      routeSimulating: true,
      routeSimulationComplete: false,
    });
    this.routePlanner?.updateDestinationProximity(remaining, total);
    return traveled;
  }

  private maybeRevealArrivalDialog(atEnd: boolean): void {
    if (!atEnd) return;
    const state = this.store.get();
    if (state.arrivalDialogHandled || state.arrivalDialogOpen) return;
    if (state.arPresentation === "fullscreen") return;
    this.store.patch({ arrivalDialogOpen: true });
  }

  private suppressNativeMapBlueDot(): void {
    const nativeBlueDot = (
      this.mapView as { BlueDot?: { disable?: () => void } } | null
    )?.BlueDot;
    nativeBlueDot?.disable?.();
    appLog("Map", "Native BlueDot suppressed at boot");
  }

  private wireMapEvents(): void {
    if (!this.mapView) return;

    this.mapView.on("click", async (event) => {
      const pointer = this.mapGestureGuard?.getLastPointerClient();
      const rawEvent = event as Record<string, unknown>;
      const summarize = (value: unknown): unknown => {
        if (!value || typeof value !== "object") return value;
        const item = value as Record<string, unknown>;
        return {
          id: item.id,
          name: item.name,
          type: item.type,
          floor: typeof item.floor === "object"
            ? (item.floor as Record<string, unknown> | null)?.id
            : item.floor,
          coordinate: item.coordinate,
        };
      };
      appLog("MapTap", "Mappedin area clicked", {
        pointer,
        eventKeys: Object.keys(rawEvent),
        coordinate: summarize(rawEvent.coordinate),
        location: summarize(rawEvent.location),
        space: summarize(rawEvent.space),
        polygon: summarize(rawEvent.polygon),
        floor: summarize(rawEvent.floor),
        rawEvent,
      });
      if (this.mapGestureGuard?.shouldIgnoreMapClick()) {
        appLog("MapTap", "Click ignored after gesture", { pointer });
        return;
      }

      if (
        pointer &&
        this.socialMapMarkers?.trySelectAtClientPoint(pointer.x, pointer.y)
      ) {
        appLog("MapTap", "Click matched a location anchor", { pointer });
        return;
      }
      appLog("MapTap", "Click did not match a location anchor", { pointer });

      if (!this.routePlanner || this.routePlanner.isRoutePlanningPaused) return;
      if (await this.blockNavigationOutsideVenue()) return;
      const tapCoordinate =
        this.resolveTapCoordinateFromPointer(pointer) ?? event?.coordinate;
      if (!tapCoordinate) return;
      try {
        await this.routePlanner.handleMapClick(tapCoordinate);
        this.store.patch({ markers: this.routePlanner.markersState });
        this.scheduleAutoRoute();
      } catch (error) {
        this.showToast(
          toUserFacingRouteError(error, "Could not set route point."),
        );
      }
    });

    this.mapView.on("user-interaction-start", () => {
      appLog("MapCamera", "user-interaction-start");
      this.releaseCameraFollowFromUserPan();
    });

    this.mapView.on("floor-change", (event) => {
      const floorId =
        (event as { floor?: { id?: string } }).floor?.id ??
        this.mapView?.currentFloor?.id;
      if (floorId) {
        navDiag?.update('map-floor', 'MapApp.floor-change', { reason: 'SDK-floor-change', previousState: this.store.get().currentFloorId, newState: floorId, movementEvidence: false });
        this.store.patch({ currentFloorId: floorId });
      }
    });

    this.mapView.on("camera-change", () => {
      navDiag?.sample('map-camera', 'MapApp.camera-change', { movementEvidence: false,
        center: this.mapView?.Camera.center ? { latitude: this.mapView.Camera.center.latitude, longitude: this.mapView.Camera.center.longitude } : null,
        bearing: this.mapView?.Camera.bearing, zoom: this.mapView?.Camera.zoomLevel });
      const camera = this.mapView?.Camera;
      appLog("MapCamera", "camera-change", {
        zoom: camera?.zoomLevel,
        min: camera?.minZoomLevel,
        max: camera?.maxZoomLevel,
        restoring: this.restoringVenueView,
      });
      // Mappedin's actual camera minimum is venue/map dependent. The old
      // fixed level-16 check fought normal gestures (the camera was observed
      // at 15.888, then immediately animated back on every camera-change).
      // Only recover if the SDK reports that the camera is genuinely below
      // its own minimum, which avoids a restore loop during pan/pinch.
      const zoom = camera?.zoomLevel;
      const minZoom = camera?.minZoomLevel;
      if (
        !this.restoringVenueView &&
        typeof zoom === "number" &&
        typeof minZoom === "number" &&
        zoom < minZoom - 0.05
      ) {
        appLog("MapCamera", "below SDK minimum; restoring venue view", {
          zoom,
          minZoom,
        });
        this.restoreVenueMapView();
      }
    });

    this.mapData?.on("language-change", ({ code, name }) => {
      appLog("Map", `Language changed to ${name} (${code})`);
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
    this.syncSocialMapMarkers();
    this.socialMapMarkers?.refreshForLanguageChange();
  }

  private publishFloors(): void {
    if (!this.mapData) return;
    const floors: FloorInfo[] = this.mapData
      .getByType("floor")
      .map((floor, index) => ({
        id: floor.id,
        name: floor.name ?? `Floor ${index + 1}`,
        sortOrder: index,
      }));
    this.store.patch({ floors });
  }

  private scheduleAutoRoute(): void {
    void this.maybeAutoStartBlueDot();
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
        "Could not build a route. Try different points.",
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
        routeInstructions: "",
        routeTraveledMeters: 0,
        routeRemainingMeters: null,
        routeSimulating: false,
        routeSimulationComplete: false,
      });
    } finally {
      this.store.patch({ isCalculatingRoute: false });
      void this.maybeAutoStartBlueDot();
    }
  }

  private applyRoute(route: RoutePayload): void {
    navDiag?.update('route-lifecycle', 'MapApp.applyRoute', { reason: 'route-created-or-recalculated', path: route.pathCoordinates, distanceM: route.distanceMeters, floorTransitions: route.floorTransitions });
    if (!this.routePlanner) return;
    this.routePlanner.setRoutePlanningPaused(true);
    const instructions = legInstructions(route.legs[0]);
    const wasArOpen = isArSessionActive(this.store.get().arPresentation);

    routeLifecycleManager.transition("recalculating");
    this.liveRouteTracking = false;
    const progress = this.seedRouteProgressFromUser(route);
    this.alongPathStabilizer.reset(progress.traveled);
    this.lastProjectedAlongMeters = progress.traveled;
    this.lastAlongPublishAt = 0;

    this.store.patch({
      route,
      showRouteSheet: true,
      currentLegIndex: 0,
      routeInstructions: instructions,
      markers: this.routePlanner.markersState,
      routeTraveledMeters: progress.traveled,
      routeRemainingMeters: progress.remaining,
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
        reason: "reroute",
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
        reason: "leg_change",
      });
    }
  }

  private streamPositionToAr(
    position: {
      coordinate: { latitude: number; longitude: number; floorId?: string };
      accuracy?: number;
      heading?: number;
      floorId?: string;
      timestamp?: number;
    },
    animated = false,
  ): void {
    if (!isArSessionActive(this.store.get().arPresentation)) return;

    if (this.positionProvider?.isRunning) return;

    const now = performance.now();
    if (animated && now - this.lastArStreamAt < 90) return;
    this.lastArStreamAt = now;

    dispatchPositionToAr({
      latitude: position.coordinate.latitude,
      longitude: position.coordinate.longitude,
      accuracy: position.accuracy ?? 15,
      heading: position.heading,
      source: this.activePositionSource,
      floorId: position.floorId ?? position.coordinate.floorId,
      timestamp: position.timestamp,
    });
  }

  private handleBlueDotSensorPosition(position: {
    coordinate: { latitude: number; longitude: number; floorId?: string };
    accuracy?: number;
    heading?: number;
    floorId?: string;
    timestamp?: number;
  }): void {
    navDiag?.record('mappedin-sensor', 'MapApp.handleBlueDotSensorPosition', { coordinate: position.coordinate, accuracy: position.accuracy, ignored: !!this.venueGpsReference || !!navDiag?.frozen });
    if (this.venueGpsReference || navDiag?.frozen) return;
    this.ingestPositionFrame({
      latitude: position.coordinate.latitude,
      longitude: position.coordinate.longitude,
      heading: position.heading,
      accuracy: position.accuracy ?? 15,
      source: this.positionProvider?.isRunning
        ? this.activePositionSource
        : "gps",
      floorId: position.floorId ?? position.coordinate.floorId,
      timestamp: position.timestamp,
    });
    this.streamPositionToAr(position, false);
  }

  private handleBlueDotAnimatedPosition(position: {
    coordinate: { latitude: number; longitude: number; floorId?: string };
    mapCoordinate?: import("@mappedin/mappedin-js").Coordinate;
    accuracy?: number;
    heading?: number;
    floorId?: string;
    timestamp?: number;
  }): void {
    navDiag?.update('mappedin-display', 'MapApp.handleBlueDotAnimatedPosition', { coordinate: position.coordinate, accuracy: position.accuracy, floorId: position.floorId });
    const coordinate = position.mapCoordinate;
    if (coordinate && this.store.get().route) {
      this.mapView?.Navigation?.trackCoordinate?.(coordinate, {
        mode: "travelled",
        color: "#64748b",
      });
    }

    if (isArSessionActive(this.store.get().arPresentation)) {
      this.ingestPositionFrame({
        latitude: position.coordinate.latitude,
        longitude: position.coordinate.longitude,
        heading: position.heading,
        accuracy: position.accuracy ?? 15,
        source: this.positionProvider?.isRunning
          ? this.activePositionSource
          : "gps",
        floorId: position.floorId ?? position.coordinate.floorId,
        timestamp: position.timestamp,
      });
      this.streamPositionToAr(position, true);
    }
  }

  private startPositionProvider(path: RoutePayload["pathCoordinates"]): void {
    this.initializeVenueSimulationMapAnchor();
    this.stopPositionProvider({ preserveProgress: true });
    this.activePositionSource = this.resolveNavigationSource();
    positionTelemetry.setActiveSource(this.activePositionSource);
    this.floorOrchestrator.reset();
    positionTelemetry.setOrchestratorState(this.floorOrchestrator.getState());
    this.blueDotService?.setSimulatorParallelMode(true, {
      compassGlow: true,
    });

    const originFloorId = path[0]?.floorId ?? this.store.get().currentFloorId;
    if (originFloorId) {
      this.floorOrchestrator.forceFloor(originFloorId);
      positionTelemetry.setOrchestratorState(this.floorOrchestrator.getState());
      this.applyOrchestratedFloor(originFloorId);
    }

    if (this.store.get().locationPermission !== "granted") {
      appLog(
        "Position",
        "Skipping live GPS - location permission is not granted",
      );
      this.positionProvider = null;
      this.blueDotService?.setSimulatorParallelMode(false);
      return;
    }

    this.positionProvider = PositionProviderRegistry.getProvider(
      this.activePositionSource,
    );
    this.positionProvider.start((frame) => this.handleProviderFrame(frame), {
      path,
      floorId: originFloorId,
      expectedFloorId: originFloorId,
      venueMapId: this.loadedVenueMapId ?? undefined,
      onStatus: (status) => this.handleLivePositionStatus(status),
    });

    appLog("Position", "Provider started", {
      source: this.activePositionSource,
      pathPoints: path.length,
      originFloorId,
    });
  }

  private stopPositionProvider(options?: { preserveProgress?: boolean }): void {
    this.positionProvider?.stop();
    this.positionProvider = null;
    this.blueDotService?.setSimulatorParallelMode(Boolean(this.venueGpsReference));
    this.lastArStreamAt = 0;
    this.lastArProviderStreamAt = 0;
    this.lastProviderFix = null;
    this.lastProjectedAlongMeters = null;
    this.lastAlongPublishAt = 0;
    this.floorOrchestrator.reset();
    positionTelemetry.setOrchestratorState(this.floorOrchestrator.getState());
    positionTelemetry.setActiveSource("none");
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

  private ingestPositionFrame(
    frame: FplacesPositionFrame,
    meta?: {
      bleUuid?: string;
      bleMajor?: number;
      bleMinor?: number;
      bleRssi?: number;
    },
  ): void {
    const currentFloorId = this.store.get().currentFloorId;
    if (frame.floorId && currentFloorId && frame.floorId !== currentFloorId) {
      appLog(
        "Position",
        "Floor ID mismatch - frame floor differs from map view",
        {
          frameFloorId: frame.floorId,
          currentFloorId,
          source: frame.source,
        },
      );
    }

    positionTelemetry.recordFrame(frame, meta);
    positionTelemetry.recordStreamTick(frame.source);

    if (frame.floorId) {
      const route = this.store.get().route;
      const transitions = route?.floorTransitions ?? [];
      const alongM =
        frame.alongPathMeters ?? this.store.get().routeTraveledMeters ?? 0;
      const upcoming = transitions.find((t) => {
        const path = route?.pathCoordinates ?? [];
        return path[t.pathIndex] != null;
      });
      const result = this.floorOrchestrator.propose(frame.floorId, {
        headingDegrees: frame.heading,
        confidence:
          frame.accuracy != null ? Math.max(0.3, 1 - frame.accuracy / 30) : 0.6,
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

  /**
   * Prefer projecting the real finger position through the map canvas.
   * SDK click raycasts can land on the wrong 3D surface and place the pin
   * across the venue from where the guest tapped.
   */
  private resolveTapCoordinateFromPointer(
    pointer: { x: number; y: number } | null | undefined,
  ): unknown | null {
    if (!pointer || !this.mapView || !this.mapContainer) return null;
    const canvasPoint = clientPointToCanvasPoint(
      pointer.x,
      pointer.y,
      resolveMapCanvasRect(this.mapContainer),
    );
    if (!canvasPoint) return null;
    try {
      return (
        this.mapView.createCoordinateFromScreenCoordinate?.(
          canvasPoint.x,
          canvasPoint.y,
          this.mapView.currentFloor ?? undefined,
        ) ?? null
      );
    } catch (error) {
      appWarn("Map", "Screen tap projection failed", error);
      return null;
    }
  }

  private handleLivePositionStatus(status: PositionProviderStatus, reason = 'provider-signal'): void {
    navDiag?.update('positioning-status', 'MapApp.handleLivePositionStatus', { status, reason,
      providerSignalStatus: this.positionProvider?.signalStatus ?? null });
    if (status !== 'active') {
      this.blueDotService?.setPositionAvailability?.('retained');
      this.reportBlueDotAvailability(`provider-${status}`, { positioningStatus: status, statusReason: reason, providerSignalStatus: this.positionProvider?.signalStatus ?? null, subscriptionRunning: this.positionProvider?.isRunning ?? false });
    }
    if (status === 'active') return; // Only accepted fixes restore live UI status.
    const previous = this.store.get().blueDotStatus;
    this.store.patch({ blueDotStatus: status });
    if ((status === 'error' || status === 'inactive') && previous !== status) {
      this.lastProviderFix = null;
      this.lastProjectedAlongMeters = null;
      if (status === 'error') {
        void this.showLocationGateForRequiredAction(
          new Error('Location unavailable. Check location permission and try again.'),
        );
      } else {
        this.showToast(
          'Location signal is weak or lost. Progress is paused until it recovers.',
        );
      }
    }
  }

  private handleProviderFrame(frame: FplacesPositionFrame): void {
    const previousCause = navDiag?.cause ?? null;
    const cause = navDiag?.record('provider-frame', 'MapApp.handleProviderFrame', { raw: frame,
      gpsAgeMs: frame.timestamp == null ? null : Date.now() - frame.timestamp });
    if (navDiag) navDiag.cause = cause ?? null;
    try { this.handleDiagnosticProviderFrame(frame); }
    finally { if (navDiag) navDiag.cause = previousCause; }
  }

  private handleHeadingOnlyFrame(heading: number | undefined): void {
    if (heading == null || !Number.isFinite(heading)) return;
    this.blueDotService?.applyHeadingOnly(heading);
    if (!(isArFrameVisible() || isArSessionActive(this.store.get().arPresentation))) return;
    const now = performance.now();
    if (now - this.lastArProviderStreamAt >= 90) {
      this.lastArProviderStreamAt = now;
      // Share compass turns with AR using the unchanged trusted navigation
      // position/clock, never the cached GPS attached to the orientation event.
      if (this.liveRouteTracking || this.store.get().routeSimulating) {
        syncNavigationToAr(this.getNavigationProgressSnapshot());
      }
    }
  }

  private handleDiagnosticProviderFrame(frame: FplacesPositionFrame): void {
    if (frame.headingOnly) {
      this.handleHeadingOnlyFrame(frame.heading);
      navDiag?.record('heading-only', 'MapApp.handleProviderFrame', { heading: frame.heading,
        originalGpsTimestamp: frame.timestamp, navigationEligible: false });
      return;
    }
    navDiag?.update('gps-fix-quality', 'MapApp.handleProviderFrame', describePositionFixQuality(frame));
    if (!isUsableDisplayFix(frame)) {
      this.reportBlueDotAvailability('unusable-position-fix', { accuracy: frame.accuracy, ageMs: frame.timestamp == null ? null : Date.now()-frame.timestamp });
      recordPhonePosition(frame, null, null, 'rejected-fix', !!this.venueGpsReference);
      navDiag?.update('position', 'MapApp.handleProviderFrame', { raw: frame, accepted: false, reason: !Number.isFinite(frame.latitude) || !Number.isFinite(frame.longitude) || Math.abs(frame.latitude)>90 || Math.abs(frame.longitude)>180 ? 'invalid-coordinate' : !Number.isFinite(frame.accuracy) || frame.accuracy<0 || frame.accuracy>50 ? 'accuracy-outside-0-to-50m' : 'missing-invalid-stale-or-future-timestamp', gpsAgeMs: frame.timestamp == null ? null : Date.now()-frame.timestamp });
      this.handleLivePositionStatus('inactive', 'unusable-display-fix');
      return;
    }
    const physicalFrame = frame;
    if (this.venueGpsReference && frame.source === 'gps') {
      this.initializeVenueSimulationMapAnchor();
      this.venueGpsReference.capture(frame);
      const translated = this.venueGpsReference.translate(frame);
      if (!translated) {
        this.reportBlueDotAvailability('simulation-map-anchor-unavailable');
        recordPhonePosition(frame, null, null, 'waiting-for-reference', true);
        return;
      }
      const anchorFloor = this.venueGpsReference.diagnosticSnapshot().mapAnchor?.floorId;
      const viewFloor = this.mapView?.currentFloor?.id ?? this.store.get().currentFloorId;
      frame = { ...translated, floorId: translated.floorId ??
        (this.store.get().route ? viewFloor ?? anchorFloor : anchorFloor ?? viewFloor) };
    }
    const translatedFrame = frame;
    const filterIdentity = `${this.loadedVenueMapId}:${frame.source}:${this.venueGpsReference?.diagnosticSnapshot().revision ?? 'physical'}`;
    if (!isUsableLiveFix(physicalFrame)) {
      // Coarse fixes may locate the dot, but never feed route projection,
      // progress, arrival, floor orchestration or the AR navigation clock.
      // Keep this display filter separate so it cannot seed precise navigation.
      if (!this.approximatePositionFilter || this.approximateFilterIdentity !== filterIdentity) {
        this.approximatePositionFilter = createStationaryPositionFilter({ minMoveMeters: 1.5, accuracyFraction: 0.35, confirmationSamples: 2 });
        this.approximateFilterIdentity = filterIdentity;
        const previous = this.blueDotService?.getLastPosition?.();
        if (previous) this.approximatePositionFilter.process({ ...previous.coordinate, accuracy: previous.accuracy });
      }
      const stabilized = this.approximatePositionFilter.process(frame);
      navDiag?.update('provider-filter', 'MapApp.approximate-display', { ...stabilized, incoming: translatedFrame });
      if (stabilized.reason === 'non-increasing-timestamp') return;
      const display = { ...frame, latitude: stabilized.fix.latitude, longitude: stabilized.fix.longitude };
      this.blueDotService?.applySimulatorFrame(display);
      navDiag?.update('renderer-submission', 'MapApp.approximate-display', { rawMapCoordinate: translatedFrame, submitted: display,
        rawToRenderedM: navDiag.distance(translatedFrame, this.blueDotService?.coordinate ?? display), renderer: this.blueDotService?.getLocationDiagnosticSnapshot?.(), navigationEligible: false });
      this.handleLivePositionStatus('inactive', 'approximate-display-only');
      this.blueDotService?.setPositionAvailability?.('approximate');
      this.reportBlueDotAvailability('approximate-position-sent-to-renderer', { accuracy: frame.accuracy, navigationEligible: false });
      navDiag?.update('position', 'MapApp.handleProviderFrame', { raw: physicalFrame, translated: translatedFrame,
        filtered: display, accepted: true, navigationEligible: false, reason: 'approximate-display-only' });
      recordPhonePosition(physicalFrame, display, null, 'approximate-display-only', !!this.venueGpsReference);
      return;
    }
    if (!this.providerPositionFilter || this.providerFilterIdentity !== filterIdentity) {
      this.providerPositionFilter = createStationaryPositionFilter({ minMoveMeters: 1.5, accuracyFraction: 0.35, confirmationSamples: 2 });
      this.providerFilterIdentity = filterIdentity;
    }
    let positionHeld = false;
    if (frame.source === 'gps') {
      const stabilized = this.providerPositionFilter.process(frame);
      positionHeld = stabilized.held;
      if (stabilized.reason === 'non-increasing-timestamp') {
        navDiag?.record('gps-fix-rejected', 'MapApp.handleProviderFrame', { reason: stabilized.reason, timestamp: frame.timestamp, movementEvidence: false });
        this.handleHeadingOnlyFrame(frame.heading); return;
      }
      frame = { ...frame, latitude: stabilized.fix.latitude, longitude: stabilized.fix.longitude };
      navDiag?.update('provider-filter', 'MapApp.handleProviderFrame', { incoming: translatedFrame, filtered: frame, ...stabilized });
    }

    // Diagnostic-only freeze is applied before projection; physical GPS remains untouched.
    if (navDiag?.frozen) frame = navDiag.accept(frame);
    const projected = this.projectFrameOntoRoute(frame);
    navDiag?.update('position', 'MapApp.handleProviderFrame', { raw: physicalFrame, translated: translatedFrame,
      filtered: frame, snapped: projected, accepted: !this.store.get().route || isUsableRouteSnap(projected),
      reason: this.store.get().route && !isUsableRouteSnap(projected) ? 'missing-or-over-30m-route-snap' : 'accepted',
      source: frame.source, frozen: navDiag?.frozen, simulation: this.venueGpsReference?.diagnosticSnapshot() ?? null });
    recordPhonePosition(physicalFrame, frame, projected,
      this.store.get().route && !isUsableRouteSnap(projected) ? 'rejected-route-snap' : 'accepted',
      !!this.venueGpsReference);
    if (this.store.get().route && !isUsableRouteSnap(projected)) {
      this.reportBlueDotAvailability('route-snap-rejected', { offRouteMeters: projected.offRouteMeters });
      this.handleLivePositionStatus('inactive', 'route-snap-rejected');
      return;
    }
    if (!navDiag?.frozen) navDiag?.accept(frame);
    this.store.patch({ blueDotStatus: 'active' });
    if (isHeadingOnlyPositionFix(this.lastProviderFix, frame) &&
        frame.timestamp === this.lastProviderFix?.timestamp) {
      this.handleHeadingOnlyFrame(frame.heading);
      return;
    }
    this.lastProviderFix = {
      latitude: frame.latitude,
      longitude: frame.longitude,
      timestamp: frame.timestamp,
    };

    if (!navDiag?.frozen) this.publishUserLocation({
      latitude: physicalFrame.latitude,
      longitude: physicalFrame.longitude,
      accuracy: physicalFrame.accuracy ?? null,
    });

    if (typeof projected.alongPathMeters === "number") {
      this.lastProjectedAlongMeters = projected.alongPathMeters;
    }

    let display = projected;
    if (typeof projected.alongPathMeters === "number") {
      const traveled = this.syncLiveRouteProgress(projected.alongPathMeters, {
        offRouteMeters: projected.offRouteMeters,
        accuracyMeters: projected.accuracy,
        diagnosticSnapped: navDiag ? projected : undefined,
        positionHeld,
        destinationDistanceM: this.store.get().route?.pathCoordinates.at(-1)
          ? haversineMeters(frame, this.store.get().route!.pathCoordinates.at(-1)!) : null,
      });
      if (traveled != null) {
        const rawAlong = projected.alongPathMeters;
        const continuous =
          Math.abs(rawAlong - traveled) <= DEFAULT_MAX_ALONG_DELTA_METERS;
        // Follow the live snap when continuous (pre-Begin feel). Only pin to
        // the odometer when the snap would teleport across an L-corner.
        display = continuous
          ? projected
          : this.bindFrameToStabilizedAlong(projected, traveled);
      }
    }

    navDiag?.update('display-position', 'MapApp.handleProviderFrame', { filtered: display, projected, progress: this.getNavigationProgressSnapshot() });
    const route = this.store.get().route;
    if (route) this.lastNavigationPosition = { route, frame: display };
    navDiag?.update('navigation-quality-position', 'MapApp.handleProviderFrame', { frame: display, physical: physicalFrame, reason: 'fresh-navigation-quality-and-valid-route-snap' });
    this.ingestPositionFrame(display);

    this.blueDotService?.applySimulatorFrame(display);
    navDiag?.update('renderer-submission', 'MapApp.handleProviderFrame', { rawMapCoordinate: translatedFrame, submitted: display,
      rawToRenderedM: navDiag.distance(translatedFrame, this.blueDotService?.coordinate ?? display), renderer: this.blueDotService?.getLocationDiagnosticSnapshot?.(), navigationEligible: true });
    this.reportBlueDotAvailability(this.blueDotService ? 'accepted-position-sent-to-renderer' : 'map-renderer-unavailable');
    const tracking =
      this.liveRouteTracking ||
      this.store.get().routeSimulating ||
      this.store.get().routeSimulationComplete;
    if (tracking) {
      this.routePlanner?.updateTravelledPath({
        latitude: display.latitude,
        longitude: display.longitude,
        floorId: display.floorId ?? "unknown",
      });
    }

    if (
      isArFrameVisible() ||
      isArSessionActive(this.store.get().arPresentation)
    ) {
      const now = performance.now();
      if (now - this.lastArProviderStreamAt >= 90) {
        this.lastArProviderStreamAt = now;
        if (this.liveRouteTracking || this.store.get().routeSimulating) {
          syncNavigationToAr(this.getNavigationProgressSnapshot());
        } else {
          dispatchPositionToAr(display);
        }
      }
    }
  }

  private handleBlueDotStatus(status: BlueDotStatus): void {
    this.reportBlueDotAvailability(`renderer-${status}`);
    if (this.positionProvider?.isRunning) return;
    this.store.patch({
      blueDotStatus: status,
      blueDotFollowing: this.blueDotService?.isFollowing ?? false,
    });
  }

  private reportBlueDotAvailability(reason: string, detail: Record<string, unknown> = {}): void {
    const state = this.store.get();
    const data = { reason, mapStatus: state.mapStatus, permission: state.locationPermission,
      simulation: !!this.venueGpsReference, providerRunning: this.positionProvider?.isRunning ?? false,
      providerSignalStatus: this.positionProvider?.signalStatus ?? null, positioningStatus: state.blueDotStatus,
      floorId: state.currentFloorId, marker: this.blueDotService?.getLocationDiagnosticSnapshot?.() ?? null,
      providerRunningMeaning: 'subscription exists; signal/fix quality is reported separately', ...detail };
    recordLocationDiagnostic('blue-dot-availability', data);
    navDiag?.update('blue-dot-availability', 'MapApp', data);
    if (this.lastBlueDotAvailabilityReason !== reason) {
      this.lastBlueDotAvailabilityReason = reason;
      appLog('BlueDot', reason, data);
    }
  }

  private async maybeAutoStartBlueDot(): Promise<void> {
    const service = this.blueDotService;
    if (!service || !this.mapView) { this.reportBlueDotAvailability('map-not-ready'); return; }
    if (this.store.get().locationPermission !== 'granted') {
      this.reportBlueDotAvailability('location-permission-not-granted'); return;
    }
    if (this.positionProvider?.isRunning) return;
    const generation = this.mapLoadGeneration;
    // A successful location request is sufficient on Safari versions without a
    // Permissions API. An explicit denied/prompt result still requires user action.
    try {
      if (navigator.permissions?.query) {
        const status = await navigator.permissions.query({ name: 'geolocation' });
        if (service !== this.blueDotService || generation !== this.mapLoadGeneration) return;
        if (status.state !== 'granted') {
          this.reportBlueDotAvailability(`browser-geolocation-${status.state}`); return;
        }
      }
    } catch {
      this.reportBlueDotAvailability('permission-query-unavailable-using-existing-grant');
    }
    // A cached/local venue can replace the map or start navigation while the
    // asynchronous permission query is pending. Never start the old authority.
    if (service !== this.blueDotService || generation !== this.mapLoadGeneration ||
        this.store.get().locationPermission !== 'granted' || this.positionProvider?.isRunning) return;
    try {
      if (this.venueGpsReference) {
        // Keep actual GPS flowing even before the explicit map anchor exists.
        // handleProviderFrame withholds display until translation is possible.
        this.startPositionProvider(this.store.get().route?.pathCoordinates ?? []);
        this.reportBlueDotAvailability('waiting-for-translated-gps-fix');
      } else {
        await service.startTracking();
        if (service !== this.blueDotService || generation !== this.mapLoadGeneration || this.positionProvider?.isRunning) return;
        this.reportBlueDotAvailability('waiting-for-device-position');
      }
    } catch (error) {
      if (service !== this.blueDotService) return;
      this.reportBlueDotAvailability('positioning-start-failed');
      appWarn('BlueDot', 'Could not start positioning', error);
    }
  }

  private maybePromptLocation(): void {
    // Location is requested explicitly during the post-auth location gate.
    if (!this.store.get().onboardingComplete) return;
    if (this.locationPromptShown || !navigator.geolocation) return;
    if (permissionChoiceLocalDatasource.loadLocation() === "denied") return;
    this.locationPromptShown = true;
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((status) => {
          if (status.state === "prompt") {
            this.showToast("Tap ⊕ for live blue-dot tracking and routing.");
          }
        })
        .catch(() => undefined);
    }
  }

  private async ensureLocationEnabledForAction(): Promise<boolean> {
    const state = this.store.get();
    if (state.locationPermission === "granted") return true;
    if (isLocationGateAuthStep(state.authStep)) return false;

    await this.showLocationGateForRequiredAction();
    return false;
  }

  private async showLocationGateForRequiredAction(error?: unknown): Promise<void> {
    const state = this.store.get();
    if (isLocationGateAuthStep(state.authStep)) return;

    const underlyingStep = state.authStep;
    const deniedError =
      this.locationService?.isPermissionDeniedError(error) ?? false;
    const permanentlyDenied =
      deniedError || !error
        ? (await this.locationService?.isPermanentlyDenied()) === true
        : false;

    if (deniedError) {
      this.persistLocationChoice("denied");
    }

    if (error && !deniedError) {
      const message =
        error instanceof GeolocationPositionError || error instanceof Error
          ? (this.locationService?.geolocationErrorMessage(
              error as GeolocationPositionError | Error,
            ) ?? "Could not get your location.")
          : "Could not get your location.";
      this.store.patch({
        authStep: "location-error",
        authStepBeforeLocation: underlyingStep,
        locationGateLoading: false,
        locationPermanentlyDenied: false,
        locationGateError: message,
      });
      return;
    }

    this.store.patch({
      authStep: permanentlyDenied ? "location-required" : "location-permission",
      authStepBeforeLocation: underlyingStep,
      locationGateLoading: false,
      locationPermanentlyDenied: permanentlyDenied,
      locationGateError: null,
    });
  }

  /** Leave location optional and invalidate any pending permission/GPS result. */
  async dismissLocationGate(): Promise<void> {
    const state = this.store.get();
    if (!isLocationGateAuthStep(state.authStep)) return;
    recordLocationDiagnostic('dialog-dismissed');
    this.locationGateRequestId += 1;
    this.store.patch({
      authStep: state.authStepBeforeLocation ?? "none",
      authStepBeforeLocation: null,
      locationGateLoading: false,
      locationGateError: null,
      locationPermanentlyDenied: false,
      authLoading: false,
      guestContinueLoading: false,
    });
    if (!state.onboardingComplete) {
      await this.continueAfterLocationGranted();
    }
  }

  /**
   * Enable Location CTA - request permission via Geolocation API, then read coords.
   */
  async enableLocationPermission(): Promise<void> {
    appLog("LocationGate", "enableLocationPermission invoked");
    await this.runLocationGateRequest({
      fromPermissionRequired: false,
      forceRequestWhenDenied: true,
    });
  }

  /** Try Again on Location Permission Required. */
  async retryLocationPermission(): Promise<void> {
    appLog("LocationGate", "retryLocationPermission invoked");
    await this.runLocationGateRequest({
      fromPermissionRequired: true,
      forceRequestWhenDenied: true,
    });
  }

  /** Retry on Location Error - permission already granted; re-read position. */
  async retryLocationRetrieval(): Promise<void> {
    appLog("LocationGate", "retryLocationRetrieval invoked");
    await this.runLocationGateRequest({
      fromPermissionRequired: false,
      forceRequestWhenDenied: true,
    });
  }

  private async runLocationGateRequest(options: {
    fromPermissionRequired: boolean;
    silent?: boolean;
    forceRequestWhenDenied?: boolean;
  }): Promise<void> {
    if (this.store.get().locationGateLoading) {
      appLog("LocationGate", "request ignored because gate is already loading");
      return;
    }

    const requestId = ++this.locationGateRequestId;
    recordLocationDiagnostic('gate-attempt', { requestId, ...options });
    const isCurrent = () => requestId === this.locationGateRequestId;
    const silent = Boolean(options.silent);
    const gateStartState = this.store.get();
    const currentStep = gateStartState.authStep;
    const returnToApp =
      gateStartState.onboardingComplete &&
      isLocationGateAuthStep(gateStartState.authStep);
    const returnStep = gateStartState.authStepBeforeLocation ?? "none";
    appLog("LocationGate", "request started", {
      options,
      currentStep,
      returnToApp,
      returnStep,
      onboardingComplete: gateStartState.onboardingComplete,
      storedLocationPermission: gateStartState.locationPermission,
      hasUserLocation: Boolean(gateStartState.userLocation),
      protocol:
        typeof window !== "undefined" ? window.location.protocol : undefined,
      host: typeof window !== "undefined" ? window.location.host : undefined,
      secureContext:
        typeof window !== "undefined" ? window.isSecureContext : undefined,
    });
    if (!silent) {
      // Show progress immediately and keep the underlying auth screen frozen
      // (authStepBeforeLocation) before any async permission / GPS work.
      this.store.patch({
        authStep: options.fromPermissionRequired
          ? "location-required"
          : currentStep === "location-error"
            ? "location-error"
            : "location-permission",
        locationGateLoading: true,
        locationPermanentlyDenied: false,
        locationGateError: null,
      });
    } else {
      this.store.patch({ locationGateLoading: true });
    }

    try {
      // Explicit button taps must reach getCurrentPosition before any await.
      // Permission queries are diagnostic/preflight only for automatic requests.
      if (!options.forceRequestWhenDenied) {
        const permission = await this.locationService.queryPermission();
        if (!isCurrent()) return;
        const preflight = resolveLocationGatePreflight(permission);
        appLog("LocationGate", "permission preflight resolved", {
          permission,
          preflight,
          forceRequestWhenDenied: Boolean(options.forceRequestWhenDenied),
        });

        if (preflight.action === "error-unsupported") {
          appWarn("LocationGate", "geolocation unsupported during preflight");
          if (silent) {
            this.store.patch({ locationGateLoading: false });
            await this.continueAfterLocationGranted();
            return;
          }
          if (returnToApp) {
            this.store.patch({
              authStep: "location-error",
              locationGateLoading: false,
              locationGateError:
                "Geolocation is not supported in this browser. Try another browser or device.",
            });
            return;
          }
          this.store.patch({
            authStep: "location-error",
            locationGateLoading: false,
            locationGateError:
              "Geolocation is not supported in this browser. Try another browser or device.",
          });
          return;
        }

        if (
          preflight.action === "required-permanent" &&
          !options.forceRequestWhenDenied
        ) {
          appLog("LocationGate", "preflight denied; not forcing browser request");
          this.persistLocationChoice("denied");
          if (silent) {
            this.store.patch({ locationGateLoading: false });
            await this.continueAfterLocationGranted();
            return;
          }
          if (returnToApp) {
            this.store.patch({
              authStep: "location-required",
              locationPermanentlyDenied: true,
              locationGateLoading: false,
              locationGateError: null,
            });
            return;
          }
          this.store.patch({
            authStep: "location-required",
            locationPermanentlyDenied: true,
            locationGateLoading: false,
            locationGateError: null,
          });
          return;
        }

      } else {
        recordLocationDiagnostic('direct-location-request', { source: 'location-button' });
      }

      appLog("LocationGate", "calling requestLocation");
      const coords = await this.locationService.requestLocation();
      if (!isCurrent()) return;
      appLog("LocationGate", "requestLocation succeeded", coords);
      this.persistLocationChoice("granted");
      // Keep the dialog + underlying screen until continueAfterLocationGranted
      // swaps authStep in one patch (avoids flashing Find places behind).
      this.store.patch({
        userLocation: coords,
        locationGateError: null,
        locationPermanentlyDenied: false,
      });
      if (returnToApp) {
        appLog("LocationGate", "location granted; returning to app", {
          returnStep,
        });
        this.store.patch({
          authStep: returnStep,
          authStepBeforeLocation: null,
          locationGateLoading: false,
        });
        void this.maybeAutoStartBlueDot();
        return;
      }
      appLog("LocationGate", "location granted; continuing onboarding");
      await this.continueAfterLocationGranted();
      void this.maybeAutoStartBlueDot();
    } catch (error) {
      if (!isCurrent()) return;
      appWarn("LocationGate", "request failed", error);
      const permanentlyDenied = this.locationService.isPermissionDeniedError(
        error,
      )
        ? await this.locationService.isPermanentlyDenied()
        : false;
      if (!isCurrent()) return;
      appLog("LocationGate", "failure classification", {
        isPermissionDenied: this.locationService.isPermissionDeniedError(error),
        permanentlyDenied,
      });
      const failure = resolveLocationGateFailure(
        error,
        permanentlyDenied,
        (err) =>
          err instanceof Error ||
          (typeof err === "object" &&
            err !== null &&
            "code" in err &&
            typeof (err as GeolocationPositionError).code === "number")
            ? this.locationService.geolocationErrorMessage(
                err as GeolocationPositionError | Error,
              )
            : "Could not get your location.",
      );

      if (failure.action === "required") {
        appLog("LocationGate", "routing to location-required", failure);
        this.persistLocationChoice("denied");
        this.store.patch({ locationGateLoading: false });
        if (returnToApp) {
          this.store.patch({
            authStep: "location-required",
            locationPermanentlyDenied: failure.permanentlyDenied,
            locationGateError: null,
          });
          return;
        }
        if (silent || !options.fromPermissionRequired) {
          appLog("LocationGate", "permission denied from non-required/silent path; continuing without location");
          this.showToast(
            "Location is off. Tap ⊕ anytime if you want to turn it on.",
          );
          await this.continueAfterLocationGranted();
          return;
        }
        this.store.patch({
          authStep: "location-required",
          locationPermanentlyDenied: failure.permanentlyDenied,
          locationGateError: null,
        });
        return;
      }

      if (silent) {
        appLog("LocationGate", "silent location request failed; continuing without location", failure);
        this.store.patch({ locationGateLoading: false });
        await this.continueAfterLocationGranted();
        return;
      }

      appLog("LocationGate", "routing to location-error", failure);
      this.store.patch({
        authStep: "location-error",
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

function notificationItemToDomain(item: NotificationItem): AppNotification {
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
