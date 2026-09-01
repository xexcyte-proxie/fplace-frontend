import { describe, expect, it } from 'vitest';

import { stepsForHomeExperience } from '../tour/domain/entities';
import { buildProductTourCardView } from '../tour/presentation/product-tour-view';
import { renderProductTour } from './product-tour';

describe('product tour overlay', () => {
  it('renders skip, next, and the first-step copy', () => {
    const steps = stepsForHomeExperience('first-visit');
    const step = steps[0]!;
    const html = renderProductTour({ step, index: 0, total: steps.length });

    expect(html).toContain('Quick tour');
    expect(html).toContain('product-tour--center');
    expect(html).toContain('id="product-tour-skip-btn"');
    expect(html).toContain('id="product-tour-next-btn"');
    expect(html).toContain('Next');
    expect(html).not.toContain('id="product-tour-back-btn"');
    expect(html).toContain(`1 of ${steps.length}`);
  });

  it('uses Got it on the last step and shows Back', () => {
    const steps = stepsForHomeExperience('returning');
    const last = steps.length - 1;
    const html = renderProductTour({
      step: steps[last]!,
      index: last,
      total: steps.length,
    });

    expect(html).toContain('Got it');
    expect(html).toContain('id="product-tour-back-btn"');
    expect(html).toContain('data-tour-target="#profile-settings-btn"');
  });

  it('builds last-step view copy', () => {
    const steps = stepsForHomeExperience('first-visit');
    const view = buildProductTourCardView({
      step: steps[steps.length - 1]!,
      index: steps.length - 1,
      total: steps.length,
    });
    expect(view.primaryLabel).toBe('Got it');
    expect(view.showBack).toBe(true);
    expect(view.isLast).toBe(true);
  });
});
