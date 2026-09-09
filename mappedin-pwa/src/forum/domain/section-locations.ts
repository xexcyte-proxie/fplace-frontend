/**
 * Pure domain helpers that link map locations (identified by name slugs such
 * as `church` or `ltv-compound`) to forum sections from the backend.
 *
 * Map markers and the venue feed both need this mapping: posts carry a
 * numeric `section` id, while taps on the map produce a location slug.
 */

export interface SectionLocationRef {
  id: number;
  name: string;
  code?: string | null;
}

/** Canonical slug for a map/section name (`LTV Compound` → `ltv-compound`). */
export function slugifyLocationName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Lookup keyed by every identifier a location can arrive as:
 * the section id string, the section-name slug, and the section-code slug.
 */
export function buildSectionLocationIndex(
  sections: readonly SectionLocationRef[],
): Map<string, number> {
  const index = new Map<string, number>();
  for (const section of sections) {
    index.set(String(section.id), section.id);
    const nameSlug = slugifyLocationName(section.name);
    if (nameSlug) index.set(nameSlug, section.id);
    const codeSlug = section.code ? slugifyLocationName(section.code) : '';
    if (codeSlug) index.set(codeSlug, section.id);
  }
  return index;
}

/**
 * Resolve a tapped map location (slug or raw section id string) to a forum
 * section id. Returns null when the location matches no known section.
 */
export function sectionIdForLocation(
  sections: readonly SectionLocationRef[],
  locationId: string | null | undefined,
): number | null {
  if (!locationId) return null;
  const index = buildSectionLocationIndex(sections);
  return (
    index.get(locationId) ?? index.get(slugifyLocationName(locationId)) ?? null
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
