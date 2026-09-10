import type { AuthTokens } from '../../domain/entities';

const ACCESS_TOKEN_KEY = 'fplaces_access_token';
const REFRESH_TOKEN_KEY = 'fplaces_refresh_token';
const GUEST_ACCESS_TOKEN_KEY = 'fplaces_guest_access_token';
const TOKEN_TYPE_KEY = 'fplaces_token_type';

export type StoredTokenType = 'user' | 'guest';

export class TokenLocalDatasource {
  /** Registered-user session (access + refresh). */
  load(): AuthTokens | null {
    try {
      const access = localStorage.getItem(ACCESS_TOKEN_KEY);
      const refresh = localStorage.getItem(REFRESH_TOKEN_KEY);
      if (!access || !refresh) return null;
      return { access, refresh };
    } catch {
      return null;
    }
  }

  save(tokens: AuthTokens): void {
    try {
      localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access);
      localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh);
      localStorage.setItem(TOKEN_TYPE_KEY, 'user');
      // User session takes precedence over any prior guest JWT.
      localStorage.removeItem(GUEST_ACCESS_TOKEN_KEY);
    } catch {
      /* storage unavailable */
    }
  }

  /**
   * Guest JWT from POST /api/users/guest/.
   * Stored separately so it never wipes a registered-user refresh token.
   */
  saveGuestAccess(access: string): void {
    try {
      localStorage.setItem(GUEST_ACCESS_TOKEN_KEY, access);
      // Only claim guest as active type when there is no user session.
      if (!this.load()) {
        localStorage.setItem(TOKEN_TYPE_KEY, 'guest');
        localStorage.setItem(ACCESS_TOKEN_KEY, access);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
      }
    } catch {
      /* storage unavailable */
    }
  }

  updateAccess(access: string): void {
    try {
      localStorage.setItem(ACCESS_TOKEN_KEY, access);
    } catch {
      /* storage unavailable */
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(GUEST_ACCESS_TOKEN_KEY);
      localStorage.removeItem(TOKEN_TYPE_KEY);
    } catch {
      /* storage unavailable */
    }
  }

  /** Clear guest credentials only (leave registered-user tokens intact). */
  clearGuestAccess(): void {
    try {
      localStorage.removeItem(GUEST_ACCESS_TOKEN_KEY);
      if (this.getTokenType() === 'guest' || !this.getRefreshToken()) {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(TOKEN_TYPE_KEY);
      }
    } catch {
      /* storage unavailable */
    }
  }

  getAccessToken(): string | null {
    try {
      const user = this.load();
      if (user?.access) return user.access;
      return (
        localStorage.getItem(ACCESS_TOKEN_KEY) ||
        localStorage.getItem(GUEST_ACCESS_TOKEN_KEY)
      );
    } catch {
      return null;
    }
  }

  /** User access JWT only: guest tokens are rejected by venue/notification sockets. */
  getUserAccessToken(): string | null {
    return this.load()?.access ?? null;
  }

  getGuestAccessToken(): string | null {
    try {
      return localStorage.getItem(GUEST_ACCESS_TOKEN_KEY);
    } catch {
      return null;
    }
  }

  getRefreshToken(): string | null {
    try {
      return localStorage.getItem(REFRESH_TOKEN_KEY);
    } catch {
      return null;
    }
  }

  getTokenType(): StoredTokenType | null {
    try {
      if (this.load()) return 'user';
      const type = localStorage.getItem(TOKEN_TYPE_KEY);
      if (type === 'guest' || type === 'user') return type;
      if (this.getGuestAccessToken() || this.getAccessToken()) return 'guest';
      return null;
    } catch {
      return null;
    }
  }

  isGuestToken(): boolean {
    return this.getTokenType() === 'guest';
  }

  hasAccessToken(): boolean {
    return Boolean(this.getAccessToken());
  }
}

export const tokenLocalDatasource = new TokenLocalDatasource();
