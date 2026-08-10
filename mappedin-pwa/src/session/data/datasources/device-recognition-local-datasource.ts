const STORAGE_KEY = 'fplaces_device_has_used_app';

/**
 * Local flag: this browser has already been through first-run / auth at least once.
 */
export class DeviceRecognitionLocalDatasource {
  hasUsedApp(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  markUsed(): void {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
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

export const deviceRecognitionLocalDatasource =
  new DeviceRecognitionLocalDatasource();
