import type { PositionSourceType } from './types';
import { GpsPositionProvider } from './providers/gpsProvider';
import { AppleIndoorProvider } from './providers/appleProvider';
import { IndoorAtlasProvider } from './providers/indoorAtlasProvider';
import { BleBeaconProvider } from './providers/bleBeaconProvider';
import type { PositionProvider } from './positionProvider';
import beaconMatrixData from './config/beacon-venue-matrix.json';
import { appConfig } from '../config';

const LIVE_HARDWARE_SOURCES: readonly PositionSourceType[] = [
  'gps',
  'apple_indoor',
  'indoor_atlas',
  'ble_beacon',
] as const;

function venueHasBeaconMatrix(): boolean {
  const raw = beaconMatrixData as { venueMapId?: string; beacons?: unknown[] };
  return (
    raw.venueMapId === appConfig.mappedin.mapId &&
    Array.isArray(raw.beacons) &&
    raw.beacons.length > 0
  );
}

function webBluetoothAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

/** Apple devices where Core Location / indoor positioning is available to the browser. */
function appleIndoorLikelyAvailable(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  // iPadOS 13+ may report as MacIntel with touch
  if (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1) {
    return true;
  }
  return false;
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

  /** True for real IPS / device sources (GPS, Apple Indoor, Indoor Atlas, BLE beacons). */
  static isLiveHardwareSource(source: string): source is PositionSourceType {
    return (LIVE_HARDWARE_SOURCES as readonly string[]).includes(source);
  }

  /**
   * Live indoor positioning source.
   * Auto-picks the best available hardware — you do not need to change env for normal use.
   * Optional override: set VITE_POSITION_SOURCE to a live source (gps | apple_indoor |
   * indoor_atlas | ble_beacon) to force one stack.
   *
   * Priority when unset:
   * 1. Indoor Atlas (API key present)
   * 2. BLE beacons (Web Bluetooth + venue beacon matrix)
   * 3. Apple Indoor (iPhone / iPad)
   * 4. GPS (always-available live fallback; still projected onto the route)
   */
  static resolveLiveHardwareSource(): PositionSourceType {
    const env = envLiveSource();
    if (env) return env;

    if (import.meta.env.VITE_INDOOR_ATLAS_API_KEY) {
      return 'indoor_atlas';
    }
    if (webBluetoothAvailable() && venueHasBeaconMatrix()) {
      return 'ble_beacon';
    }
    if (appleIndoorLikelyAvailable()) {
      return 'apple_indoor';
    }
    return 'gps';
  }

  /** Runtime source for route navigation — live IPS only. */
  static resolveNavigationSource(): PositionSourceType {
    return PositionProviderRegistry.resolveLiveHardwareSource();
  }

  static resolveActiveSource(): PositionSourceType {
    return PositionProviderRegistry.resolveLiveHardwareSource();
  }
}
