import type {
  GuestSession,
  GuestSessionPreferences,
} from '../../domain/entities';

const SESSION_KEY = 'fplaces_guest_session';

/**
 * Persists guest trial metadata + MappedIn token (JWT access lives in token store).
 */
export class GuestSessionLocalDatasource {
  load(): GuestSession | null {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as GuestSession;
      if (!parsed?.access || !parsed?.mappedin?.token) {
        return null;
      }
      return {
        ...parsed,
        hasTriedArView: parsed.hasTriedArView === true,
        hasTried2dView: parsed.hasTried2dView === true,
        trialExpiresAt: parsed.trialExpiresAt ?? '',
      };
    } catch {
      return null;
    }
  }

  save(session: GuestSession): void {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      /* storage unavailable */
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      /* storage unavailable */
    }
  }

  getMappedinToken(): string | null {
    return this.load()?.mappedin.token ?? null;
  }

  getTrialExpiresAt(): string | null {
    return this.load()?.trialExpiresAt || null;
  }

  getPreferences(): GuestSessionPreferences {
    const session = this.load();
    return {
      hasTriedArView: session?.hasTriedArView === true,
      hasTried2dView: session?.hasTried2dView === true,
    };
  }

  patchPreferences(preferences: GuestSessionPreferences): void {
    const session = this.load();
    if (!session) return;
    this.save({
      ...session,
      hasTriedArView: preferences.hasTriedArView,
      hasTried2dView: preferences.hasTried2dView,
    });
  }

  isTrialExpired(now = new Date()): boolean {
    const expiresAt = this.getTrialExpiresAt();
    if (!expiresAt) return false;
    const ms = Date.parse(expiresAt);
    if (!Number.isFinite(ms)) return false;
    return ms <= now.getTime();
  }
}

export const guestSessionLocalDatasource = new GuestSessionLocalDatasource();
