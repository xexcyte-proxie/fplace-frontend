import type { FplacesPositionFrame } from './types';
import type { RouteCoordinate } from '../types';

export type PositionFrameCallback = (frame: FplacesPositionFrame) => void;

export interface PositionProviderStartOptions {
  path?: RouteCoordinate[];
  floorId?: string;
  expectedFloorId?: string;
  venueMapId?: string;
}

export abstract class PositionProvider {
  protected callback: PositionFrameCallback | null = null;
  protected running = false;

  get isRunning(): boolean {
    return this.running;
  }

  abstract readonly source: FplacesPositionFrame['source'];

  start(callback: PositionFrameCallback, options?: PositionProviderStartOptions): void {
    this.callback = callback;
    this.running = true;
    this.onStart(options);
  }

  stop(): void {
    this.running = false;
    this.onStop();
    this.callback = null;
  }

  protected emit(frame: Omit<FplacesPositionFrame, 'source'> & { source?: FplacesPositionFrame['source'] }): void {
    if (!this.running || !this.callback) return;
    this.callback({
      ...frame,
      source: frame.source ?? this.source,
      timestamp: frame.timestamp ?? Date.now(),
    });
  }

  protected abstract onStart(options?: PositionProviderStartOptions): void;
  protected abstract onStop(): void;
}
