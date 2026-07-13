export interface RouteVersionRecord {
  routeId: string;
  routeVersion: number;
  generatedAt: number;
  geometryHash: string;
}

/**
 * Tracks the latest accepted route version for optimistic synchronization.
 * PWA increments version on each route generation; AR uses this to reject stale updates.
 */
export class RouteVersionManager {
  private latest: RouteVersionRecord | null = null;
  private nextVersion = 1;

  /** Allocate a new globally unique route identity. */
  createIdentity(geometryHash: string): RouteVersionRecord {
    const routeId = createRouteId();
    const record: RouteVersionRecord = {
      routeId,
      routeVersion: this.nextVersion++,
      generatedAt: Date.now(),
      geometryHash,
    };
    this.latest = record;
    return record;
  }

  /** Bump version for a reroute while preserving routeId (recalculation). */
  bumpVersion(routeId: string, geometryHash: string): RouteVersionRecord {
    const record: RouteVersionRecord = {
      routeId,
      routeVersion: this.nextVersion++,
      generatedAt: Date.now(),
      geometryHash,
    };
    this.latest = record;
    return record;
  }

  getLatest(): RouteVersionRecord | null {
    return this.latest;
  }

  /** Returns true if incoming should be accepted over current. */
  isNewerThanCurrent(incoming: RouteVersionRecord): boolean {
    if (!this.latest) return true;
    if (incoming.routeId !== this.latest.routeId) return true;
    if (incoming.routeVersion > this.latest.routeVersion) return true;
    if (
      incoming.routeVersion === this.latest.routeVersion &&
      incoming.generatedAt >= this.latest.generatedAt
    ) {
      return incoming.geometryHash !== this.latest.geometryHash;
    }
    return false;
  }

  accept(incoming: RouteVersionRecord): void {
    this.latest = incoming;
    if (incoming.routeVersion >= this.nextVersion) {
      this.nextVersion = incoming.routeVersion + 1;
    }
  }

  reset(): void {
    this.latest = null;
    this.nextVersion = 1;
  }
}

function createRouteId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `route-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** Singleton for the active navigation session. */
export const routeVersionManager = new RouteVersionManager();
