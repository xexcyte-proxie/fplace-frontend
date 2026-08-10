import type {
  HomeExperience,
  ReturningHomeContent,
} from './home/domain/entities';

export type MapStatus = 'initial' | 'loading' | 'ready' | 'error';

export interface FloorInfo {
  id: string;
  name: string;
  sortOrder: number;
}

export interface LocationResult {
  id: string;
  name: string;
  floorId?: string;
  floorName?: string;
  latitude?: number;
  longitude?: number;
}

export interface SearchChip {
  id: string;
  label: string;
  color: string;
}

export interface RouteCoordinate {
  latitude: number;
  longitude: number;
  /** Always populated on route pathCoordinates after buildRoutePayload. */
  floorId: string;
  legId?: string;
  segmentIndex?: number;
  distanceAlongRoute?: number;
}

export type TransitionKind =
  | 'stairs'
  | 'elevator'
  | 'escalator'
  | 'ramp'
  | 'doorway'
  | 'floor_connector'
  | 'connection'
  | 'unknown';

export interface TransitionMetadata {
  kind: TransitionKind;
  instruction?: string;
  fromFloorId: string;
  toFloorId: string;
  pathIndex?: number;
}

export interface FloorTransition {
  pathIndex: number;
  fromFloorId: string;
  toFloorId: string;
  kind: 'elevator' | 'stairs' | 'escalator' | 'ramp' | 'doorway' | 'connection' | 'unknown';
  instruction?: string;
}

export type RouteLifecycleState =
  | 'generating'
  | 'generated'
  | 'ready'
  | 'sentToAR'
  | 'accepted'
  | 'navigating'
  | 'paused'
  | 'recalculating'
  | 'completed'
  | 'cancelled'
  | 'expired';

export interface RouteLifecycleMetadata {
  state: RouteLifecycleState;
  stateChangedAt: number;
  previousState?: RouteLifecycleState;
}

export interface RouteStep {
  instruction: string;
  actionType?: string;
  bearing?: string;
  distanceMeters?: number;
  legIndex?: number;
  stepIndex?: number;
  headingDegrees?: number;
}

export interface RouteLeg {
  legId: string;
  index: number;
  floorId: string;
  startIndex: number;
  endIndex: number;
  steps: RouteStep[];
  distanceMeters: number;
  durationSeconds: number | null;
  transitionType: TransitionKind | 'walk' | null;
  transitionMetadata: TransitionMetadata | null;
}

export interface RoutePayload {
  legs: RouteLeg[];
  destinationName?: string;
  destinationFloorName?: string;
  destinationAreaHint?: string;
  pathCoordinates: RouteCoordinate[];
  maneuvers: RouteStep[];
  origin?: RouteCoordinate | null;
  destination?: RouteCoordinate | null;
  distanceMeters?: number | null;
  durationSeconds?: number | null;
  mapId?: string;
  routeId: string;
  routeVersion: number;
  generatedAt: number;
  updatedAt: number;
  geometryHash: string;
  checksum: string;
  mapVersion: string;
  venueId: string;
  routingEngineVersion: string;
  floorTransitions?: FloorTransition[];
  lifecycle: RouteLifecycleMetadata;
  navigationMode?: 'walk' | 'accessible';
}

export interface RouteMarkers {
  origin?: RouteCoordinate | null;
  destination?: RouteCoordinate | null;
  destinationLabel?: string;
  destinationFloorName?: string;
  destinationAreaHint?: string;
}

export type BlueDotStatus = 'off' | 'starting' | 'active' | 'inactive' | 'error';

export type AppTab = 'map' | 'social' | 'profile';

/** Navigate tab: venue home dashboard vs indoor map. */
export type NavigateView = 'home' | 'map';

export type ProfileView =
  | 'main'
  | 'settings'
  | 'language'
  | 'edit-profile'
  | 'change-password'
  | 'about'
  | 'privacy';

/** Comment row on a venue-feed post thread. */
export interface PostCommentItem {
  id: number;
  postId: number;
  authorId: number;
  author: string;
  initials: string;
  avatarColor: string;
  content: string;
  timeAgo: string;
  createdAt: string;
}

