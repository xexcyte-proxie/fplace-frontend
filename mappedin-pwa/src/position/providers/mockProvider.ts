import beaconMatrixData from '../config/beacon-venue-matrix.json';
import { appConfig } from '../../config';
import type { RouteCoordinate } from '../../types';
import type { FplacesPositionFrame } from '../types';
import {
  bearingDegrees,
  haversineMeters,
  interpolateAlongPath,
  metersAlongPath,
  pathTotalMeters,
} from './heading';
import {
  PositionProvider,
  type PositionProviderStartOptions,
} from '../positionProvider';
import { appLog } from '../../utils/logger';

const TICK_MS = 100;
const STEP_METERS_PER_TICK = 0.85;

interface BeaconMatrixEntry {
  latitude: number;
  longitude: number;
  floorId?: string;
}

interface BeaconVenueMatrix {
  venueMapId: string;
  beacons: BeaconMatrixEntry[];
}

function buildMockFieldTraversalPath(): RouteCoordinate[] {
  const matrix = beaconMatrixData as BeaconVenueMatrix;
  if (matrix.venueMapId !== appConfig.mappedin.mapId) return [];

  return matrix.beacons.slice(0, 3).map((beacon) => ({
    latitude: beacon.latitude,
    longitude: beacon.longitude,
    floorId: beacon.floorId,
  }));
}

const MOCK_FIELD_TRAVERSAL_PATH = buildMockFieldTraversalPath();

export class HighFrequencyMockProvider extends PositionProvider {
  readonly source: FplacesPositionFrame['source'] = 'simulator';

  private timer: ReturnType<typeof setInterval> | null = null;
  private path: RouteCoordinate[] = [];
  private segmentIndex = 0;
  private segmentT = 0;
  private isMoving = false;

  startSimulationMove(): void {
    if (!this.path.length) {
      appLog('Simulator', 'startSimulationMove skipped — empty path');
      return;
    }
    const alreadyActive = this.isMoving && this.timer != null;
    this.isMoving = true;
    this.ensureTickLoop();
    appLog('Simulator', alreadyActive ? 'Movement re-armed' : 'Movement activated', {
      pathPoints: this.path.length,
      tickHz: 1000 / TICK_MS,
      segmentIndex: this.segmentIndex,
      segmentT: this.segmentT,
    });
    // Advance immediately so the first streamed frame differs from the seed.
    this.tick();
  }

  /** Start the 10 Hz loop only when movement is armed. */
  ensureTickLoop(): void {
    if (this.timer != null || this.path.length === 0) return;
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  stopSimulationMove(): void {
    this.isMoving = false;
  }

  get moving(): boolean {
    return this.isMoving;
  }

  getMetersAlongPath(): number {
    return metersAlongPath(this.path, this.segmentIndex, this.segmentT);
  }

  getTotalPathMeters(): number {
    return pathTotalMeters(this.path);
  }

  isAtPathEnd(): boolean {
    if (this.path.length < 2) return true;
    const finalSegmentIndex = this.path.length - 2;
    return this.segmentIndex >= finalSegmentIndex && this.segmentT >= 1;
  }

  seekAlongPath(metersAlong: number): void {
    if (this.path.length < 2) return;

    let remaining = Math.max(0, metersAlong);
    for (let segmentIndex = 0; segmentIndex < this.path.length - 1; segmentIndex++) {
      const segLen = Math.max(
        haversineMeters(this.path[segmentIndex], this.path[segmentIndex + 1]),
        0.01,
      );
      if (remaining <= segLen) {
        this.segmentIndex = segmentIndex;
        this.segmentT = remaining / segLen;
        this.emitFrame();
        return;
      }
      remaining -= segLen;
    }

    this.segmentIndex = Math.max(0, this.path.length - 2);
    this.segmentT = 1;
    this.emitFrame();
  }

  protected onStart(options?: PositionProviderStartOptions): void {
    if (this.source === 'simulator') {
      appLog('Simulator', 'onStart', {
        mockPathLength: MOCK_FIELD_TRAVERSAL_PATH.length,
        optionsPathLength: options?.path?.length ?? 0,
        venueMapId: appConfig.mappedin.mapId,
      });
    }

    if (options?.path && options.path.length >= 2) {
      this.path = [...options.path];
    } else if (this.source === 'simulator' && MOCK_FIELD_TRAVERSAL_PATH.length >= 2) {
      this.path = [...MOCK_FIELD_TRAVERSAL_PATH];
    } else {
      this.path = options?.path?.length ? [...options.path] : [];
    }

    this.segmentIndex = 0;
    this.segmentT = 0;
    this.isMoving = false;

    if (!this.path.length) {
      if (this.source === 'simulator') {
        appLog('Simulator', 'onStart aborted — empty path, interval not scheduled');
      }
      return;
    }

    if (this.source === 'simulator') {
      appLog('Simulator', 'Provider ready (paused until startSimulationMove)', {
        pathPoints: this.path.length,
        origin: this.path[0],
      });
    }

    // Seed one frame at the route origin — do NOT tick until movement is armed.
    this.emitFrame();
  }

  protected onStop(): void {
    this.isMoving = false;
    if (this.timer != null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private tick(): void {
    if (!this.isMoving) return;

    if (this.path.length < 2) {
      this.emitFrame();
      return;
    }

    const finalSegmentIndex = this.path.length - 2;
    if (this.segmentIndex >= finalSegmentIndex && this.segmentT >= 1) {
      this.segmentIndex = finalSegmentIndex;
      this.segmentT = 1;
      this.isMoving = false;
      this.emitFrame();
      return;
    }

    const a = this.path[this.segmentIndex];
    const b = this.path[this.segmentIndex + 1];
    const segLen = Math.max(haversineMeters(a, b), 0.01);
    const deltaT = STEP_METERS_PER_TICK / segLen;
    this.segmentT += deltaT;

    if (this.segmentT >= 1) {
      const nextIndex = this.segmentIndex + 1;
      if (nextIndex >= finalSegmentIndex) {
        this.segmentIndex = finalSegmentIndex;
        this.segmentT = 1;
      } else {
        this.segmentT = 0;
        this.segmentIndex = nextIndex;
      }
    }

    this.emitFrame();
  }

  private emitFrame(): void {
    if (!this.path.length) return;

    const point =
      this.path.length === 1
        ? this.path[0]
        : interpolateAlongPath(this.path, this.segmentIndex, this.segmentT);

    const nextIndex = Math.min(
      this.segmentIndex + (this.segmentT > 0.85 ? 1 : 0),
      this.path.length - 1,
    );
    const target =
      nextIndex < this.path.length - 1
        ? this.path[nextIndex + 1]
        : this.path[this.path.length - 1];

    const heading = bearingDegrees(point, target);

    this.emit({
      latitude: point.latitude,
      longitude: point.longitude,
      heading,
      accuracy: 4,
      floorId: point.floorId,
    });
  }
}
