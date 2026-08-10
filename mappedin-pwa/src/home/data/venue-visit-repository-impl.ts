import type { VenueVisitRepository } from '../domain/repositories/venue-visit-repository';
import {
  venueVisitLocalDatasource,
  type VenueVisitLocalDatasource,
} from './datasources/venue-visit-local-datasource';

export class VenueVisitRepositoryImpl implements VenueVisitRepository {
  constructor(
    private readonly datasource: VenueVisitLocalDatasource = venueVisitLocalDatasource,
  ) {}

  hasVisited(venueId: string): boolean {
    return this.datasource.has(venueId);
  }

  markVisited(venueId: string): void {
    this.datasource.mark(venueId);
  }

  listVisited(): string[] {
    return this.datasource.list();
  }

  clear(): void {
    this.datasource.clear();
  }
}

export const venueVisitRepository = new VenueVisitRepositoryImpl();
