/**
 * Join map locations to forum sections by stable ids.
 *
 * Map taps send a Mappedin location id. Forum sections expose that same value
 * as `mappedinLocationId`. Name slugs are not used for this join.
 */

export interface SectionLocationRef {
  id: number;
  name: string;
  code?: string | null;
  mappedinLocationId?: string | null;
  is_active?: boolean;
}

/** Canonical slug for a map/section name (`LTV Compound` → `ltv-compound`). */
export function slugifyLocationName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeLocationId(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed || null;
}

/**
 * Lookup keyed by forum section id and Mappedin location id.
 */
export function buildSectionLocationIndex(
  sections: readonly SectionLocationRef[],
): Map<string, number> {
  const index = new Map<string, number>();
  for (const section of sections) {
    index.set(String(section.id), section.id);
    const mappedinId = normalizeLocationId(section.mappedinLocationId);
    if (mappedinId) index.set(mappedinId, section.id);
  }
  return index;
}

/**
 * Resolve a tapped map location id (Mappedin location id or forum section id
 * string) to a forum section id. Returns null when nothing matches.
 */
export function sectionIdForLocation(
  sections: readonly SectionLocationRef[],
  locationId: string | null | undefined,
): number | null {
  const id = normalizeLocationId(locationId);
  if (!id) return null;
  return buildSectionLocationIndex(sections).get(id) ?? null;
}

/**
 * Map taps send a Mappedin location id. The visible name is display-only.
 */
export function sectionIdForMapLocation(
  sections: readonly SectionLocationRef[],
  locationId: string | null | undefined,
  _locationName?: string | null,
): number | null {
  return sectionIdForLocation(sections, locationId);
}

export function conversationLocationIdForSection(
  section: SectionLocationRef,
): string {
  return normalizeLocationId(section.mappedinLocationId) ?? String(section.id);
}

/** Location ids to fetch when All should list every section conversation. */
export function conversationLocationIdsForSections(
  sections: readonly SectionLocationRef[],
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const section of sections) {
    if (section.is_active === false) continue;
    const id = conversationLocationIdForSection(section);
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function sectionMatchesConversationLocation(
  section: SectionLocationRef,
  locationId: string | null | undefined,
): boolean {
  const id = normalizeLocationId(locationId);
  if (!id) return false;
  return (
    conversationLocationIdForSection(section) === id || String(section.id) === id
  );
}

/**
 * True when a post belongs on the current conversation.
 * Venue-wide view (`locationId` empty) accepts every post. A scoped view only
 * accepts posts tagged with that location's forum section.
 */
export function forumPostMatchesLocation(
  section: number | null | undefined,
  locationId: string | null | undefined,
  sections: readonly SectionLocationRef[],
): boolean {
  if (!locationId) return true;
  const sectionId = sectionIdForLocation(sections, locationId);
  if (sectionId == null) return false;
  return section === sectionId;
}
