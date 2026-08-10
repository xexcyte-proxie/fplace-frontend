import type { ReturningHomeContent } from '../entities';

/**
 * Contract for returning-user home content (recent venues + stats).
 */
export interface HomeRepository {
  getReturningHomeContent(): Promise<ReturningHomeContent>;
}
