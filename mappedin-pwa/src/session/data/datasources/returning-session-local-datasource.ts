import type { ReturningSessionSnapshot } from '../../domain/entities';

const STORAGE_KEY = 'fplaces_returning_session';

/**
 * Local persistence for returning-user recognition (onboarding + last venue).
 */
export class ReturningSessionLocalDatasource {
  load(): ReturningSessionSnapshot | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<ReturningSessionSnapshot>;
      if (!parsed || typeof parsed !== 'object') return null;
      if (parsed.onboardingComplete !== true) return null;
      if (parsed.mode !== 'auth' && parsed.mode !== 'guest') return null;
      return {
        onboardingComplete: true,
        mode: parsed.mode,
        selectedVenueId:
          typeof parsed.selectedVenueId === 'string'
            ? parsed.selectedVenueId
            : null,
        selectedGateId:
          typeof parsed.selectedGateId === 'string'
            ? parsed.selectedGateId
            : null,
        guestId: typeof parsed.guestId === 'string' ? parsed.guestId : null,
      };
    } catch {
      return null;
    }
  }

  save(snapshot: ReturningSessionSnapshot): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      /* storage unavailable */
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
  }
}

export const returningSessionLocalDatasource =
  new ReturningSessionLocalDatasource();
