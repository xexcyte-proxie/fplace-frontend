import type { OfflineMapCacheRecord } from '../domain/entities';
import type { MapOfflineRepository } from '../domain/repositories/map-offline-repository';
import {
  mapOfflineLocalDatasource,
  type MapOfflineLocalDatasource,
} from './datasources/map-offline-local-datasource';

export class MapOfflineRepositoryImpl implements MapOfflineRepository {
  constructor(
    private readonly localDatasource: MapOfflineLocalDatasource = mapOfflineLocalDatasource,
  ) {}

  get(mapId: string): Promise<OfflineMapCacheRecord | null> {
    return this.localDatasource.get(mapId);
  }

  put(record: OfflineMapCacheRecord): Promise<void> {
    return this.localDatasource.put(record);
  }

  delete(mapId: string): Promise<void> {
    return this.localDatasource.delete(mapId);
  }
}

export const mapOfflineRepository = new MapOfflineRepositoryImpl();
