import type { AuthTokens } from '../../domain/entities';

const ACCESS_TOKEN_KEY = 'fplaces_access_token';
const REFRESH_TOKEN_KEY = 'fplaces_refresh_token';

export class TokenLocalDatasource {
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
    } catch {
      /* storage unavailable */
    }
  }

  getAccessToken(): string | null {
    try {
      return localStorage.getItem(ACCESS_TOKEN_KEY);
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
}

export const tokenLocalDatasource = new TokenLocalDatasource();
