import { describe, expect, it } from 'vitest';

import type { HomeExperience } from '../../home/domain/entities';
import {
  contextualProductTourStep,
  initialProductTourSteps,
  isProductTourDontShowAgain,
  nextProductTourIndex,
  preferenceAfterProductTourEnable,
  preferenceAfterProductTourOptOut,
  previousProductTourIndex,
  PRODUCT_TOUR_STEPS,
  productTourStepAt,
  productTourStepsByIds,
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

  it('includes first-visit navigation tips only for first-visit homes', () => {
    const firstVisit = stepsForHomeExperience('first-visit').map((s) => s.id);
    const returning = stepsForHomeExperience('returning').map((s) => s.id);

    expect(firstVisit).toContain('try-ar');
    expect(firstVisit).not.toContain('venue-search');

    expect(returning).toContain('venue-search');
    expect(returning).toContain('recent-venues');
    expect(returning).not.toContain('try-ar');

    for (const experience of ['first-visit', 'returning'] as HomeExperience[]) {
      const ids = stepsForHomeExperience(experience).map((s) => s.id);
      expect(ids[0]).toBe('welcome');
      expect(ids).toContain('map-search');
      expect(ids).toContain('social-tab');
      expect(ids).toContain('profile-settings');
    }
  });

  it('uses only Navigate and Social for the first-launch intro', () => {
    expect(initialProductTourSteps().map((step) => step.id)).toEqual([
      'navigate-tab',
      'social-tab',
    ]);
    expect(productTourStepsByIds(['social-composer']).map((step) => step.id)).toEqual([
      'social-composer',
    ]);
    expect(contextualProductTourStep('try-ar')?.id).toBe('try-ar');
    expect(contextualProductTourStep('welcome')).toBeNull();
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

  it('auto-starts only after onboarding, when the tour is enabled and not dismissed', () => {
    expect(
      shouldAutoStartProductTour({
        onboardingComplete: true,
        tourEnabled: true,
        tourCompleted: false,
        tourActive: false,
        dismissedThisSession: false,
      }),
    ).toBe(true);
    expect(
      shouldAutoStartProductTour({
        onboardingComplete: false,
        tourEnabled: true,
        tourCompleted: false,
        tourActive: false,
        dismissedThisSession: false,
      }),
    ).toBe(false);
    expect(
      shouldAutoStartProductTour({
        onboardingComplete: true,
        tourEnabled: false,
        tourCompleted: false,
        tourActive: false,
        dismissedThisSession: false,
      }),
    ).toBe(false);
    expect(
      shouldAutoStartProductTour({
        onboardingComplete: true,
        tourEnabled: true,
        tourCompleted: true,
        tourActive: false,
        dismissedThisSession: false,
      }),
    ).toBe(false);
    expect(
      shouldAutoStartProductTour({
        onboardingComplete: true,
        tourEnabled: true,
        tourCompleted: false,
        tourActive: true,
        dismissedThisSession: false,
      }),
    ).toBe(false);
    expect(
      shouldAutoStartProductTour({
        onboardingComplete: true,
        tourEnabled: true,
        tourCompleted: false,
        tourActive: false,
        dismissedThisSession: true,
      }),
    ).toBe(false);
  });

  it('opts out and re-enables as inverse preferences', () => {
    expect(preferenceAfterProductTourOptOut()).toEqual({
      completed: true,
      enabled: false,
      seenContextualStepIds: [],
    });
    expect(preferenceAfterProductTourEnable()).toEqual({
      completed: false,
      enabled: true,
      seenContextualStepIds: [],
    });
    expect(isProductTourDontShowAgain(true)).toBe(false);
    expect(isProductTourDontShowAgain(false)).toBe(true);
  });
});
