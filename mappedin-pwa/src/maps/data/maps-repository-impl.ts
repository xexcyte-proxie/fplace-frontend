import type { MapsToken } from '../domain/entities';
import type { MapsRepository } from '../domain/repositories/maps-repository';
import {
  mapsRemoteDatasource,
  type MapsRemoteDatasource,
} from './datasources/maps-remote-datasource';

export class MapsRepositoryImpl implements MapsRepository {
  constructor(
    private readonly datasource: MapsRemoteDatasource = mapsRemoteDatasource,
  ) {}

  getToken(): Promise<MapsToken> {
    return this.datasource.getToken();
  }
}

export const mapsRepository = new MapsRepositoryImpl();
