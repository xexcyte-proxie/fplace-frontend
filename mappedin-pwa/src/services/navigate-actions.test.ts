import { describe, expect, it, vi } from 'vitest';
import { MapApp } from './map-app';
import { initialAppState } from '../types';

vi.mock('@mappedin/mappedin-js', () => ({}));
vi.mock('@mappedin/blue-dot', () => ({}));
vi.mock('./ar-service', () => ({ isArFrameVisible: () => false }));

function harness() {
  const state = { ...initialAppState(), activeTab: 'map' as const };
  const app = Object.create(MapApp.prototype) as any;
  app.store = { get: () => state, patch: (patch: object) => Object.assign(state, patch) };
  return { app, state };
}

describe('Navigate actions', () => {
  it('keeps Navigate visible while switching venue maps', async () => {
    const { app, state } = harness();
    Object.assign(app, {
      disconnectVenueLiveFeed: vi.fn(), disconnectLocationLiveFeed: vi.fn(),
      teardownMappedinScene: vi.fn(), ensureMapForSelectedVenue: vi.fn(async () => {}),
    });
    await app.beginBackgroundVenueMapSwitch({ id: 2, name: 'Venue', location: 'Lagos' });
    expect(state.activeTab).toBe('map');
    expect(state.navigateView).toBe('home');
    expect(state.mapStatus).toBe('loading');
  });

  it('shows loading throughout venue selection and prevents duplicate requests', async () => {
    const { app, state } = harness();
    let finish!: () => void;
    app.openHomeVenue = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const pending = app.selectNavigateVenue('2');
    expect(state.navigateDiscoverVenuePickerLoading).toBe(true);
    await app.selectNavigateVenue('3');
    expect(app.openHomeVenue).toHaveBeenCalledTimes(1);
    finish();
    await pending;
    expect(state.navigateDiscoverVenuePickerLoading).toBe(false);
    expect(state.activeTab).toBe('map');
  });

  it('uses Navigate venue selection for search results', () => {
    const { app, state } = harness();
    state.homeVenueSearchQuery = 'venue';
    state.homeContent = { recentlyVisited: [{ id: '2', name: 'Venue' }], otherVenues: [] } as any;
    app.selectNavigateVenue = vi.fn();
    app.submitNavigateVenueSearch();
    expect(app.selectNavigateVenue).toHaveBeenCalledWith('2');
  });
});
