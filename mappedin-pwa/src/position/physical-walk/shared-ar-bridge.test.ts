import { afterEach, expect, it, vi } from 'vitest';
import { syncNavigationToAr } from '../bridge';
import type { NavigationProgressSnapshot } from '../types';
afterEach(() => vi.unstubAllGlobals());
it('sends one atomic physical-walk progress message without entering the independent position pipeline', () => {
  const post = vi.fn();
  const frame = { src: 'https://fplaces.test/ar/', contentWindow: { postMessage: post } };
  vi.stubGlobal('window', { location: { origin: 'https://fplaces.test', href: 'https://fplaces.test/' } });
  vi.stubGlobal('document', { querySelector: (selector: string) => selector === '#ar-pip-shell' ? { hidden: false } : frame });
  const progress: NavigationProgressSnapshot = { alongPathMeters: 12, routeTraveledMeters: 12, routeRemainingMeters: 38,
    routeSimulating: false, routeSimulationComplete: false, latitude: 43, longitude: -80,
    source: 'physical-gps-transformed', navigationAuthority: 'parent-physical-walk', simulationSessionId: 'walk-1', simulationSequence: 1 };
  syncNavigationToAr(progress);
  expect(post).toHaveBeenCalledOnce();
  expect(post).toHaveBeenCalledWith({ type: 'fplaces_navigation_sync', progress }, 'https://fplaces.test');
});
