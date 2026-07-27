/** ISO 639-1 language entry from Mappedin enterprise venue data. */
export interface MapLanguage {
  code: string;
  name: string;
}

/**
 * Persisted TMVF / binary map bundle for offline hydrate.
 * `file` is a Mappedin `THydrateMapDataBundle` at runtime.
 */
export interface OfflineMapCacheRecord {
  mapId: string;
  file: unknown;
  savedAt: number;
}
