import type { ProductTourStep } from '../domain/entities';

export interface ProductTourCardView {
  title: string;
  body: string;
  stepLabel: string;
  primaryLabel: string;
  showBack: boolean;
  isLast: boolean;
  targetSelector: string;
  placement: ProductTourStep['placement'];
  total: number;
  index: number;
}

export function buildProductTourCardView(options: {
  step: ProductTourStep;
  index: number;
  total: number;
}): ProductTourCardView {
  const isLast = options.total > 0 && options.index >= options.total - 1;
  return {
    title: options.step.title,
    body: options.step.body,
    stepLabel: `${options.index + 1} of ${options.total}`,
    primaryLabel: isLast ? 'Got it' : 'Next',
    showBack: options.index > 0,
    isLast,
    targetSelector: options.step.targetSelector,
    placement: options.step.placement,
    total: options.total,
    index: options.index,
  };
}
