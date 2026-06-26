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

export interface RouteCoordinate {
  latitude: number;
  longitude: number;
  floorId?: string;
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
  index: number;
  steps: RouteStep[];
}

export interface RoutePayload {
  legs: RouteLeg[];
  destinationName?: string;
  pathCoordinates: RouteCoordinate[];
  maneuvers: RouteStep[];
  origin?: RouteCoordinate | null;
  destination?: RouteCoordinate | null;
  distanceMeters?: number | null;
  durationSeconds?: number | null;
  mapId?: string;
}

export interface RouteMarkers {
  origin?: RouteCoordinate | null;
  destination?: RouteCoordinate | null;
  destinationLabel?: string;
  destinationFloorName?: string;
  destinationAreaHint?: string;
}

export type BlueDotStatus = 'off' | 'starting' | 'active' | 'inactive' | 'error';

export type AppTab = 'map' | 'social';

export type SocialCategory = 'all' | 'lines' | 'food' | 'vibe';

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

export function isOnboardingComplete(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_COMPLETE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markOnboardingComplete(): void {
  try {
    localStorage.setItem(ONBOARDING_COMPLETE_KEY, '1');
  } catch {
    /* storage unavailable */
  }
}

export interface AppState {
  onboardingComplete: boolean;
  mapStatus: MapStatus;
  mapError?: string;
  loadingMessage: string;
  loadingProgress: number;
  blueDotStatus: BlueDotStatus;
  blueDotFollowing: boolean;
  routeSimulating: boolean;
  routeSimulationComplete: boolean;
  routeTraveledMeters: number;
  routeRemainingMeters: number | null;
  floors: FloorInfo[];
  currentFloorId?: string;
  searchQuery: string;
  searchResults: LocationResult[];
  isSearching: boolean;
  categoryFilter: string | null;
  markers: RouteMarkers;
  isCalculatingRoute: boolean;
  showRouteSheet: boolean;
  route: RoutePayload | null;
  currentLegIndex: number;
  routeInstructions: string;
  isArOpen: boolean;
  toast?: string;
  activeTab: AppTab;
  socialCategory: SocialCategory;
  socialLocation: string | null;
  socialTag: string | null;
  socialDraft: string;
  socialPosts: SocialPost[];
  upvotedPostIds: string[];
}

export const initialAppState = (): AppState => ({
  onboardingComplete: isOnboardingComplete(),
  mapStatus: 'initial',
  loadingMessage: 'Loading map SDK…',
  loadingProgress: 12,
  blueDotStatus: 'off',
  blueDotFollowing: false,
  routeSimulating: false,
  routeSimulationComplete: false,
  routeTraveledMeters: 0,
  routeRemainingMeters: null,
  floors: [],
  searchQuery: '',
  searchResults: [],
  isSearching: false,
  categoryFilter: null,
  markers: {},
  isCalculatingRoute: false,
  showRouteSheet: false,
  route: null,
  currentLegIndex: 0,
  routeInstructions: '',
  isArOpen: false,
  activeTab: 'map',
  socialCategory: 'all',
  socialLocation: null,
  socialTag: null,
  socialDraft: '',
  socialPosts: [],
  upvotedPostIds: ['post-1'],
});
