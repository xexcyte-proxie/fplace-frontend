import type { FplacesPositionFrame } from '../types';
import { GpsPositionProvider } from './gpsProvider';

export class AppleIndoorProvider extends GpsPositionProvider {
  readonly source: FplacesPositionFrame['source'] = 'apple_indoor';
}
