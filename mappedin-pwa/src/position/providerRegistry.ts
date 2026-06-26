import type { PositionSourceType } from './types';
import { HighFrequencyMockProvider } from './providers/mockProvider';
import { GpsPositionProvider } from './providers/gpsProvider';
import { AppleIndoorProvider } from './providers/appleProvider';
import { IndoorAtlasProvider } from './providers/indoorAtlasProvider';
import { BleBeaconProvider } from './providers/bleBeaconProvider';
import type { PositionProvider } from './positionProvider';

export class PositionProviderRegistry {
  static getProvider(sourceType: PositionSourceType): PositionProvider {
    switch (sourceType) {
      case 'simulator':
        return new HighFrequencyMockProvider();
      case 'gps':
        return new GpsPositionProvider();
      case 'apple_indoor':
        return new AppleIndoorProvider();
      case 'indoor_atlas':
        return new IndoorAtlasProvider();
      case 'ble_beacon':
        return new BleBeaconProvider();
      default:
        return new HighFrequencyMockProvider();
    }
  }

  static resolveActiveSource(): PositionSourceType {
    const raw = import.meta.env.VITE_POSITION_SOURCE as PositionSourceType | undefined;
    if (
      raw === 'simulator' ||
      raw === 'gps' ||
      raw === 'apple_indoor' ||
      raw === 'indoor_atlas' ||
      raw === 'ble_beacon'
    ) {
      return raw;
    }
    return 'simulator';
  }
}
