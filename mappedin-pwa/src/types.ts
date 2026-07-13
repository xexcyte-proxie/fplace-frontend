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

export type ProfileView = 'main' | 'settings';

export type AuthStep = 'none' | 'create' | 'check-email' | 'verify';

export interface RegisteredUser {
  id: number;
  email: string;
  pseudo_name: string | null;
  is_email_verified: boolean;
  created_at: string;
  updated_at: string;
}

export type SocialCategory = 'all' | 'lines' | 'food' | 'vibe';

export type VenueFeedFilter = 'all' | 'hype' | 'help' | 'food';

export type VenueFeedType = Exclude<VenueFeedFilter, 'all'>;

export interface VenueFeedPost {
  id: string;
  author: string;
  initials: string;
  avatarColor: string;
  location: string;
  locationId: string;
  timeAgo: string;
  feedType: VenueFeedType;
  content: string;
  upvotes: number;
  comments: number;
  helpCard?: boolean;
}

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

const ONBOARDING_COMPLETE_KEY = 'fplaces_onboarding_complete';

/** Session-only flag; onboarding/auth flow always runs on each app open. */
export function isOnboardingComplete(): boolean {
  return false;
}

export function markOnboardingComplete(): void {
  try {
    localStorage.removeItem(ONBOARDING_COMPLETE_KEY);
  } catch {
    /* storage unavailable */
  }
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

export interface AppState {
  onboardingComplete: boolean;
  authStep: AuthStep;
  authEmail: string;
  authLoading: boolean;
  authFieldErrors: Record<string, string>;
  authUser: RegisteredUser | null;
  mapStatus: MapStatus;
  mapError?: string;
  loadingMessage: string;
  loadingProgress: number;
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
  toast?: string;
  activeTab: AppTab;
  profileView: ProfileView;
  notificationsEnabled: boolean;
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
  onboardingComplete: isOnboardingComplete(),
  authStep: 'none',
  authEmail: '',
  authLoading: false,
  authFieldErrors: {},
  authUser: loadStoredUser(),
  mapStatus: 'initial',
  loadingMessage: 'Loading map SDK…',
  loadingProgress: 12,
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
  activeTab: 'map',
  profileView: 'main',
  notificationsEnabled: true,
  socialCategory: 'all',
  socialLocation: null,
  socialTag: null,
  socialDraft: '',
  socialPosts: [],
  venueFeedFilter: 'all',
  venueFeedDraft: '',
  venueFeedPosts: [],
  upvotedPostIds: ['venue-post-1'],
  locationActionPrompt: null,
});
