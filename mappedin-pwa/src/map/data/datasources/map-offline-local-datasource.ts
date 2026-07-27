import type { OfflineMapCacheRecord } from '../../domain/entities';

const DB_NAME = 'fplaces-mappedin';
const DB_VERSION = 1;
const STORE_NAME = 'mapData';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(request.error ?? new Error('Failed to open map cache database'));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'mapId' });
      }
    };
  });
}

function runStoreRequest<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        const request = run(store);

        request.onerror = () => {
          reject(request.error ?? new Error('Map cache request failed'));
        };

        request.onsuccess = () => {
          resolve(request.result);
        };

        tx.oncomplete = () => {
          db.close();
        };

        tx.onerror = () => {
          db.close();
        };

        tx.onabort = () => {
          db.close();
        };
      }),
  );
}

function isCacheRecord(value: unknown): value is OfflineMapCacheRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.mapId === 'string' &&
    record.file != null &&
    typeof record.savedAt === 'number'
  );
}

export class MapOfflineLocalDatasource {
  async get(mapId: string): Promise<OfflineMapCacheRecord | null> {
    try {
      const result = await runStoreRequest('readonly', (store) => store.get(mapId));
      return isCacheRecord(result) ? result : null;
    } catch {
      return null;
    }
  }

  async put(record: OfflineMapCacheRecord): Promise<void> {
    try {
      await runStoreRequest('readwrite', (store) => store.put(record));
    } catch {
      /* storage unavailable or quota exceeded — do not fail map load */
    }
  }

  async delete(mapId: string): Promise<void> {
    try {
      await runStoreRequest('readwrite', (store) => store.delete(mapId));
    } catch {
      /* storage unavailable */
    }
  }
}

export const mapOfflineLocalDatasource = new MapOfflineLocalDatasource();
