import type { ReturningSessionSnapshot } from '../entities';

export interface ReturningSessionRepository {
  load(): ReturningSessionSnapshot | null;
  save(snapshot: ReturningSessionSnapshot): void;
  clear(): void;
}
