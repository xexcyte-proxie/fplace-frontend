import type { AppPreferences } from '../settings/domain/entities';
import { appPreferencesLocalDatasource } from '../settings/data/datasources/app-preferences-local-datasource';

export type { AppPreferences };

export function loadAppPreferences(): AppPreferences {
  return appPreferencesLocalDatasource.load();
}

export function saveAppPreferences(
  preferences: AppPreferences,
): void {
  appPreferencesLocalDatasource.save(preferences);
}

export function patchAppPreferences(
  partial: Partial<AppPreferences>,
): AppPreferences {
  return appPreferencesLocalDatasource.patch(partial);
}
