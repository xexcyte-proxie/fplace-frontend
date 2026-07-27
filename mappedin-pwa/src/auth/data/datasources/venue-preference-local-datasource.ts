import type { VenueSelection } from '../../domain/entities';
import { hasCompleteVenueSelection } from '../../domain/entities';

const VENUE_PREFERENCE_KEY = 'fplaces_venue_selection_by_user';

type PreferenceMap = Record<string, VenueSelection>;

function readMap(): PreferenceMap {
  try {
    const raw = localStorage.getItem(VENUE_PREFERENCE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PreferenceMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map: PreferenceMap): void {
  try {
    localStorage.setItem(VENUE_PREFERENCE_KEY, JSON.stringify(map));
  } catch {
    /* storage unavailable */
  }
}

export class VenuePreferenceLocalDatasource {
  load(userId: number): VenueSelection | null {
    const entry = readMap()[String(userId)];
    if (!hasCompleteVenueSelection(entry)) return null;
    return {
      venueId: entry.venueId.trim(),
      sectionId: entry.sectionId.trim(),
    };
  }

  save(userId: number, selection: VenueSelection): void {
    if (!hasCompleteVenueSelection(selection)) return;
    const map = readMap();
    map[String(userId)] = {
      venueId: selection.venueId.trim(),
      sectionId: selection.sectionId.trim(),
    };
    writeMap(map);
  }

  clear(userId: number): void {
    const map = readMap();
    delete map[String(userId)];
    writeMap(map);
  }
}

export const venuePreferenceLocalDatasource =
  new VenuePreferenceLocalDatasource();
