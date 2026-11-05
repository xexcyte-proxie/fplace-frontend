import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapApp } from './map-app';
import { initialAppState } from '../types';
import { fetchCurrentUser, logoutUser } from './auth-service';

vi.mock('@mappedin/mappedin-js', () => ({}));
vi.mock('@mappedin/blue-dot', () => ({}));
vi.mock('./ar-service', () => ({ isArFrameVisible: () => false }));
vi.mock('./auth-service', async original => ({
  ...await original<typeof import('./auth-service')>(), logoutUser: vi.fn(), fetchCurrentUser: vi.fn(),
}));

let storage: Map<string, string>;
beforeEach(() => {
  storage = new Map([['fplaces_access_token', 'old-access'], ['fplaces_refresh_token', 'old-refresh']]);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); });

function fixture() {
  const state = { ...initialAppState(), startupReady: true, onboardingComplete: true, activeTab: 'profile', profileView: 'settings', settingsConfirm: 'logout', selectedVenueId: '1', selectedGateId: '2' };
  const app = Object.create(MapApp.prototype) as any;
  Object.assign(app, {
    store: { get: () => state, patch: (patch: object) => Object.assign(state, patch) },
    disconnectVenueLiveFeed: vi.fn(), disconnectLocationLiveFeed: vi.fn(), disconnectPersonalNotifications: vi.fn(), stopLiveUserLocationWatch: vi.fn(),
    showToast: vi.fn(), venueFeedScopeGeneration: 0, authSessionGeneration: 0,
  });
  return { app, state };
}

describe('confirmed logout', () => {
  it.each([false, true])('clears session immediately even while server logout is pending (reject: %s)', async reject => {
    let settle!: () => void;
    vi.mocked(logoutUser).mockReturnValue(new Promise<void>((resolve, fail) => {
      settle = () => reject ? fail(new Error('Offline')) : resolve();
    }));
    const { app, state } = fixture();
    const pending = app.logout();
    expect(state.onboardingComplete).toBe(false);
    expect(state.authUser).toBeNull();
    expect(state.authStep).toBe('login');
    expect(state.authLoading).toBe(false);
    expect(state.settingsConfirm).toBeNull();
    expect(storage.has('fplaces_access_token')).toBe(false);
    expect(storage.has('fplaces_refresh_token')).toBe(false);
    const duplicate = app.logout();
    expect(logoutUser).toHaveBeenCalledTimes(1);
    // A user can sign in again while the old server request is still pending.
    storage.set('fplaces_access_token', 'new-access');
    state.onboardingComplete = true;
    settle();
    await Promise.all([pending, duplicate]);
    expect(storage.get('fplaces_access_token')).toBe('new-access');
    expect(state.onboardingComplete).toBe(true);
  });

  it('ignores a session restore that finishes after logout', async () => {
    let resolveProfile!: (value: any) => void;
    vi.mocked(fetchCurrentUser).mockReturnValue(new Promise(resolve => { resolveProfile = resolve; }));
    vi.mocked(logoutUser).mockResolvedValue();
    const { app, state } = fixture();
    state.onboardingComplete = false;
    state.authStep = 'none';
    const resume = app.resumeAuthSession();
    await app.logout();
    resolveProfile({ id: 1, email: 'old@example.com', pseudo_name: 'Old user' });
    await resume;
    expect(state.authStep).toBe('login');
    expect(state.onboardingComplete).toBe(false);
    expect(state.authUser).toBeNull();
    expect(storage.has('fplaces_auth_user')).toBe(false);
  });
});
