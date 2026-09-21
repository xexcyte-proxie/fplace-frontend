import {
  isUsableSavedPasswordCredential,
  type SavedPasswordCredential,
} from '../../domain/saved-password-credential';

type PasswordCredentialInit = {
  id: string;
  password: string;
};

type PasswordCredentialLike = Credential & {
  password: string;
};

type PasswordCredentialCtor = new (
  data: PasswordCredentialInit,
) => PasswordCredentialLike;

function passwordCredentialConstructor(): PasswordCredentialCtor | null {
  const ctor = (
    globalThis as typeof globalThis & {
      PasswordCredential?: PasswordCredentialCtor;
    }
  ).PasswordCredential;
  return typeof ctor === 'function' ? ctor : null;
}

function asPasswordCredential(
  credential: Credential | null,
): PasswordCredentialLike | null {
  if (!credential || typeof credential.id !== 'string') return null;
  if (!('password' in credential)) return null;
  const password = (credential as PasswordCredentialLike).password;
  if (typeof password !== 'string') return null;
  return credential as PasswordCredentialLike;
}

/**
 * Chrome / Android password manager via the Credential Management API.
 * Safari and iOS keep using HTML autocomplete on the auth forms.
 */
export class PasswordCredentialDatasource {
  isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      typeof navigator.credentials?.get === 'function' &&
      typeof navigator.credentials.store === 'function' &&
      passwordCredentialConstructor() !== null
    );
  }

  async load(): Promise<SavedPasswordCredential | null> {
    if (!this.isSupported()) return null;
    try {
      const credential = asPasswordCredential(
        await navigator.credentials.get({
          password: true,
          mediation: 'silent',
        } as CredentialRequestOptions),
      );
      if (!credential) return null;
      const saved: SavedPasswordCredential = {
        email: credential.id,
        password: credential.password,
      };
      return isUsableSavedPasswordCredential(saved) ? saved : null;
    } catch {
      return null;
    }
  }

  async save(credential: SavedPasswordCredential): Promise<void> {
    if (!this.isSupported()) return;
    if (!isUsableSavedPasswordCredential(credential)) return;
    const Ctor = passwordCredentialConstructor();
    if (!Ctor) return;
    try {
      await navigator.credentials.store(
        new Ctor({
          id: credential.email.trim(),
          password: credential.password,
        }),
      );
    } catch {
      /* browser declined or API unavailable */
    }
  }
}

export const passwordCredentialDatasource = new PasswordCredentialDatasource();