/** Destructive confirm dialog shown over Settings. */
export type SettingsConfirm = null | 'logout' | 'delete-account';

/** In-app legal WebView bottom sheet (Terms). */
export type LegalWebViewDocument = 'terms';

/** Personal notification list row (mapped from domain for UI). */
export interface NotificationItem {
  id: number;
  title: string;
  body: string;
  isRead: boolean;
  notificationType: string;
  venueId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface MapLanguageOption {
  code: string;
  name: string;
}

export type AuthStep =
  | 'none'
  | 'ar-teaser'
  | 'introduction'
  | 'features'
  | 'create'
  | 'login'
  | 'forgot-password'
  | 'reset-password-confirm'
  | 'check-email'
  | 'verify'
  | 'pseudo-name'
  | 'venue-select'
  | 'location-permission'
  | 'location-required'
  | 'location-error';

/** GPS fix captured during the location permission gate. */
export interface UserLocationCoords {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

export interface RegisteredUser {
  id: number;
  email: string;
  pseudo_name: string | null;
  first_name?: string;
  last_name?: string;
  bio?: string;
  avatar_url?: string | null;
  user_type?: 'regular_user' | 'admin';
  is_email_verified: boolean;
  interests?: string[] | null;
  created_at: string;
  updated_at: string;
}

export type SocialCategory = 'all' | 'lines' | 'food' | 'vibe';

/** `'all'` or a forum category id string from GET /api/forum/categories/. */
export type VenueFeedFilter = 'all' | (string & {});

export interface VenueFeedPost {
  id: string;
  author: string;
  /** Forum user id — used for distinct “fans live”, not post volume. */
  authorId: number;
  initials: string;
  avatarColor: string;
  location: string;
  locationId: string;
  timeAgo: string;
  /** Category slug from the forum API (e.g. `fan-vibe`, `help`). */
  feedType: string;
  categoryId: string;
  content: string;
  upvotes: number;
  comments: number;
  helpCard?: boolean;
  hasUpvoted?: boolean;
}

export interface ForumVenueSummary {
  id: number;
  name: string;
  location: string;
}

export interface ForumSectionSummary {
  id: number;
  venue: number;
  name: string;
  code: string;
  is_active: boolean;
}

export interface ForumCategorySummary {
  id: number;
  name: string;
  slug: string;
  description: string;
  disclaimer: string;
  order: number;
  is_active: boolean;
}

export type SectionHeatPriority = 'high' | 'medium' | 'low';

/** Live section heatmap row from `section_heat_update`. */
export interface SectionHeatEntry {
  sectionId: number;
  postCount: number;
  priority: SectionHeatPriority;
}

/** Venue-room WebSocket lifecycle for live feed + heatmap. */
export type VenueLiveConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'auth_missing';

export interface SocialPost {
  id: string;
  author: string;
  initials: string;
  avatarColor: string;
  location: string;
  locationId: string;
  timeAgo: string;
  category: Exclude<SocialCategory, 'all'>;
  categoryLabel: string;
  content: string;
  upvotes: number;
  comments: number;
}

const AUTH_USER_KEY = 'fplaces_auth_user';

export function loadStoredUser(): RegisteredUser | null {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as RegisteredUser;
  } catch {
    return null;
  }
}

export function storeAuthUser(user: RegisteredUser): void {
  try {
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  } catch {
    /* storage unavailable */
  }
}

export function clearStoredAuthUser(): void {
  try {
    localStorage.removeItem(AUTH_USER_KEY);
  } catch {
    /* storage unavailable */
  }
}

export {
  DEFAULT_DISPLAY_NAME,
  resolveDisplayName,
  userNeedsPseudoName,
} from './auth/domain/entities';

export type AuthLegalDocument = 'terms' | 'privacy';

export interface AppState {
  onboardingComplete: boolean;
  authStep: AuthStep;
  /**
   * Auth screen kept underneath the location dialog (login, venue-select, etc.).
   * Null when the location gate is not open.
   */
  authStepBeforeLocation: AuthStep | null;
  /** Legal document overlay shown during the auth/onboarding flow. */
  authLegalDocument: AuthLegalDocument | null;
  /** In-app WebView bottom sheet for Terms (settings + auth). */
  legalWebView: LegalWebViewDocument | null;
  authEmail: string;
  /** uid from the password-reset email deep link. */
  passwordResetUid: string;
  /** token from the password-reset email deep link. */
  passwordResetToken: string;
  authLoading: boolean;
  authFieldErrors: Record<string, string>;
  authUser: RegisteredUser | null;
  /** FingerprintJS visitorId for the current browser (null until resolved). */
  visitorId: string | null;
  /** Mock/backend guest id when guest access is allowed. */
  guestId: string | null;
  /** False when guest fingerprint validation denies anonymous access. */
  guestAccessAllowed: boolean | null;
  /** Denial reason from guest fingerprint validation, when applicable. */
  guestAccessReason: string | null;
  pseudoNameDraft: string;
  /** Placeholder suggestion for the pseudo-name field (not the committed value). */
  pseudoNameHint: string;
  selectedInterests: string[];
  venueSearchQuery: string;
  selectedVenueId: string | null;
  /** Selected forum section id (entry zone within the venue). */
  selectedGateId: string | null;
  forumVenues: ForumVenueSummary[];
  forumSections: ForumSectionSummary[];
  forumCategories: ForumCategorySummary[];
  forumFeedNext: string | null;
  forumFeedCount: number;
  /** Live section heatmap from the venue WebSocket (`section_heat_update`). */
  sectionHeatmap: SectionHeatEntry[];
  /** True after the first `section_heat_update` (empty array ⇒ all sections neutral). */
  sectionHeatmapActive: boolean;
  /** Venue-room WebSocket lifecycle for live feed + heatmap. */
  venueLiveStatus: VenueLiveConnectionStatus;
  mapStatus: MapStatus;
  mapError?: string;
  loadingMessage: string;
  loadingProgress: number;
  /** Coordinates from the startup location gate (null until retrieved). */
  userLocation: UserLocationCoords | null;
  /** True while requesting permission or reading GPS during the location gate. */
  locationGateLoading: boolean;
  /** When true, location was permanently denied — show browser settings help. */
  locationPermanentlyDenied: boolean;
  /** User-facing message on the Location Error gate. */
  locationGateError: string | null;
  blueDotStatus: BlueDotStatus;
  blueDotFollowing: boolean;
  routeSimulating: boolean;
  routeSimulationComplete: boolean;
  routeNotFound: boolean;
  routeTraveledMeters: number;
  routeRemainingMeters: number | null;
  floors: FloorInfo[];
  currentFloorId?: string;
  searchQuery: string;
  searchResults: LocationResult[];
  isSearching: boolean;
  searchChips: SearchChip[];
  categoryFilter: string | null;
  markers: RouteMarkers;
  isCalculatingRoute: boolean;
  showRouteSheet: boolean;
  route: RoutePayload | null;
  currentLegIndex: number;
  routeInstructions: string;
  /** `closed` = no session; `minimized` = map visible + AR pip; `fullscreen` = AR covers map */
  arPresentation: ArPresentation;
  /**
   * After Try AR with no route — coach start/end selection on the map.
   */
  arRouteSetupActive: boolean;
  /**
   * Try AR dialog on the first-visit venue home (before leaving for the map).
   */
  arRoutePromptOpen: boolean;
  toast?: string;
  activeTab: AppTab;
  /** Navigate tab content: venue home vs indoor map. */
  navigateView: NavigateView;
  /**
   * First-time-at-venue dashboard vs returning (search / recently visited) home.
   */
  homeExperience: HomeExperience;
  /** Venue search on the returning-user home screen. */
  homeVenueSearchQuery: string;
  /** Cached returning-home content (recent venues + stats). */
  homeContent: ReturningHomeContent | null;
  profileView: ProfileView;
  settingsConfirm: SettingsConfirm;
  notificationsEnabled: boolean;
  /** Personal notifications inbox overlay (opened from the venue-feed bell). */
  notificationsOpen: boolean;
  notifications: NotificationItem[];
  notificationsUnreadCount: number;
  notificationsNext: string | null;
  notificationsLoading: boolean;
  notificationsMarkingAll: boolean;
  /** Opened notification detail (fetched via GET /api/notifications/{id}/). */
  notificationDetail: NotificationItem | null;
  notificationDetailLoading: boolean;
  notificationDetailError: string | null;
  /** Venue-feed post comments overlay. */
  postCommentsOpen: boolean;
  postCommentsPostId: string | null;
  postComments: PostCommentItem[];
  postCommentsDraft: string;
  postCommentsLoading: boolean;
  postCommentsSubmitting: boolean;
  postCommentsEditing: boolean;
  postCommentsError: string | null;
  /** Location/route simulation; on by default until the user turns it off. */
  simulationEnabled: boolean;
  /** Languages available from the Mappedin enterprise venue. */
  mapLanguages: MapLanguageOption[];
  /** Active Mappedin map language code (ISO 639-1). */
  mapLanguageCode: string | null;
  mapLanguageName: string | null;
  mapLanguageChanging: boolean;
  socialCategory: SocialCategory;
  socialLocation: string | null;
  socialTag: string | null;
  socialDraft: string;
  socialPosts: SocialPost[];
  venueFeedFilter: VenueFeedFilter;
  venueFeedDraft: string;
  venueFeedPosts: VenueFeedPost[];
  upvotedPostIds: string[];
  locationActionPrompt: LocationActionPrompt | null;
}

export type LocationActionPrompt = {
  locationId: string;
  name: string;
  anchor: unknown;
};

export type ArPresentation = 'closed' | 'fullscreen' | 'minimized';

export function isArSessionActive(presentation: ArPresentation): boolean {
  return presentation !== 'closed';
}

export const initialAppState = (): AppState => ({
  /** Resolved after session restore from profile + venue preference. */
  onboardingComplete: false,
  authStep: 'none',
  authStepBeforeLocation: null,
  passwordResetUid: '',
  passwordResetToken: '',
  authLegalDocument: null,
  legalWebView: null,
  authEmail: '',
  authLoading: false,
  authFieldErrors: {},
  authUser: loadStoredUser(),
  visitorId: null,
  guestId: null,
  guestAccessAllowed: null,
  guestAccessReason: null,
  pseudoNameDraft: '',
  pseudoNameHint: '',
  selectedInterests: [],
  venueSearchQuery: '',
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
  mapStatus: 'initial',
  loadingMessage: 'Loading map SDK…',
  loadingProgress: 12,
  userLocation: null,
  locationGateLoading: false,
  locationPermanentlyDenied: false,
  locationGateError: null,
  blueDotStatus: 'off',
  blueDotFollowing: false,
  routeSimulating: false,
  routeSimulationComplete: false,
  routeNotFound: false,
  routeTraveledMeters: 0,
  routeRemainingMeters: null,
  floors: [],
  searchQuery: '',
  searchResults: [],
  isSearching: false,
  searchChips: [],
  categoryFilter: null,
  markers: {},
  isCalculatingRoute: false,
  showRouteSheet: false,
  route: null,
  currentLegIndex: 0,
  routeInstructions: '',
  arPresentation: 'closed',
  arRouteSetupActive: false,
  arRoutePromptOpen: false,
  activeTab: 'map',
  navigateView: 'home',
  homeExperience: 'returning',
  homeVenueSearchQuery: '',
  homeContent: null,
  profileView: 'main',
  settingsConfirm: null,
  notificationsEnabled: true,
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
  simulationEnabled: true,
  mapLanguages: [],
  mapLanguageCode: null,
  mapLanguageName: null,
  mapLanguageChanging: false,
  socialCategory: 'all',
  socialLocation: null,
  socialTag: null,
  socialDraft: '',
  socialPosts: [],
  venueFeedFilter: 'all',
  venueFeedDraft: '',
  venueFeedPosts: [],
  upvotedPostIds: [],
  locationActionPrompt: null,
});
