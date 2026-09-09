import type { PermissionChoice } from '../../domain/permission-choice';

const STORAGE_PREFIX = 'fplaces.permissionChoice.';

function read(key: string): PermissionChoice {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (raw === 'granted' || raw === 'denied') return raw;
  } catch {
    /* private mode / blocked storage */
  }
  return 'undecided';
}

function write(key: string, choice: PermissionChoice): void {
  try {
    if (choice === 'undecided') {
      localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
      return;
    }
    localStorage.setItem(`${STORAGE_PREFIX}${key}`, choice);
  } catch {
    /* private mode / blocked storage */
  }
}

/** Persist first-choice location / camera / motion so we do not re-prompt. */
export const permissionChoiceLocalDatasource = {
  loadLocation(): PermissionChoice {
    return read('location');
  },
  saveLocation(choice: PermissionChoice): void {
    write('location', choice);
  },
  loadCamera(): PermissionChoice {
    return read('camera');
  },
  saveCamera(choice: PermissionChoice): void {
    write('camera', choice);
  },
  loadMotion(): PermissionChoice {
    return read('motion');
  },
  saveMotion(choice: PermissionChoice): void {
    write('motion', choice);
  },
  clearAll(): void {
    write('location', 'undecided');
    write('camera', 'undecided');
    write('motion', 'undecided');
  },
  clearCameraAndMotion(): void {
    write('camera', 'undecided');
    write('motion', 'undecided');
  },
};
