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
    expect(html).toContain('id="product-tour-dont-show"');
    expect(html).toContain("Don't show this again");
    expect(html).toContain('Next');
    expect(html).not.toContain('id="product-tour-back-btn"');
    expect(html).toContain(`1 of ${steps.length}`);
    expect(html).not.toMatch(/id="product-tour-dont-show"[^>]*\schecked/);
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

  it('checks don’t show again from the enabled preference', () => {
    const steps = stepsForHomeExperience('first-visit');
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
