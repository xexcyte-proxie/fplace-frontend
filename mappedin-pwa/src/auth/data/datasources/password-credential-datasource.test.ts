import { afterEach, describe, expect, it, vi } from 'vitest';

import { PasswordCredentialDatasource } from './password-credential-datasource';

class FakePasswordCredential {
  id: string;
  password: string;
  type = 'password';

  constructor(data: { id: string; password: string }) {
    this.id = data.id;
    this.password = data.password;
  }
}

describe('PasswordCredentialDatasource', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null when the Credential Management API is missing', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('PasswordCredential', undefined);
    const datasource = new PasswordCredentialDatasource();
    expect(datasource.isSupported()).toBe(false);
    await expect(datasource.load()).resolves.toBeNull();
  });

  it('loads a saved email and password', async () => {
    const get = vi.fn().mockResolvedValue(
      new FakePasswordCredential({
        id: 'fan@email.com',
        password: 'secret',
      }),
    );
    vi.stubGlobal('PasswordCredential', FakePasswordCredential);
    vi.stubGlobal('navigator', {
      credentials: {
        get,
        store: vi.fn(),
      },
    });

    const datasource = new PasswordCredentialDatasource();
    await expect(datasource.load()).resolves.toEqual({
      email: 'fan@email.com',
      password: 'secret',
    });
    expect(get).toHaveBeenCalledWith({
      password: true,
      mediation: 'silent',
    });
  });

  it('stores a trimmed email with the password', async () => {
    const store = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('PasswordCredential', FakePasswordCredential);
    vi.stubGlobal('navigator', {
      credentials: {
        get: vi.fn(),
        store,
      },
    });

    const datasource = new PasswordCredentialDatasource();
    await datasource.save({
      email: '  fan@email.com  ',
      password: 'secret',
    });

    expect(store).toHaveBeenCalledTimes(1);
    const stored = store.mock.calls[0]?.[0] as FakePasswordCredential;
    expect(stored).toBeInstanceOf(FakePasswordCredential);
    expect(stored.id).toBe('fan@email.com');
    expect(stored.password).toBe('secret');
  });

  it('skips store when the password is empty', async () => {
    const store = vi.fn();
    vi.stubGlobal('PasswordCredential', FakePasswordCredential);
    vi.stubGlobal('navigator', {
      credentials: {
        get: vi.fn(),
        store,
      },
    });

    const datasource = new PasswordCredentialDatasource();
    await datasource.save({ email: 'fan@email.com', password: '' });
    expect(store).not.toHaveBeenCalled();
  });
});
