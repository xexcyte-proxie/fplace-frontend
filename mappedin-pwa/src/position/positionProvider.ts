import type { FplacesPositionFrame } from './types';
import type { RouteCoordinate } from '../types';

export type PositionProviderStatus = 'starting' | 'active' | 'inactive' | 'error';

export type PositionFrameCallback = (frame: FplacesPositionFrame) => void;

export interface PositionProviderStartOptions {
  path?: RouteCoordinate[];
  floorId?: string;
  expectedFloorId?: string;
  venueMapId?: string;
  onStatus?: (status: PositionProviderStatus) => void;
}

export abstract class PositionProvider {
  protected callback: PositionFrameCallback | null = null;
  protected running = false;
  protected generation = 0;
  private onStatus?: PositionProviderStartOptions['onStatus'];
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private lastFixAt = 0;
  private status: PositionProviderStatus | null = null;

  protected reportStatus(status: PositionProviderStatus): void {
    if (!this.running || this.status === status) return;
    this.status = status;
    this.onStatus?.(status);
  }

  get isRunning(): boolean {
    return this.running;
  }

  abstract readonly source: FplacesPositionFrame['source'];

  start(callback: PositionFrameCallback, options?: PositionProviderStartOptions): void {
    if (this.running) this.stop();
    this.generation += 1;
    this.callback = callback;
    this.running = true;
    this.onStatus = options?.onStatus;
    this.status = null;
    this.lastFixAt = Date.now();
    this.reportStatus('starting');
    this.healthTimer = setInterval(() => {
      if (Date.now() - this.lastFixAt > 15_000) this.reportStatus('inactive');
    }, 1_000);
    try {
      this.onStart(options);
    } catch {
      this.reportStatus('error');
      this.stop();
    }
  }

  stop(): void {
    this.running = false;
    this.generation += 1;
    if (this.healthTimer != null) clearInterval(this.healthTimer);
    this.healthTimer = null;
    this.onStatus = undefined;
    this.onStop();
    this.callback = null;
  }

  protected emit(frame: Omit<FplacesPositionFrame, 'source'> & { source?: FplacesPositionFrame['source'] }): void {
    if (!this.running || !this.callback) return;
    const timestamp = frame.timestamp ?? Date.now();
    if (timestamp >= this.lastFixAt && Date.now() - timestamp <= 15_000) {
      this.lastFixAt = Math.min(Date.now(), timestamp);
      this.reportStatus('active');
    }
    this.callback({
      ...frame,
      source: frame.source ?? this.source,
      timestamp: frame.timestamp ?? Date.now(),
    });
  }

  protected abstract onStart(options?: PositionProviderStartOptions): void;
  protected abstract onStop(): void;
}
