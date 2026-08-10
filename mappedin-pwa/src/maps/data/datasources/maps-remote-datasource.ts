import { apiRequest } from '../../../auth/data/datasources/api-client';
import type { MapsToken } from '../../domain/entities';

/**
 * Remote datasource for Mappedin token issuance.
 * OpenAPI documents GET /api/maps/token/ with an opaque 200 body.
 */
export class MapsRemoteDatasource {
  async getToken(): Promise<MapsToken> {
    const raw = await apiRequest<unknown>('/api/maps/token/', {
      method: 'GET',
      auth: true,
      fallbackError: 'Could not load map credentials.',
    });
    if (raw && typeof raw === 'object') {
      return raw as MapsToken;
    }
    return { token: typeof raw === 'string' ? raw : undefined };
  }
}

export const mapsRemoteDatasource = new MapsRemoteDatasource();
