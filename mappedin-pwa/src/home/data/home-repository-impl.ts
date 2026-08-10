import type { ReturningHomeContent } from '../domain/entities';
import type { HomeRepository } from '../domain/repositories/home-repository';
import {
  homeLocalDatasource,
  type HomeLocalDatasource,
} from './datasources/home-local-datasource';

export class HomeRepositoryImpl implements HomeRepository {
  constructor(private readonly datasource: HomeLocalDatasource = homeLocalDatasource) {}

  getReturningHomeContent(): Promise<ReturningHomeContent> {
    return this.datasource.fetchReturningHomeContent();
  }
}

export const homeRepository = new HomeRepositoryImpl();
