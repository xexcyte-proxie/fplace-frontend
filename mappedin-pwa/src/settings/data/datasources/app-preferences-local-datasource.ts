import {
  DEFAULT_APP_PREFERENCES,
  type AppPreferences,
} from '../../domain/entities';

const PREFERENCES_KEY = 'fplaces_app_preferences';

export class AppPreferencesLocalDatasource {
  load(): AppPreferences {
    try {
      const raw = localStorage.getItem(PREFERENCES_KEY);
      if (!raw) return { ...DEFAULT_APP_PREFERENCES };
      const parsed = JSON.parse(raw) as Partial<AppPreferences>;
      return {
        notificationsEnabled:
          typeof parsed.notificationsEnabled === 'boolean'
            ? parsed.notificationsEnabled
            : DEFAULT_APP_PREFERENCES.notificationsEnabled,
        // Simulation mode is gone — never restore a leftover toggle.
        simulationEnabled: false,
      };
    } catch {
      return { ...DEFAULT_APP_PREFERENCES };
    }
  }

  save(preferences: AppPreferences): void {
    try {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
    } catch {
      /* storage unavailable */
    }
  }

  patch(partial: Partial<AppPreferences>): AppPreferences {
    const next = {
      ...this.load(),
      ...partial,
      simulationEnabled: false,
    };
    this.save(next);
    return next;
  }
}

export const appPreferencesLocalDatasource =
  new AppPreferencesLocalDatasource();
