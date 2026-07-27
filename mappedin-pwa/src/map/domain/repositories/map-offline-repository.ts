import type { OfflineMapCacheRecord } from '../entities';

export interface MapOfflineRepository {
  get(mapId: string): Promise<OfflineMapCacheRecord | null>;
  put(record: OfflineMapCacheRecord): Promise<void>;
  delete(mapId: string): Promise<void>;
}
