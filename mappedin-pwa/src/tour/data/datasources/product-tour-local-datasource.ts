const STORAGE_KEY = 'fplaces_product_tour_completed';

/**
 * Local flag: this browser already finished (or skipped) the product tour.
 */
export class ProductTourLocalDatasource {
  hasCompleted(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  markCompleted(): void {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* storage unavailable */
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
  }
}

export const productTourLocalDatasource = new ProductTourLocalDatasource();
