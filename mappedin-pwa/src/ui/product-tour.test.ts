import { describe, expect, it } from 'vitest';

import {
  initialProductTourSteps,
  PRODUCT_TOUR_STEPS,
  contextualProductTourStep,
  stepsForHomeExperience,
} from '../tour/domain/entities';
import { buildProductTourCardView } from '../tour/presentation/product-tour-view';
import { renderProductTour } from './product-tour';

describe('product tour overlay', () => {
  it('renders skip, next, and the first-step copy', () => {
    const steps = initialProductTourSteps();
    const step = steps[0]!;
    const html = renderProductTour({ step, index: 0, total: steps.length });

    expect(html).toContain('Navigate');
    expect(html).not.toContain('product-tour--center');
    expect(html).toContain('id="product-tour-skip-btn"');
    expect(html).toContain('id="product-tour-next-btn"');
    expect(html).toContain('id="product-tour-dont-show"');
    expect(html).toContain("Don't show this again");
    expect(html).toContain('Next');
    expect(html).not.toContain('id="product-tour-back-btn"');
    expect(html).toContain(`1 of ${steps.length}`);
    expect(html).not.toMatch(/id="product-tour-dont-show"[^>]*\schecked/);
  });

  it('uses Got it on the last step and shows Back', () => {
    const steps = initialProductTourSteps();
    const last = steps.length - 1;
    const html = renderProductTour({
      step: steps[last]!,
      index: last,
      total: steps.length,
    });

    expect(html).toContain('Got it');
    expect(html).toContain('id="product-tour-back-btn"');
    expect(html).toContain('data-tour-target="#nav-social"');
  });

  it('checks don’t show again from the enabled preference', () => {
    const steps = initialProductTourSteps();
    const html = renderProductTour({
      step: steps[0]!,
      index: 0,
      total: steps.length,
      dontShowAgain: true,
    });
    expect(html).toMatch(/id="product-tour-dont-show"[^>]*\schecked/);
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

  it('keeps tour hooks used by ui-root-events', () => {
    const steps = stepsForHomeExperience('first-visit');
    const html = renderProductTour({
      step: steps[1]!,
      index: 1,
      total: steps.length,
    });
    expect(html).toContain('id="product-tour-scrim"');
    expect(html).toContain('id="product-tour-skip-btn"');
    expect(html).toContain('id="product-tour-back-btn"');
    expect(html).toContain('id="product-tour-next-btn"');
    expect(html).toContain('id="product-tour-dont-show"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="product-tour-title"');
    expect(html).toContain('aria-describedby="product-tour-body"');
    expect(html).toContain('Skip');
    expect(html).toContain('data-tour-card');
  });

  it('escapes title, body, and target selector that look like HTML', () => {
    const html = renderProductTour({
      step: {
        id: 'escape',
        title: '<img src=x>',
        body: '<b>hi</b>',
        targetSelector: '#x"[onclick=alert(1)]',
        placement: 'bottom',
        surface: 'home',
        audience: 'any',
      },
      index: 0,
      total: 2,
    });
    expect(html).toContain('&lt;img src=x&gt;');
    expect(html).toContain('&lt;b&gt;hi&lt;/b&gt;');
    expect(html).toContain('data-tour-target="#x&quot;[onclick=alert(1)]"');
    expect(html).not.toContain('<img src=x>');
    expect(html).not.toContain('<b>hi</b>');
  });
});

it('includes the saved opt-out control on every tour card, including AR', () => {
  for (const step of PRODUCT_TOUR_STEPS) {
    const html = renderProductTour({ step, index: 0, total: 1, dontShowAgain: true });
    expect(html).toContain("Don't show this again");
    expect(html).toMatch(/id="product-tour-dont-show"[^>]*\schecked/);
  }
});
it('explains the top AR map icon and marks the live AR tour surface', () => {
  const step = contextualProductTourStep('ar-map-view')!;
  const html = renderProductTour({ step, index: 0, total: 1 });
  expect(html).toContain('data-tour-surface="ar"');
  expect(html).toContain('Tap Map to minimize AR');
  expect(html).toContain('Tap the small AR view to expand it');
  expect(stepsForHomeExperience('first-visit').some(s => s.id === step.id)).toBe(false);
});
