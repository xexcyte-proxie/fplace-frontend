export type PositionSourceType =
  | 'simulator'
  | 'gps'
  | 'apple_indoor'
  | 'indoor_atlas'
  | 'ble_beacon';

export interface FplacesPositionFrame {
  latitude: number;
  longitude: number;
  heading: number;
  accuracy: number;
  source: PositionSourceType;
  floorId?: string;
  timestamp?: number;
  /** Meters along the active route polyline (simulator — matches 2D map progress). */
  alongPathMeters?: number;
  /** Geometric distance from the raw fix to the snapped route point (live ETA). */
  offRouteMeters?: number;
}

/** Who owns the navigation clock for the AR child. */
export type NavigationAuthority = 'parent-simulator' | 'local';

/**
 * Shared navigation progress for 2D ↔ AR handoff and live sync.
 * Phase 1: parent simulator streams `alongPathMeters` at 10 Hz; AR derives
 * maneuver index and arrival deterministically from that clock.
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
  source?: FplacesPositionFrame['source'];
  /** When `parent-simulator`, AR must not advance maneuvers autonomously. */
  navigationAuthority?: NavigationAuthority;
}
