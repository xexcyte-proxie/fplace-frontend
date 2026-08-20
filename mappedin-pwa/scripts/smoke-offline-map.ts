/**
 * Smoke test for Mappedin offline TMVF flow + resolveMapData.
 * Credentials come from POST /api/users/guest/ (no client Mappedin key/secret).
 * Run: npx tsx scripts/smoke-offline-map.ts
 */
import {
  getMapData,
  hydrateMapData,
  type MapData,
  type THydrateMapDataBundle,
} from '@mappedin/mappedin-js';

import type { OfflineMapCacheRecord } from '../src/map/domain/entities';
import type { MapOfflineRepository } from '../src/map/domain/repositories/map-offline-repository';
import {
  loadCachedMapData,
  resolveMapData,
  saveMapDataToCache,
} from '../src/services/map-offline-service';

const MAP_ID = '65c0ff7430b94e3fabd5bb8c';
const BACKEND = 'https://fplaces-backend.vercel.app';

class MemoryMapOfflineRepository implements MapOfflineRepository {
  private readonly store = new Map<string, OfflineMapCacheRecord>();

  async get(mapId: string): Promise<OfflineMapCacheRecord | null> {
    return this.store.get(mapId) ?? null;
  }

  async put(record: OfflineMapCacheRecord): Promise<void> {
    this.store.set(record.mapId, record);
  }

  async delete(mapId: string): Promise<void> {
    this.store.delete(mapId);
  }

  size(): number {
    return this.store.size;
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

function setOnline(online: boolean): void {
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: online },
    configurable: true,
    writable: true,
  });
}

async function obtainGuestMappedinAccessToken(): Promise<string> {
  const response = await fetch(`${BACKEND}/api/users/guest/`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ip_address: '127.0.0.1',
      device_fingerprint: `fp_smoke_${Date.now()}`,
    }),
  });
  if (!response.ok) {
    throw new Error(`Guest token failed: HTTP ${response.status}`);
  }
  const body = (await response.json()) as {
    mappedin?: { token?: string };
  };
  const token = body.mappedin?.token?.trim();
  if (!token) {
    throw new Error('Guest response missing mappedin.token');
  }
  return token;
}

async function waitForCache(
  repo: MemoryMapOfflineRepository,
  mapId: string,
  timeoutMs = 60_000,
): Promise<THydrateMapDataBundle> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const cached = await loadCachedMapData(mapId, repo);
    if (cached) return cached;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Timed out waiting for map cache write');
}

async function main(): Promise<void> {
  console.log('0) Obtain Mappedin access token from guest API…');
  const accessToken = await obtainGuestMappedinAccessToken();
  const OPTIONS = {
    accessToken,
    mapId: MAP_ID,
  };
  console.log('   ok - using backend mappedin.token');

  const repo = new MemoryMapOfflineRepository();
  let passed = 0;

  console.log('1) Online resolveMapData (getMapData + cache write)…');
  setOnline(true);
  const online = await resolveMapData(OPTIONS, repo);
  assert(!online.fromCache, 'online load should not be fromCache');
  assert(online.mapData, 'online mapData missing');
  console.log('   ok - fromCache=false');
  passed += 1;

  console.log('2) Wait for background toBinaryBundle cache…');
  const bundle = await waitForCache(repo, OPTIONS.mapId);
  assert(bundle.type === 'binary', 'cached bundle type should be binary');
  assert(bundle.main instanceof Uint8Array, 'cached bundle.main should be Uint8Array');
  assert(bundle.main.byteLength > 0, 'cached bundle should be non-empty');
  console.log(`   ok - cached ${bundle.main.byteLength} bytes`);
  passed += 1;

  console.log('3) Offline resolveMapData (hydrate from cache)…');
  setOnline(false);
  const offline = await resolveMapData(OPTIONS, repo);
  assert(offline.fromCache, 'offline load should be fromCache');
  assert(offline.mapData, 'offline mapData missing');
  console.log('   ok - fromCache=true');
  passed += 1;

  console.log('4) Offline with empty cache throws…');
  const emptyRepo = new MemoryMapOfflineRepository();
  setOnline(false);
  let threw = false;
  try {
    await resolveMapData(OPTIONS, emptyRepo);
  } catch (error) {
    threw = true;
    const message = error instanceof Error ? error.message : String(error);
    assert(
      message.includes('unavailable offline'),
      `expected offline error, got: ${message}`,
    );
  }
  assert(threw, 'empty offline cache should throw');
  console.log('   ok - throws helpful error');
  passed += 1;

  console.log('5) Direct hydrateMapData round-trip…');
  setOnline(true);
  const fresh: MapData = await getMapData(OPTIONS);
  const scratch = new MemoryMapOfflineRepository();
  await saveMapDataToCache(fresh, OPTIONS.mapId, scratch);
  const saved = await loadCachedMapData(OPTIONS.mapId, scratch);
  assert(saved, 'saveMapDataToCache should persist a bundle');
  const hydrated = await hydrateMapData(saved, OPTIONS);
  assert(hydrated, 'hydrateMapData should return MapData');
  console.log('   ok - getMapData → toBinaryBundle → hydrateMapData');
  passed += 1;

  console.log(`\nAll ${passed} checks passed.`);
  process.exit(0);
}

main().catch((error) => {
  console.error('\nSmoke test failed:', error);
  process.exit(1);
});
