import { describe, expect, it } from 'vitest';

import type { HomeExperience } from '../../home/domain/entities';
import {
  nextProductTourIndex,
  previousProductTourIndex,
  PRODUCT_TOUR_STEPS,
  productTourStepAt,
  shouldAutoStartProductTour,
  stepsForHomeExperience,
} from './entities';

describe('product tour steps', () => {
  it('keeps unique ids and a target or centered intro', () => {
    const ids = PRODUCT_TOUR_STEPS.map((step) => step.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const step of PRODUCT_TOUR_STEPS) {
      expect(step.title.trim()).not.toBe('');
      expect(step.body.trim()).not.toBe('');
      if (step.placement === 'center') {
        expect(step.targetSelector).toBe('');
      } else {
        expect(step.targetSelector.trim()).not.toBe('');
      }
    }
  });

  it('includes first-visit actions only for first-visit homes', () => {
    const firstVisit = stepsForHomeExperience('first-visit').map((s) => s.id);
    const returning = stepsForHomeExperience('returning').map((s) => s.id);

    expect(firstVisit).toContain('discover');
    expect(firstVisit).toContain('try-ar');
    expect(firstVisit).not.toContain('venue-search');

    expect(returning).toContain('venue-search');
    expect(returning).toContain('recent-venues');
    expect(returning).not.toContain('discover');
    expect(returning).not.toContain('try-ar');

    for (const experience of ['first-visit', 'returning'] as HomeExperience[]) {
      const ids = stepsForHomeExperience(experience).map((s) => s.id);
      expect(ids[0]).toBe('welcome');
      expect(ids).toContain('map-search');
      expect(ids).toContain('social-tab');
      expect(ids).toContain('profile-settings');
    }
  });

  it('advances, wraps back, and completes at the end', () => {
    expect(nextProductTourIndex(0, 4)).toBe(1);
    expect(nextProductTourIndex(3, 4)).toBe('complete');
    expect(nextProductTourIndex(0, 0)).toBe('complete');
    expect(previousProductTourIndex(0)).toBe(0);
    expect(previousProductTourIndex(2)).toBe(1);
    expect(productTourStepAt(stepsForHomeExperience('first-visit'), 0)?.id).toBe(
      'welcome',
    );
    expect(productTourStepAt([], 0)).toBeNull();
  });

  it('auto-starts only after onboarding, once', () => {
    expect(
      shouldAutoStartProductTour({
        onboardingComplete: true,
        tourCompleted: false,
        tourActive: false,
      }),
    ).toBe(true);
    expect(
      shouldAutoStartProductTour({
        onboardingComplete: false,
        tourCompleted: false,
        tourActive: false,
      }),
    ).toBe(false);
    expect(
      shouldAutoStartProductTour({
        onboardingComplete: true,
        tourCompleted: true,
        tourActive: false,
      }),
    ).toBe(false);
    expect(
      shouldAutoStartProductTour({
        onboardingComplete: true,
        tourCompleted: false,
        tourActive: true,
      }),
    ).toBe(false);
  });
});
