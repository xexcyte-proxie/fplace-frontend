export interface AppPreferences {
  notificationsEnabled: boolean;
  simulationEnabled: boolean;
}

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  notificationsEnabled: true,
  simulationEnabled: true,
};
