import {
  DEFAULT_PRODUCT_TOUR_PREFERENCE,
  type ProductTourPreference,
} from '../../domain/entities';

const PREFERENCE_KEY = 'fplaces_product_tour_preference';
const LEGACY_COMPLETED_KEY = 'fplaces_product_tour_completed';

function parsePreference(raw: string): ProductTourPreference | null {
  try {
    const parsed = JSON.parse(raw) as Partial<ProductTourPreference>;
    const completed = parsed.completed === true;
    const enabled =
      typeof parsed.enabled === 'boolean' ? parsed.enabled : !completed;
    return { completed, enabled };
  } catch {
    return null;
  }
}

/**
 * Local preference: whether this browser finished/opted out of the product tour
 * and whether auto-start is still allowed.
 */
export class ProductTourLocalDatasource {
  load(): ProductTourPreference {
    try {
      const raw = localStorage.getItem(PREFERENCE_KEY);
      if (raw) {
        return parsePreference(raw) ?? { ...DEFAULT_PRODUCT_TOUR_PREFERENCE };
      }
      if (localStorage.getItem(LEGACY_COMPLETED_KEY) === '1') {
        const migrated = { completed: true, enabled: false };
        this.save(migrated);
        localStorage.removeItem(LEGACY_COMPLETED_KEY);
        return migrated;
      }
      return { ...DEFAULT_PRODUCT_TOUR_PREFERENCE };
    } catch {
      return { ...DEFAULT_PRODUCT_TOUR_PREFERENCE };
    }
  }

  save(preference: ProductTourPreference): void {
    try {
      localStorage.setItem(PREFERENCE_KEY, JSON.stringify(preference));
      localStorage.removeItem(LEGACY_COMPLETED_KEY);
    } catch {
      /* storage unavailable */
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(PREFERENCE_KEY);
      localStorage.removeItem(LEGACY_COMPLETED_KEY);
    } catch {
      /* storage unavailable */
    }
  }
}

export const productTourLocalDatasource = new ProductTourLocalDatasource();
