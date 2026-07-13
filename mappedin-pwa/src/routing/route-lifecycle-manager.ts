import type { RouteLifecycleMetadata, RouteLifecycleState } from '../types';

const VALID_TRANSITIONS: Record<RouteLifecycleState, RouteLifecycleState[]> = {
  generating: ['generated', 'cancelled'],
  generated: ['ready', 'cancelled', 'expired'],
  ready: ['sentToAR', 'navigating', 'cancelled', 'expired'],
  sentToAR: ['accepted', 'ready', 'cancelled', 'expired'],
  accepted: ['navigating', 'paused', 'recalculating', 'completed', 'cancelled'],
  navigating: ['paused', 'recalculating', 'completed', 'cancelled'],
  paused: ['navigating', 'recalculating', 'cancelled', 'completed'],
  recalculating: ['generated', 'ready', 'cancelled'],
  completed: [],
  cancelled: [],
  expired: [],
};

export class RouteLifecycleManager {
  private state: RouteLifecycleMetadata = {
    state: 'generating',
    stateChangedAt: Date.now(),
  };

  get(): RouteLifecycleMetadata {
    return { ...this.state };
  }

  transition(next: RouteLifecycleState): RouteLifecycleMetadata {
    const allowed = VALID_TRANSITIONS[this.state.state] ?? [];
    if (!allowed.includes(next) && this.state.state !== next) {
      console.warn(
        `[RouteLifecycle] Invalid transition ${this.state.state} → ${next}`,
      );
    }
    this.state = {
      state: next,
      stateChangedAt: Date.now(),
      previousState: this.state.state,
    };
    return this.get();
  }

  reset(): void {
    this.state = { state: 'generating', stateChangedAt: Date.now() };
  }
}

export const routeLifecycleManager = new RouteLifecycleManager();
