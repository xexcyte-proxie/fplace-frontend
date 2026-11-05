import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authRepository } from './auth-repository-impl';
import { tokenLocalDatasource } from './datasources/token-local-datasource';
import { apiRequest } from './datasources/api-client';

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  tokenLocalDatasource.save({ access: 'old-access', refresh: 'old-refresh' });
});
afterEach(() => vi.unstubAllGlobals());

describe('logout request isolation', () => {
  it('does not attempt token refresh when logout returns 401', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: 'Expired' }), { status: 401 }));
    vi.stubGlobal('fetch', fetch);
    await expect(authRepository.logout('old-refresh')).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(tokenLocalDatasource.load()).toBeNull();
  });

  it('does not clear a new session when an older logout finishes', async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(resolve => { finish = resolve; })));
    const pending = authRepository.logout('old-refresh');
    tokenLocalDatasource.save({ access: 'new-access', refresh: 'new-refresh' });
    finish(new Response(null, { status: 204 }));
    await pending;
    expect(tokenLocalDatasource.load()).toEqual({ access: 'new-access', refresh: 'new-refresh' });
  });

  it.each([false, true])('does not restore old tokens from a pending refresh (new sign-in: %s)', async newSignIn => {
    let finishRefresh!: (response: Response) => void;
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: 'Expired' }), { status: 401 }))
      .mockImplementationOnce(() => new Promise(resolve => { finishRefresh = resolve; }));
    vi.stubGlobal('fetch', fetch);
    const result = apiRequest('/api/users/me/', { auth: true }).catch(error => error);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    tokenLocalDatasource.clear();
    if (newSignIn) tokenLocalDatasource.save({ access: 'new-access', refresh: 'new-refresh' });
    finishRefresh(new Response(JSON.stringify({ access: 'stale-access', refresh: 'stale-refresh' }), { status: 200 }));
    await result;
    expect(tokenLocalDatasource.load()).toEqual(newSignIn ? { access: 'new-access', refresh: 'new-refresh' } : null);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
