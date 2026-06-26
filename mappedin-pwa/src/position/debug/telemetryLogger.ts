import type { FplacesPositionFrame, PositionSourceType } from '../types';

const RING_MAX = 50;
const HZ_WINDOW_MS = 3_000;

export interface TelemetryFrameMeta {
  bleUuid?: string;
  bleMajor?: number;
  bleMinor?: number;
  bleRssi?: number;
  provider?: string;
}

export interface TelemetryRingEntry {
  frame: FplacesPositionFrame;
  meta?: TelemetryFrameMeta;
  recordedAt: number;
}

export interface BleHierarchyEntry {
  uuid: string;
  major?: number;
  minor?: number;
  rssi: number;
  key: string;
}

export interface FloorFilterTelemetry {
  accepted: boolean;
  reason?: string;
  iaLevel?: number;
  expectedFloorId?: string | null;
  mappedinFloorId?: string;
  at: number;
}

export interface OrchestratorTelemetry {
  committedFloorId: string | null;
  candidateFloorId: string | null;
  framesHeld: number;
  framesRequired: number;
  progressPct: number;
}

export interface TelemetrySnapshot {
  activeSource: PositionSourceType | 'none';
  streamHzBySource: Record<string, number>;
  lastFrame: TelemetryRingEntry | null;
  recentFrames: TelemetryRingEntry[];
  bleHierarchy: BleHierarchyEntry[];
  floorFilter: FloorFilterTelemetry | null;
  orchestrator: OrchestratorTelemetry | null;
}

type TelemetryListener = (snapshot: TelemetrySnapshot) => void;

class PositionTelemetryLogger {
  private readonly ring: TelemetryRingEntry[] = [];
  private readonly tickTimestamps = new Map<string, number[]>();
  private bleHierarchy: BleHierarchyEntry[] = [];
  private floorFilter: FloorFilterTelemetry | null = null;
  private orchestrator: OrchestratorTelemetry | null = null;
  private activeSource: PositionSourceType | 'none' = 'none';
  private readonly listeners = new Set<TelemetryListener>();

  setActiveSource(source: PositionSourceType | 'none'): void {
    this.activeSource = source;
    this.notify();
  }

  recordFrame(frame: FplacesPositionFrame, meta?: TelemetryFrameMeta): void {
    const entry: TelemetryRingEntry = {
      frame: { ...frame, timestamp: frame.timestamp ?? Date.now() },
      meta,
      recordedAt: performance.now(),
    };

    this.ring.push(entry);
    if (this.ring.length > RING_MAX) {
      this.ring.shift();
    }

    this.notify();
  }

  recordStreamTick(source: PositionSourceType | string): void {
    const now = performance.now();
    const key = String(source);
    const stamps = this.tickTimestamps.get(key) ?? [];
    stamps.push(now);

    const cutoff = now - HZ_WINDOW_MS;
    while (stamps.length && stamps[0] < cutoff) {
      stamps.shift();
    }

    this.tickTimestamps.set(key, stamps);
    this.notify();
  }

  recordBleHierarchy(readings: BleHierarchyEntry[]): void {
    this.bleHierarchy = [...readings]
      .sort((a, b) => b.rssi - a.rssi)
      .slice(0, 8);
    this.notify();
  }

  recordFloorFilter(verdict: Omit<FloorFilterTelemetry, 'at'>): void {
    this.floorFilter = { ...verdict, at: performance.now() };
    this.notify();
  }

  setOrchestratorState(state: OrchestratorTelemetry): void {
    this.orchestrator = state;
    this.notify();
  }

  getSnapshot(): TelemetrySnapshot {
    const streamHzBySource: Record<string, number> = {};
    for (const [source, stamps] of this.tickTimestamps) {
      const spanMs =
        stamps.length >= 2 ? stamps[stamps.length - 1] - stamps[0] : HZ_WINDOW_MS;
      const hz = spanMs > 0 ? ((stamps.length - 1) / spanMs) * 1000 : stamps.length / (HZ_WINDOW_MS / 1000);
      streamHzBySource[source] = Math.round(hz * 10) / 10;
    }

    return {
      activeSource: this.activeSource,
      streamHzBySource,
      lastFrame: this.ring.length ? this.ring[this.ring.length - 1] : null,
      recentFrames: [...this.ring].reverse().slice(0, 8),
      bleHierarchy: [...this.bleHierarchy],
      floorFilter: this.floorFilter,
      orchestrator: this.orchestrator,
    };
  }

  subscribe(listener: TelemetryListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

export const positionTelemetry = new PositionTelemetryLogger();
