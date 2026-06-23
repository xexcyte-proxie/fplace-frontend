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
}

export interface AppState {
  mapStatus: MapStatus;
  mapError?: string;
  loadingMessage: string;
  floors: FloorInfo[];
  currentFloorId?: string;
  searchQuery: string;
  searchResults: LocationResult[];
  isSearching: boolean;
  markers: RouteMarkers;
  isCalculatingRoute: boolean;
  showRouteSheet: boolean;
  route: RoutePayload | null;
  currentLegIndex: number;
  routeInstructions: string;
  isArOpen: boolean;
  toast?: string;
}

export const initialAppState = (): AppState => ({
  mapStatus: 'initial',
  loadingMessage: 'Loading map SDK…',
  floors: [],
  searchQuery: '',
  searchResults: [],
  isSearching: false,
  markers: {},
  isCalculatingRoute: false,
  showRouteSheet: false,
  route: null,
  currentLegIndex: 0,
  routeInstructions: '',
  isArOpen: false,
});
