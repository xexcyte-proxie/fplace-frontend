import beaconMatrixData from '../config/beacon-venue-matrix.json';
import { appConfig } from '../../config';
import type { FplacesPositionFrame } from '../types';
import { PositionProvider, type PositionProviderStartOptions } from '../positionProvider';
import { GpsPositionProvider } from './gpsProvider';
import { parseAdvertisementEvent } from './bleBeaconParser';
import {
  selectNearestBeacon,
  snapToBeaconFrame,
  toReading,
  type BeaconReading,
  type BeaconVenueMatrix,
} from './bleProximity';
import { appLog, appWarn } from '../../utils/logger';
import { positionTelemetry } from '../debug/telemetryLogger';

type BluetoothNavigator = Navigator & {
  bluetooth: Bluetooth & {
    requestLEScan?: (options?: BluetoothLEScanOptions) => Promise<BluetoothLEScan>;
  };
};

export class BleBeaconProvider extends PositionProvider {
  readonly source: FplacesPositionFrame['source'] = 'ble_beacon';

  private fallback: GpsPositionProvider | null = null;
  private scanTimer: ReturnType<typeof setInterval> | null = null;
  private lescan: BluetoothLEScan | null = null;
  private scanAbort: AbortController | null = null;
  private readonly readings = new Map<string, BeaconReading>();
  private lastSnap: FplacesPositionFrame | null = null;
  private matrix: BeaconVenueMatrix = { venueMapId: '', beacons: [] };
  private readonly rssiThreshold: number;
  private readonly scanIntervalMs: number;

  constructor() {
    super();
    const envInterval = Number(import.meta.env.VITE_BLE_SCAN_INTERVAL_MS);
    this.rssiThreshold = appConfig.positioning.bleRssiThresholdDbm;
    this.scanIntervalMs = Number.isFinite(envInterval) && envInterval >= 100
      ? envInterval
      : appConfig.positioning.bleScanIntervalMs;
  }

  protected onStart(options?: PositionProviderStartOptions): void {
    const raw = beaconMatrixData as BeaconVenueMatrix;
    this.matrix = raw.venueMapId === options?.venueMapId
      ? raw : { venueMapId: options?.venueMapId ?? '', beacons: [] };
    if (!this.matrix.beacons.length) {
      this.startFallback(options, 'venue_beacons_unavailable');
      return;
    }
    if (!('bluetooth' in navigator)) {
      this.startFallback(options, 'bluetooth_unavailable');
      return;
    }

    void this.startScanning(options);
  }

  protected onStop(): void {
    if (this.scanTimer != null) {
      window.clearInterval(this.scanTimer);
      this.scanTimer = null;
    }

    this.scanAbort?.abort();
    this.scanAbort = null;

    if (this.lescan) {
      void this.lescan.stop().catch(() => undefined);
      this.lescan = null;
    }

    this.readings.clear();
    this.lastSnap = null;
    this.fallback?.stop();
    this.fallback = null;
  }

  private startFallback(options?: PositionProviderStartOptions, reason?: string): void {
    if (reason) {
      appWarn('BleBeacon', `Falling back to GPS (${reason})`);
    }
    if (!this.running || this.fallback) return;
    this.fallback = new GpsPositionProvider();
    this.fallback.start((frame) => this.emit(frame), {
      ...options, onStatus: (status) => this.reportStatus(status),
    });
  }

  private async startScanning(options?: PositionProviderStartOptions): Promise<void> {
    const nav = navigator as BluetoothNavigator;
    const generation = this.generation;

    try {
      if (typeof nav.bluetooth.requestLEScan === 'function') {
        await this.startLeScanLoop(nav);
        appLog('BleBeacon', 'LE scan loop active', {
          thresholdDbm: this.rssiThreshold,
          intervalMs: this.scanIntervalMs,
          beaconCount: this.matrix.beacons.length,
        });
        return;
      }

      this.startFallback(options, 'lescan_unavailable');
    } catch (error) {
      appWarn('BleBeacon', 'Scan startup failed', error);
      if (this.running && generation === this.generation) this.startFallback(options, 'scan_failed');
    }
  }

  private async startLeScanLoop(nav: BluetoothNavigator): Promise<void> {
    const generation = this.generation;
    const scan = await nav.bluetooth.requestLEScan!({
      acceptAllAdvertisements: true,
      keepRepeatedDevices: true,
    });

    if (!this.running || generation !== this.generation) {
      await scan.stop();
      return;
    }
    this.lescan = scan;
    this.scanAbort = new AbortController();
    const onAdvert = (event: Event) => {
      const advert = parseAdvertisementEvent(event as BluetoothAdvertisingEvent);
      if (!advert) return;
      const reading = toReading(advert);
      this.readings.set(reading.key, reading);
    };

    navigator.addEventListener('advertisementreceived', onAdvert as (event: BluetoothAdvertisingEvent) => void);
    this.scanAbort.signal.addEventListener('abort', () => {
      navigator.removeEventListener('advertisementreceived', onAdvert as (event: BluetoothAdvertisingEvent) => void);
    });

    this.scanTimer = window.setInterval(() => {
      this.evaluateProximity();
    }, this.scanIntervalMs);
  }

  private evaluateProximity(): void {
    if (!this.running) return;

    for (const [key, reading] of this.readings) {
      if (Date.now() - reading.timestamp > 5_000) this.readings.delete(key);
    }
    positionTelemetry.recordBleHierarchy(
      [...this.readings.values()].map((reading) => ({
        uuid: reading.uuid,
        major: reading.major,
        minor: reading.minor,
        rssi: reading.rssi,
        key: reading.key,
      })),
    );

    const match = selectNearestBeacon(
      this.readings.values(),
      this.matrix,
      this.rssiThreshold,
    );

    if (!match) return;

    const frame = snapToBeaconFrame(match, this.lastSnap);
    this.lastSnap = frame;
    this.emit(frame);
  }
}
