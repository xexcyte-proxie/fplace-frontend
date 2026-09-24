import floorMapData from '../config/indoor-atlas-floor-map.json';
import { appConfig } from '../../config';

export interface FloorMapEntry {
  iaLevel: number;
  mappedinFloorId: string;
  label?: string;
}

export interface VenueFloorMap {
  venueMapId: string;
  floors: FloorMapEntry[];
}

export function validateVenueFloorMap(map: VenueFloorMap): string[] {
  const errors: string[] = [];
  if (!map.venueMapId.trim()) errors.push('missing_venue_map_id');
  if (map.floors.length === 0) errors.push('missing_floor_mappings');

  const levels = new Set<number>();
  const floorIds = new Set<string>();
  for (const entry of map.floors) {
    if (!Number.isInteger(entry.iaLevel)) errors.push('invalid_ia_level');
    if (!entry.mappedinFloorId.trim()) errors.push('missing_mappedin_floor_id');
    if (levels.has(entry.iaLevel)) errors.push('duplicate_ia_level');
    levels.add(entry.iaLevel);
    floorIds.add(entry.mappedinFloorId.trim());
  }
  if (map.floors.length > 1 && floorIds.size === 1) {
    errors.push('all_levels_map_to_one_floor');
  }
  return [...new Set(errors)];
}

export class IndoorAtlasFloorFilter {
  private expectedFloorId: string | null = null;
  private readonly levelToFloorId = new Map<number, string>();
  private readonly floorCertaintyMin: number;
  private readonly configured: boolean;

  constructor(
    venueMapId = appConfig.mappedin.mapId,
    floorCertaintyMin = appConfig.positioning.indoorAtlasFloorCertaintyMin,
  ) {
    this.floorCertaintyMin = floorCertaintyMin;
    const map = floorMapData as VenueFloorMap;
    this.configured =
      map.venueMapId === venueMapId && validateVenueFloorMap(map).length === 0;
    if (this.configured) {
      for (const entry of map.floors) {
        this.levelToFloorId.set(entry.iaLevel, entry.mappedinFloorId);
      }
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  setExpectedFloorId(floorId: string | null | undefined): void {
    this.expectedFloorId = floorId ?? null;
  }

  getExpectedFloorId(): string | null {
    return this.expectedFloorId;
  }

  resolveMappedinFloorId(iaLevel: number | null | undefined): string | undefined {
    if (iaLevel == null || Number.isNaN(iaLevel)) return undefined;
    return this.levelToFloorId.get(Math.trunc(iaLevel));
  }

  accept(
    iaLevel: number | null | undefined,
    floorCertainty?: number | null,
  ): { accepted: boolean; mappedinFloorId?: string; reason?: string } {
    if (iaLevel == null || Number.isNaN(iaLevel)) {
      return { accepted: false, reason: 'missing_floor_level' };
    }

    if (
      floorCertainty != null &&
      Number.isFinite(floorCertainty) &&
      floorCertainty < this.floorCertaintyMin
    ) {
      return { accepted: false, reason: 'low_floor_certainty' };
    }

    const mappedinFloorId = this.resolveMappedinFloorId(iaLevel);
    if (!mappedinFloorId) {
      return { accepted: false, reason: 'unmapped_ia_level' };
    }

    if (this.expectedFloorId && mappedinFloorId !== this.expectedFloorId) {
      return { accepted: false, reason: 'floor_level_mismatch', mappedinFloorId };
    }

    return { accepted: true, mappedinFloorId };
  }
}
