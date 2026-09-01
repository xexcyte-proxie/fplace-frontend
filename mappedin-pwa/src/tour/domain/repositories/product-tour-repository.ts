/** Persisted “already saw the product tour” flag. */
export interface ProductTourRepository {
  hasCompleted(): boolean;
  markCompleted(): void;
  clear(): void;
}
