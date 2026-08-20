import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthApiError } from '../../../auth/data/datasources/api-client';
import { tokenLocalDatasource } from '../../../auth/data/datasources/token-local-datasource';
import { GuestRepositoryImpl } from '../guest-repository-impl';
import { guestSessionLocalDatasource } from './guest-session-local-datasource';
import { guestFingerprintMockDatasource } from './guest-fingerprint-mock-datasource';
import * as clientIp from './client-ip-datasource';
import { guestRemoteDatasource } from './guest-remote-datasource';

vi.mock('./guest-remote-datasource', () => ({
  guestRemoteDatasource: {
    obtainGuestToken: vi.fn(),
    getSessionPreferences: vi.fn(),
    updateSessionPreferences: vi.fn(),
  },
  AuthApiError,
}));

function installMemoryLocalStorage(): void {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  });
}

describe('GuestRepositoryImpl (POST /api/users/guest/)', () => {
  const repo = new GuestRepositoryImpl();

  beforeEach(() => {
    vi.clearAllMocks();
    installMemoryLocalStorage();
    tokenLocalDatasource.clear();
    guestSessionLocalDatasource.clear();
    guestFingerprintMockDatasource.clearAll();
    vi.spyOn(clientIp, 'resolveClientIpAddress').mockResolvedValue('1.2.3.4');
  });

  it('stores guest JWT + MappedIn credentials on success', async () => {
    vi.mocked(guestRemoteDatasource.obtainGuestToken).mockResolvedValue({
      access: 'guest.jwt.token',
      token_type: 'guest',
      expires_in: 3600,
      trial_expires_at: '2026-08-12T00:00:00Z',
      mappedin: { token: 'mappedin-access', expires_in: 3600 },
    });

    const result = await repo.obtainGuestSession({
      deviceFingerprint: 'fp_test_1',
      ipAddress: '1.2.3.4',
    });

    expect(result.allowed).toBe(true);
    expect(result.guestId).toBe('fp_test_1');
    expect(result.session?.mappedin.token).toBe('mappedin-access');
    expect(tokenLocalDatasource.getAccessToken()).toBe('guest.jwt.token');
    expect(tokenLocalDatasource.isGuestToken()).toBe(true);
    expect(tokenLocalDatasource.load()).toBeNull();
    expect(guestSessionLocalDatasource.getMappedinToken()).toBe(
      'mappedin-access',
    );
    expect(guestSessionLocalDatasource.getPreferences()).toEqual({
      hasTriedArView: false,
      hasTried2dView: false,
    });
    expect(guestRemoteDatasource.obtainGuestToken).toHaveBeenCalledWith({
      ip_address: '1.2.3.4',
      device_fingerprint: 'fp_test_1',
    });
  });

  it('patches AR and 2D trial flags via /api/users/guest/update/', async () => {
    vi.mocked(guestRemoteDatasource.obtainGuestToken).mockResolvedValue({
      access: 'guest.jwt.token',
      token_type: 'guest',
      expires_in: 3600,
      trial_expires_at: '2026-08-12T00:00:00Z',
      has_tried_ar_view: false,
      has_tried_2d_view: false,
      mappedin: { token: 'mappedin-access', expires_in: 3600 },
    });
    await repo.obtainGuestSession({
      deviceFingerprint: 'fp_test_1',
      ipAddress: '1.2.3.4',
    });

    vi.mocked(guestRemoteDatasource.updateSessionPreferences).mockResolvedValue({
      has_tried_ar_view: true,
      has_tried_2d_view: false,
    });
    const ar = await repo.updateSessionPreferences({ hasTriedArView: true });
    expect(ar).toEqual({ hasTriedArView: true, hasTried2dView: false });
    expect(guestRemoteDatasource.updateSessionPreferences).toHaveBeenCalledWith({
      has_tried_ar_view: true,
    });

    vi.mocked(guestRemoteDatasource.getSessionPreferences).mockResolvedValue({
      has_tried_ar_view: true,
      has_tried_2d_view: true,
    });
    const prefs = await repo.getSessionPreferences();
    expect(prefs).toEqual({ hasTriedArView: true, hasTried2dView: true });
    expect(guestSessionLocalDatasource.getPreferences()).toEqual(prefs);
  });

  it('maps HTTP 403 to Guest trial expired without storing tokens', async () => {
    vi.mocked(guestRemoteDatasource.obtainGuestToken).mockRejectedValue(
      new AuthApiError(
        { message: 'Guest trial period has expired' },
        'Guest trial has expired. Create an account to continue.',
        403,
      ),
    );

    const result = await repo.obtainGuestSession({
      deviceFingerprint: 'fp_expired',
      ipAddress: '1.2.3.4',
    });

    expect(result).toEqual({
      allowed: false,
      guestId: 'fp_expired',
      reason: 'Guest trial expired',
      session: undefined,
    });
    expect(tokenLocalDatasource.getAccessToken()).toBeNull();
    expect(guestSessionLocalDatasource.load()).toBeNull();
  });

  it('does not overwrite registered-user tokens when saving guest access', async () => {
    tokenLocalDatasource.save({
      access: 'user-access',
      refresh: 'user-refresh',
    });

    vi.mocked(guestRemoteDatasource.obtainGuestToken).mockResolvedValue({
      access: 'guest.jwt.token',
      token_type: 'guest',
      expires_in: 3600,
      trial_expires_at: '2026-08-12T00:00:00Z',
      mappedin: { token: 'mappedin-access', expires_in: 3600 },
    });

    await repo.obtainGuestSession({
      deviceFingerprint: 'fp_user',
      ipAddress: '1.2.3.4',
    });

    expect(tokenLocalDatasource.load()).toEqual({
      access: 'user-access',
      refresh: 'user-refresh',
    });
    expect(tokenLocalDatasource.getGuestAccessToken()).toBe('guest.jwt.token');
    expect(tokenLocalDatasource.getAccessToken()).toBe('user-access');
  });

  it('validateGuestFingerprint resolves IP then obtains a session', async () => {
    vi.mocked(guestRemoteDatasource.obtainGuestToken).mockResolvedValue({
      access: 'guest.jwt.token',
      token_type: 'guest',
      expires_in: 3600,
      trial_expires_at: '2026-08-12T00:00:00Z',
      mappedin: { token: 'mappedin-access', expires_in: 3600 },
    });

    const result = await repo.validateGuestFingerprint('fp_validate');
    expect(result.allowed).toBe(true);
    expect(clientIp.resolveClientIpAddress).toHaveBeenCalled();
  });
});
