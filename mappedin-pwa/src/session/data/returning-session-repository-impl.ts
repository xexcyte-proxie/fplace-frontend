import type { ReturningSessionSnapshot } from '../domain/entities';
import type { ReturningSessionRepository } from '../domain/repositories/returning-session-repository';
import {
  returningSessionLocalDatasource,
  type ReturningSessionLocalDatasource,
} from './datasources/returning-session-local-datasource';

export class ReturningSessionRepositoryImpl
  implements ReturningSessionRepository
{
  constructor(
    private readonly datasource: ReturningSessionLocalDatasource = returningSessionLocalDatasource,
  ) {}

  load(): ReturningSessionSnapshot | null {
    return this.datasource.load();
  }

  save(snapshot: ReturningSessionSnapshot): void {
    this.datasource.save(snapshot);
  }

  clear(): void {
    this.datasource.clear();
  }
}

export const returningSessionRepository = new ReturningSessionRepositoryImpl();
