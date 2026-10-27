import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapApp } from './map-app';
import { initialAppState } from '../types';
import { logoutUser, saveVenueSelection, loadVenueSelection } from './auth-service';
import { listAllVenues } from './forum-service';

vi.mock('@mappedin/mappedin-js', () => ({}));
vi.mock('@mappedin/blue-dot', () => ({}));
vi.mock('./ar-service', () => ({ isArFrameVisible: () => false }));
vi.mock('./auth-service', async (original) => ({
  ...await original<typeof import('./auth-service')>(), logoutUser: vi.fn(),
}));
vi.mock('./forum-service', async (original) => ({
  ...await original<typeof import('./forum-service')>(), listAllVenues: vi.fn(),
}));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('logout venue cache', () => {
  it.each([false, true])('clears venues and fetches a fresh catalog (logout fails: %s)', async (fails) => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    saveVenueSelection(1, { venueId: '5', sectionId: '10' });
    saveVenueSelection(2, { venueId: '6', sectionId: '11' });
    storage.set('fplaces_returning_session', '{}');
    storage.set('fplaces_visited_venues', '["5"]');
    const state = { ...initialAppState(), selectedVenueId: '5', selectedGateId: '10' };
    const app = Object.create(MapApp.prototype) as any;
    Object.assign(app, {
      store: { get: () => state, patch: (patch: object) => Object.assign(state, patch) },
      disconnectVenueLiveFeed: vi.fn(), disconnectLocationLiveFeed: vi.fn(),
      disconnectPersonalNotifications: vi.fn(), stopLiveUserLocationWatch: vi.fn(),
      showLogin: vi.fn(), showToast: vi.fn(), venueFeedScopeGeneration: 0,
    });
    vi.mocked(logoutUser).mockImplementation(async () => {
      if (fails) throw new Error('Offline');
    });
    await app.logout();
    for (const key of ['fplaces_venue_selection_by_user', 'fplaces_returning_session', 'fplaces_visited_venues']) {
      expect(storage.has(key)).toBe(false);
    }
    expect(loadVenueSelection(1)).toBeNull();
    expect(loadVenueSelection(2)).toBeNull();
    expect(state.selectedVenueId).toBeNull();
    expect(state.selectedGateId).toBeNull();
    expect(state.forumVenues).toEqual([]);
    expect(state.homeContent).toBeNull();
    vi.mocked(listAllVenues).mockResolvedValue([]);
    state.authUser = {
      id: 1, email: 'visitor@example.com', pseudo_name: 'Visitor',
      is_email_verified: true, created_at: '', updated_at: '',
    };
    await app.continueAfterAuthenticated(state.authUser, { promptLocation: false });
    await vi.waitFor(() => expect(listAllVenues).toHaveBeenCalledOnce());
    expect(state.authStep).toBe('venue-select');
  });
});
