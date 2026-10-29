import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapApp } from './map-app';
import { initialAppState } from '../types';
import { venuesLocalDatasource } from '../forum/data/datasources/venues-local-datasource';
import records from '../forum/data/local-venues.json';

vi.mock('@mappedin/mappedin-js', () => ({}));
vi.mock('@mappedin/blue-dot', () => ({}));
vi.mock('./ar-service', () => ({ isArFrameVisible: () => false }));

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function harness(selectedVenueId: string | null = null) {
  const state = { ...initialAppState(), selectedVenueId };
  const app = Object.create(MapApp.prototype) as any;
  Object.assign(app, {
    store: { get: () => state, patch: (patch: object) => Object.assign(state, patch) },
    loadOnboardingSections: vi.fn(async () => {}),
    handleAuthFailure: vi.fn(),
  });
  return { app, state };
}

describe('local venue selection lifecycle', () => {
  it.each(records)('restores $name and passes its map ID to initialization', async (venue) => {
    const fetch = vi.fn(() => { throw new Error('Venue endpoint unavailable'); });
    vi.stubGlobal('fetch', fetch);
    const { app, state } = harness(String(venue.id));
    const loading = app.loadOnboardingVenues();
    expect(state.authLoading).toBe(true);
    await loading;
    expect(state.authLoading).toBe(false);
    expect(state.authFieldErrors).toEqual({});
    expect(state.selectedVenueId).toBe(String(venue.id));
    expect(app.selectedVenueMapLoadRequest()).toEqual({ mapId: venue.mappedin_map_id });
    expect(app.loadOnboardingSections).toHaveBeenCalledWith(String(venue.id), false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('selects the first available venue when a saved ID is absent', async () => {
    const { app, state } = harness('999');
    await app.loadOnboardingVenues();
    expect(state.selectedVenueId).toBe(String(records[0].id));
    expect(state.selectedGateId).toBeNull();
  });

  it('finishes loading with the existing empty-state message', async () => {
    vi.spyOn(venuesLocalDatasource, 'listVenues').mockResolvedValue({
      count: 0, next: null, previous: null, results: [],
    });
    const { app, state } = harness();
    await app.loadOnboardingVenues();
    expect(state.authLoading).toBe(false);
    expect(state.authFieldErrors._form).toBe('No venues are available right now.');
    expect(app.loadOnboardingSections).not.toHaveBeenCalled();
  });

  it('uses existing error handling and can retry metadata loading', async () => {
    const failure = new Error('Local catalog unavailable');
    vi.spyOn(venuesLocalDatasource, 'listVenues').mockRejectedValueOnce(failure);
    const { app, state } = harness();
    await app.loadOnboardingVenues();
    expect(app.handleAuthFailure).toHaveBeenCalledWith(failure, 'Could not load venues. Please try again.');
    await app.loadOnboardingVenues();
    expect(state.authLoading).toBe(false);
    expect(state.forumVenues).toHaveLength(records.length);
  });
});
