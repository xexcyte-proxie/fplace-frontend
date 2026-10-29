import type { MapData } from '@mappedin/mappedin-js';
import type { RouteCoordinate } from '../../types';
import { collectLocationAnchors } from '../../map/location-anchors';
import { serializeCoordinate } from '../../utils/route-helpers';

export interface VenueSimulationAnchor {
  coordinate: RouteCoordinate;
  source: 'selected-section' | 'exterior-entrance' | 'mapped-space';
  objectId: string;
  name?: string;
}

/** Choose a real SDK map object, never a route point, camera target or catalog pin. */
export function resolveVenueSimulationAnchor(
  mapData: MapData,
  floorId?: string,
  selectedLocationId?: string | null,
): VenueSimulationAnchor | null {
  const candidate = (object: unknown, source: VenueSimulationAnchor['source'], objectId: string, name?: string): VenueSimulationAnchor | null => {
    const coordinate = serializeCoordinate(object);
    if (!coordinate || Math.abs(coordinate.latitude) > 90 || Math.abs(coordinate.longitude) > 180 ||
        !coordinate.floorId || coordinate.floorId === 'unknown' || (floorId && coordinate.floorId !== floorId)) return null;
    return { coordinate, source, objectId, name };
  };
  if (selectedLocationId) {
    const selected = collectLocationAnchors(mapData).find(a => a.locationId === selectedLocationId || a.id === selectedLocationId);
    if (selected) {
      const result = candidate(selected.anchor, 'selected-section', selected.id, selected.name);
      if (result) return result;
    }
  }
  // Stable ids prevent catalog/SDK enumeration order from choosing a different origin.
  const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
  for (const door of [...mapData.getByType('door')].filter(d => d.isExterior).sort(byId)) {
    const result = candidate(door, 'exterior-entrance', door.id, door.name);
    if (result) return result;
  }
  for (const space of [...mapData.getByType('space')].sort(byId)) {
    const result = candidate(space, 'mapped-space', space.id, space.name);
    if (result) return result;
  }
  return null;
}
