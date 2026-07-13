import type { FloorInfo, RouteCoordinate, RoutePayload } from '../types';
import type { NavigationProgressSnapshot } from '../position/types';
import { buildArRoutePayload } from '../utils/route-helpers';
import {
  deliverRouteWithRetry,
  syncNavigationState,
  type RouteDeliveryResult,
} from '../position/bridge';

export type NavigationSyncReason =
  | 'leg_change'
  | 'destination_change'
  | 'reroute'
  | 'floor_change'
  | 'route_version'
  | 'navigation_mode'
  | 'progress'
  | 'handoff';

export interface NavigationSyncContext {
  route: RoutePayload;
  currentLegIndex: number;
  instructions: string;
  floors?: FloorInfo[];
  userPosition?: RouteCoordinate | null;
  navigationProgress?: NavigationProgressSnapshot | null;
  navigationMode?: string;
  reason: NavigationSyncReason;
}

/**
 * Pushes incremental navigation state to AR without requiring Live View reopen.
 */
export class NavigationStateSynchronizer {
  private lastSyncKey = '';

  sync(ctx: NavigationSyncContext): void {
    const key = [
      ctx.reason,
      ctx.route.routeId,
      ctx.route.routeVersion,
      ctx.currentLegIndex,
      ctx.navigationProgress?.alongPathMeters ?? '',
      ctx.userPosition?.floorId ?? '',
      ctx.navigationMode ?? '',
    ].join('|');

    if (key === this.lastSyncKey && ctx.reason === 'progress') return;
    this.lastSyncKey = key;

    if (ctx.reason === 'reroute' || ctx.reason === 'handoff') {
      const payload = buildArRoutePayload(
        ctx.route,
        ctx.currentLegIndex,
        ctx.instructions,
        ctx.userPosition,
        ctx.floors,
        ctx.navigationProgress,
      );
      void routeSynchronizationManager.deliverRoute(payload);
      return;
    }

    syncNavigationState({
      route: ctx.route,
      currentLegIndex: ctx.currentLegIndex,
      instructions: ctx.instructions,
      navigationProgress: ctx.navigationProgress,
      reason: ctx.reason,
    });
  }

  reset(): void {
    this.lastSyncKey = '';
  }
}

/**
 * Orchestrates route delivery with acknowledgement and retry.
 */
export class RouteSynchronizationManager {
  private pendingAck: {
    routeId: string;
    routeVersion: number;
    resolve: (result: RouteDeliveryResult) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;

  deliverRoute(payload: Record<string, unknown>): Promise<RouteDeliveryResult> {
    return deliverRouteWithRetry(payload);
  }

  handleAck(routeId: string, routeVersion: number, accepted: boolean): void {
    if (
      this.pendingAck &&
      this.pendingAck.routeId === routeId &&
      this.pendingAck.routeVersion === routeVersion
    ) {
      clearTimeout(this.pendingAck.timer);
      this.pendingAck.resolve({ accepted, routeId, routeVersion, source: 'ack' });
      this.pendingAck = null;
    }
  }
}

export const navigationStateSynchronizer = new NavigationStateSynchronizer();
export const routeSynchronizationManager = new RouteSynchronizationManager();
