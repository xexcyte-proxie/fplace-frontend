import bundledVenues from '../local-venues.json';
import type { ForumVenue, PaginatedList } from '../../domain/entities';

/** Bundled metadata only; SDK map bundles and credentials have separate lifecycles. */
export class VenuesLocalDatasource {
  private readonly venues: ForumVenue[];
  private readonly byId: Map<number, ForumVenue>;

  constructor(records: readonly ForumVenue[] = bundledVenues) {
    this.byId = new Map();
    for (const record of records) {
      if (record.name.trim().toUpperCase() === 'LTV8') continue;
      if (!Number.isSafeInteger(record.id) || record.id <= 0 || !record.name.trim()) {
        throw new Error('Local venue metadata has an invalid ID or name.');
      }
      if (this.byId.has(record.id)) {
        throw new Error(`Local venue metadata has duplicate venue ID ${record.id}.`);
      }
      // Distinct backend venues can share a map. Preserve their separate IDs.
      this.byId.set(record.id, { ...record });
    }
    this.venues = [...this.byId.values()];
  }

  async listVenues(page = 1): Promise<PaginatedList<ForumVenue>> {
    if (!Number.isSafeInteger(page) || page < 1) {
      throw new Error('Invalid venue page.');
    }
    return {
      count: this.venues.length,
      next: null,
      previous: null,
      results: page === 1 ? this.venues.map((venue) => ({ ...venue })) : [],
    };
  }

  async getVenue(venueId: number): Promise<ForumVenue> {
    const venue = this.byId.get(venueId);
    if (!venue) throw new Error('Could not load that venue.');
    return { ...venue };
  }
}

export const venuesLocalDatasource = new VenuesLocalDatasource();
