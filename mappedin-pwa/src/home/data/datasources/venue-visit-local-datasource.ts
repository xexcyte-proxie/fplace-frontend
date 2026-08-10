const STORAGE_KEY = 'fplaces_visited_venues';

/**
 * Local persistence for venues the user has already entered.
 */
export class VenueVisitLocalDatasource {
  list(): string[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((id): id is string => typeof id === 'string' && id.trim() !== '')
        .map((id) => id.trim());
    } catch {
      return [];
    }
  }

  has(venueId: string): boolean {
    const id = venueId.trim();
    if (!id) return false;
    return this.list().includes(id);
  }

  mark(venueId: string): void {
    const id = venueId.trim();
    if (!id) return;
    const existing = this.list();
    if (existing.includes(id)) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...existing, id]));
    } catch {
      /* storage unavailable */
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
  }
}

export const venueVisitLocalDatasource = new VenueVisitLocalDatasource();
