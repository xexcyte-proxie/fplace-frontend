import type { PositionSourceType } from './types';
import { GpsPositionProvider } from './providers/gpsProvider';
import { AppleIndoorProvider } from './providers/appleProvider';
import { IndoorAtlasProvider } from './providers/indoorAtlasProvider';
import { BleBeaconProvider } from './providers/bleBeaconProvider';
import type { PositionProvider } from './positionProvider';
import beaconMatrixData from './config/beacon-venue-matrix.json';

const LIVE_HARDWARE_SOURCES: readonly PositionSourceType[] = [
  'gps',
  'apple_indoor',
  'indoor_atlas',
  'ble_beacon',
] as const;

function venueHasBeaconMatrix(venueMapId?: string): boolean {
  const raw = beaconMatrixData as { venueMapId?: string; beacons?: unknown[] };
  return (
    raw.venueMapId === venueMapId &&
    Array.isArray(raw.beacons) &&
    raw.beacons.length > 0
  );
}

function webBluetoothAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

function envLiveSource(): PositionSourceType | null {
  const raw = import.meta.env.VITE_POSITION_SOURCE as PositionSourceType | undefined;
  if (PositionProviderRegistry.isLiveHardwareSource(raw ?? '')) {
    return raw as PositionSourceType;
  }
  return null;
}

export class PositionProviderRegistry {
  static getProvider(sourceType: PositionSourceType): PositionProvider {
    switch (sourceType) {
      case 'apple_indoor':
        return new AppleIndoorProvider();
      case 'indoor_atlas':
        return new IndoorAtlasProvider();
      case 'ble_beacon':
        return new BleBeaconProvider();
      case 'gps':
      default:
        return new GpsPositionProvider();
    }
  }

  /** Supported source selectors; apple_indoor is a legacy browser-GPS alias. */
  static isLiveHardwareSource(source: string): source is PositionSourceType {
    return (LIVE_HARDWARE_SOURCES as readonly string[]).includes(source);
  }

  /**
   * Live indoor positioning source.
   * Selects a configured source; providers fall back to browser GPS when unavailable.
   * Optional override: set VITE_POSITION_SOURCE to a live source (gps | apple_indoor |
   * indoor_atlas | ble_beacon) to force one stack.
   *
   * Priority when unset:
   * 1. Indoor Atlas (API key present)
   * 2. BLE beacons (Web Bluetooth + venue beacon matrix)
   * 3. Browser geolocation (including iPhone / iPad).
   */
  static resolveLiveHardwareSource(venueMapId?: string): PositionSourceType {
    const env = envLiveSource();
    if (env) return env;

    if (import.meta.env.VITE_INDOOR_ATLAS_API_KEY) {
      return 'indoor_atlas';
    }
    if (webBluetoothAvailable() && venueHasBeaconMatrix(venueMapId)) {
      return 'ble_beacon';
    }
    return 'gps';
  }

  /** Runtime source for route navigation: live IPS only. */
  static resolveNavigationSource(venueMapId?: string): PositionSourceType {
    return PositionProviderRegistry.resolveLiveHardwareSource(venueMapId);
  }

  static resolveActiveSource(): PositionSourceType {
    return PositionProviderRegistry.resolveLiveHardwareSource();
  }
}
