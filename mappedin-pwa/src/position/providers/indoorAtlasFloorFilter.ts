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

export class IndoorAtlasFloorFilter {
  private expectedFloorId: string | null = null;
  private readonly levelToFloorId = new Map<number, string>();
  private readonly floorCertaintyMin: number;

  constructor(
    venueMapId = appConfig.mappedin.mapId,
    floorCertaintyMin = appConfig.positioning.indoorAtlasFloorCertaintyMin,
  ) {
    this.floorCertaintyMin = floorCertaintyMin;
    const map = floorMapData as VenueFloorMap;
    if (map.venueMapId === venueMapId) {
      for (const entry of map.floors) {
        this.levelToFloorId.set(entry.iaLevel, entry.mappedinFloorId);
      }
    }
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
