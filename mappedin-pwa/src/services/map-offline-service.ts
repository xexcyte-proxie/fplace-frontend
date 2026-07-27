/**
 * Map offline façade — UI / MapApp talk to this module only for map data resolve + cache IO.
 */
import {
  getMapData,
  hydrateMapData,
  type MapData,
  type TGetMapDataOptions,
  type THydrateMapDataBundle,
} from '@mappedin/mappedin-js';

import { mapOfflineRepository } from '../map/data/map-offline-repository-impl';
import type { MapOfflineRepository } from '../map/domain/repositories/map-offline-repository';

export type ResolveMapDataResult = {
  mapData: MapData;
  fromCache: boolean;
};

function isBinaryBundle(value: unknown): value is THydrateMapDataBundle {
  if (!value || typeof value !== 'object') return false;
  const bundle = value as Record<string, unknown>;
  return bundle.type === 'binary' && bundle.main instanceof Uint8Array;
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

export async function loadCachedMapData(
  mapId: string,
  repository: MapOfflineRepository = mapOfflineRepository,
): Promise<THydrateMapDataBundle | null> {
  const record = await repository.get(mapId);
  if (!record || !isBinaryBundle(record.file)) return null;
  return record.file;
}

export async function saveMapDataToCache(
  mapData: MapData,
  mapId: string,
  repository: MapOfflineRepository = mapOfflineRepository,
): Promise<void> {
  try {
    const bundle = await mapData.toBinaryBundle({ downloadLanguagePacks: true });
    if (!bundle || !isBinaryBundle(bundle)) return;
    await repository.put({
      mapId,
      file: bundle,
      savedAt: Date.now(),
    });
  } catch {
    /* cache write is best-effort */
  }
}

export async function deleteCachedMapData(
  mapId: string,
  repository: MapOfflineRepository = mapOfflineRepository,
): Promise<void> {
  await repository.delete(mapId);
}

async function hydrateFromCache(
  mapId: string,
  options: TGetMapDataOptions,
  repository: MapOfflineRepository,
): Promise<MapData> {
  const cached = await loadCachedMapData(mapId, repository);
  if (!cached) {
    throw new Error(
      'Map is unavailable offline. Open once while online to cache it.',
    );
  }

  try {
    return await hydrateMapData(cached, options);
  } catch (error) {
    await deleteCachedMapData(mapId, repository);
    throw error;
  }
}

/**
 * Prefer a fresh network load when online; fall back to IndexedDB TMVF cache.
 * When offline, hydrate from cache only.
 */
export async function resolveMapData(
  options: TGetMapDataOptions & { mapId: string },
  repository: MapOfflineRepository = mapOfflineRepository,
): Promise<ResolveMapDataResult> {
  const { mapId } = options;

  if (isOnline()) {
    try {
      const mapData = await getMapData(options);
      void saveMapDataToCache(mapData, mapId, repository);
      return { mapData, fromCache: false };
    } catch (networkError) {
      try {
        const mapData = await hydrateFromCache(mapId, options, repository);
        return { mapData, fromCache: true };
      } catch {
        throw networkError;
      }
    }
  }

  const mapData = await hydrateFromCache(mapId, options, repository);
  return { mapData, fromCache: true };
}
