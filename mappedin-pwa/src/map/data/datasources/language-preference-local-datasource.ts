const LANGUAGE_PREFERENCE_KEY = 'fplaces_map_language';

export class LanguagePreferenceLocalDatasource {
  load(): string | null {
    try {
      const value = localStorage.getItem(LANGUAGE_PREFERENCE_KEY)?.trim();
      return value || null;
    } catch {
      return null;
    }
  }

  save(code: string): void {
    const trimmed = code.trim();
    if (!trimmed) return;
    try {
      localStorage.setItem(LANGUAGE_PREFERENCE_KEY, trimmed);
    } catch {
      /* storage unavailable */
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(LANGUAGE_PREFERENCE_KEY);
    } catch {
      /* storage unavailable */
    }
  }
}

export const languagePreferenceLocalDatasource =
  new LanguagePreferenceLocalDatasource();
