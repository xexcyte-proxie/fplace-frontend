import type { FplacesPositionFrame } from '../types';
import { GpsPositionProvider } from './gpsProvider';

export class AppleIndoorProvider extends GpsPositionProvider {
  // Legacy configuration alias: the browser does not expose an Apple indoor SDK.
  readonly source: FplacesPositionFrame['source'] = 'gps';
}
