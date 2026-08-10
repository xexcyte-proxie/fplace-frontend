import type { MapsToken } from '../entities';

export interface MapsRepository {
  getToken(): Promise<MapsToken>;
}
