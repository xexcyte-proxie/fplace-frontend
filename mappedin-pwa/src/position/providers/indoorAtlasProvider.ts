import type { FplacesPositionFrame } from '../types';
import { PositionProvider, type PositionProviderStartOptions } from '../positionProvider';
import { HighFrequencyMockProvider } from './mockProvider';
import { IndoorAtlasFloorFilter } from './indoorAtlasFloorFilter';
import {
  getIndoorAtlasSdk,
  initializeIndoorAtlas,
  type IndoorAtlasPosition,
} from './indoorAtlasSdk';
import { appLog, appWarn } from '../../utils/logger';
import { positionTelemetry } from '../debug/telemetryLogger';

export class IndoorAtlasProvider extends PositionProvider {
  readonly source: FplacesPositionFrame['source'] = 'indoor_atlas';

  private fallback: HighFrequencyMockProvider | null = null;
  private floorFilter: IndoorAtlasFloorFilter | null = null;
  private sdkWatchActive = false;
  private floorPlanWatchActive = false;

  protected onStart(options?: PositionProviderStartOptions): void {
    const apiKey = import.meta.env.VITE_INDOOR_ATLAS_API_KEY;
    if (!apiKey) {
      this.startFallback(options, 'missing_api_key');
      return;
    }

    void this.bootstrap(apiKey, options);
  }

  protected onStop(): void {
    const sdk = getIndoorAtlasSdk();
    if (this.sdkWatchActive) {
      sdk?.clearWatch?.();
      this.sdkWatchActive = false;
    }
    if (this.floorPlanWatchActive) {
      sdk?.clearFloorPlanWatch?.();
      this.floorPlanWatchActive = false;
    }

    this.fallback?.stop();
    this.fallback = null;
    this.floorFilter = null;
  }

  private startFallback(options?: PositionProviderStartOptions, reason?: string): void {
    if (reason) {
      appWarn('IndoorAtlas', `Falling back to simulator (${reason})`);
    }
    this.fallback = new HighFrequencyMockProvider();
    this.fallback.start((frame) => this.emit({ ...frame, source: 'indoor_atlas' }), options);
  }

  private async bootstrap(apiKey: string, options?: PositionProviderStartOptions): Promise<void> {
    try {
      const apiSecret = import.meta.env.VITE_INDOOR_ATLAS_API_SECRET;
      const sdk = await initializeIndoorAtlas(apiKey, apiSecret);

      this.floorFilter = new IndoorAtlasFloorFilter(options?.venueMapId);
      this.floorFilter.setExpectedFloorId(
        options?.expectedFloorId ?? options?.floorId ?? null,
      );

      sdk.watchPosition((position) => this.handleLocation(position));
      this.sdkWatchActive = true;

      if (typeof sdk.watchFloorPlan === 'function') {
        sdk.watchFloorPlan((floorPlan) => {
          if (floorPlan?.floorLevel != null) {
            const mapped = this.floorFilter?.resolveMappedinFloorId(floorPlan.floorLevel);
            if (mapped) this.floorFilter?.setExpectedFloorId(mapped);
          }
        });
        this.floorPlanWatchActive = true;
      }

      appLog('IndoorAtlas', 'SDK initialized and watchPosition active');
    } catch (error) {
      appWarn('IndoorAtlas', 'SDK init failed', error);
      if (this.running) this.startFallback(options, 'sdk_init_failed');
    }
  }

  private handleLocation(position: IndoorAtlasPosition): void {
    if (!this.running || !this.floorFilter) return;

    const coords = position.coords;
    if (coords.latitude == null || coords.longitude == null) return;

    const iaLevel = coords.floor ?? position.floorPlan?.floorLevel;
    const verdict = this.floorFilter.accept(iaLevel, position.floorCertainty);

    if (!verdict.accepted) {
      positionTelemetry.recordFloorFilter({
        accepted: false,
        reason: verdict.reason,
        iaLevel,
        expectedFloorId: this.floorFilter.getExpectedFloorId(),
        mappedinFloorId: verdict.mappedinFloorId,
      });
      appWarn('IndoorAtlas', 'Position dismissed by floor filter', {
        reason: verdict.reason,
        iaLevel,
        expectedFloorId: this.floorFilter.getExpectedFloorId(),
      });
      return;
    }

    positionTelemetry.recordFloorFilter({
      accepted: true,
      iaLevel,
      expectedFloorId: this.floorFilter.getExpectedFloorId(),
      mappedinFloorId: verdict.mappedinFloorId,
    });

    this.emit({
      latitude: coords.latitude,
      longitude: coords.longitude,
      heading: coords.heading ?? 0,
      accuracy: coords.accuracy ?? 12,
      floorId: verdict.mappedinFloorId,
    });
  }
}
