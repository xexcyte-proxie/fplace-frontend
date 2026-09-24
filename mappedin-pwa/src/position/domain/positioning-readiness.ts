import type { PositionSourceType } from '../types';

export type PositioningReadiness = {
  roomLevelCapable: boolean;
  message: string;
};

/**
 * Browser GPS is a safe fallback, but it is not evidence of room-level indoor
 * positioning. Keep that distinction explicit in release diagnostics.
 */
export function positioningReadiness(
  source: PositionSourceType,
): PositioningReadiness {
  if (source === 'indoor_atlas') {
    return {
      roomLevelCapable: true,
      message: 'IndoorAtlas selected; verify the venue survey and floor map on-site.',
    };
  }
  if (source === 'ble_beacon') {
    return {
      roomLevelCapable: true,
      message: 'BLE positioning selected; verify installed beacons on-site.',
    };
  }
  return {
    roomLevelCapable: false,
    message: 'Browser GPS fallback is active; room-level indoor accuracy is unavailable.',
  };
}
