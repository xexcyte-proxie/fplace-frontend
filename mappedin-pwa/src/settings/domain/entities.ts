export interface AppPreferences {
  notificationsEnabled: boolean;
  /** Unused leftover; simulation mode is gone. Always false. */
  simulationEnabled: boolean;
}

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  notificationsEnabled: true,
  simulationEnabled: false,
};
