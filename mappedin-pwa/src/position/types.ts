export type PositionSourceType =
  | 'physical-gps-transformed'
  | 'simulator'
  | 'gps'
  | 'apple_indoor'
  | 'indoor_atlas'
  | 'ble_beacon';

export interface FplacesPositionFrame {
  latitude: number;
  longitude: number;
  /** Omitted until compass or GPS course is known: 0 is a real north heading. */
  heading?: number;
  accuracy: number;
  source: PositionSourceType;
  floorId?: string;
  timestamp?: number;
  /** Meters along the active route polyline (matches 2D map progress). */
  alongPathMeters?: number;
  /** Geometric distance from the raw fix to the snapped route point (live ETA). */
  offRouteMeters?: number;
}

/** Who owns the navigation clock for the AR child. */
export type NavigationAuthority = 'parent-simulator' | 'local';

/**
 * Shared navigation progress for 2D ↔ AR handoff and live sync.
 * Live GPS/IPS streams `alongPathMeters`; AR derives maneuver index and arrival
 * from that clock.
 */
export interface NavigationProgressSnapshot {
  alongPathMeters: number;
  routeTraveledMeters: number;
  routeRemainingMeters: number | null;
  routeSimulating: boolean;
  routeSimulationComplete: boolean;
  latitude?: number;
  longitude?: number;
  heading?: number;
  floorId?: string;
  /** Position provider, or `pwa` when the snapped 2D map is AR’s authority. */
  source?: FplacesPositionFrame['source'] | 'pwa';
  /** When `parent-simulator`, AR must not advance maneuvers autonomously. */
  navigationAuthority?: NavigationAuthority;
}
