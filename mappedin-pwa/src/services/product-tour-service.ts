import type { HomeExperience } from '../home/domain/entities';
import {
  productTourStepAt,
  stepsForHomeExperience,
  type ProductTourPreference,
  type ProductTourStep,
} from '../tour/domain/entities';
import { productTourRepository } from '../tour/data/product-tour-repository-impl';

export type {
  ProductTourPreference,
  ProductTourStep,
  ProductTourSurface,
} from '../tour/domain/entities';
export {
  isProductTourDontShowAgain,
  nextProductTourIndex,
  preferenceAfterProductTourEnable,
  preferenceAfterProductTourOptOut,
  previousProductTourIndex,
  shouldAutoStartProductTour,
  stepsForHomeExperience,
} from '../tour/domain/entities';

export function loadProductTourPreference(): ProductTourPreference {
  return productTourRepository.load();
}

export function saveProductTourPreference(
  preference: ProductTourPreference,
): void {
  productTourRepository.save(preference);
}

export function clearProductTourProgress(): void {
  productTourRepository.clear();
}

export function resolveProductTourStep(
  experience: HomeExperience,
  index: number,
): ProductTourStep | null {
  return productTourStepAt(stepsForHomeExperience(experience), index);
}
