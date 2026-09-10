import type { ProductTourPreference } from '../entities';

/** Persisted product-tour completion + enabled preference. */
export interface ProductTourRepository {
  load(): ProductTourPreference;
  save(preference: ProductTourPreference): void;
  clear(): void;
}
