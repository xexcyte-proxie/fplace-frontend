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
}
