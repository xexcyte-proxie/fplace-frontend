import type { HomeExperience } from '../home/domain/entities';
import {
  productTourStepAt,
  stepsForHomeExperience,
  type ProductTourStep,
} from '../tour/domain/entities';
import { productTourRepository } from '../tour/data/product-tour-repository-impl';

export type { ProductTourStep, ProductTourSurface } from '../tour/domain/entities';
export {
  nextProductTourIndex,
  previousProductTourIndex,
  shouldAutoStartProductTour,
  stepsForHomeExperience,
} from '../tour/domain/entities';

export function hasCompletedProductTour(): boolean {
  return productTourRepository.hasCompleted();
}

export function markProductTourCompleted(): void {
  productTourRepository.markCompleted();
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
