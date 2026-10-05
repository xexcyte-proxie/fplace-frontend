import type { HomeExperience } from '../../home/domain/entities';

/** Screen the tour must show before highlighting a control. */
export type ProductTourSurface = 'home' | 'navigate' | 'map' | 'social' | 'profile';

export type ProductTourPlacement = 'top' | 'bottom' | 'left' | 'center';

export type ProductTourAudience = HomeExperience | 'any';

export interface ProductTourStep {
  id: string;
  title: string;
  body: string;
  /** Empty selector = centered intro card with no spotlight hole. */
  targetSelector: string;
  placement: ProductTourPlacement;
  surface: ProductTourSurface;
  audience: ProductTourAudience;
}

export const PRODUCT_TOUR_STEPS: readonly ProductTourStep[] = [
  {
    id: 'welcome',
    title: 'Quick tour',
    body: 'Here’s a 30-second look at the controls you’ll use most. Skip anytime.',
    targetSelector: '',
    placement: 'center',
    surface: 'home',
    audience: 'any',
  },
  {
    id: 'try-ar',
    title: 'Try AR navigation',
    body: 'Set a route first, then use camera guidance when it helps.',
    targetSelector: '#navigate-ar-btn',
    placement: 'bottom',
    surface: 'navigate',
    audience: 'first-visit',
  },
  {
    id: 'venue-search',
    title: 'Find a venue',
    body: 'Search for a stadium, mall, or campus to jump back in.',
    targetSelector: '[data-tour-id="returning-search"]',
    placement: 'bottom',
    surface: 'home',
    audience: 'returning',
  },
  {
    id: 'recent-venues',
    title: 'Recently visited',
    body: 'Tap a venue you already know to open it again.',
    targetSelector: '[data-tour-id="returning-recent"]',
    placement: 'top',
    surface: 'home',
    audience: 'returning',
  },
  {
    id: 'navigate-tab',
    title: 'Navigate',
    body: 'Open the indoor map to search places and plan a walking route.',
    targetSelector: '#nav-map',
    placement: 'top',
    surface: 'home',
    audience: 'any',
  },
  {
    id: 'map-search',
    title: 'Search the map',
    body: 'Look up a store or amenity, then tap the map to set start and destination.',
    targetSelector: '[data-tour-id="map-search"]',
    placement: 'bottom',
    surface: 'map',
    audience: 'any',
  },
  {
    id: 'my-location',
    title: 'Your location',
    body: 'Center the map on you and use it as the start of a route.',
    targetSelector: '#my-location-btn',
    placement: 'left',
    surface: 'map',
    audience: 'any',
  },
  {
    id: 'social-tab',
    title: 'Social',
    body: 'The venue feed is where fans share what’s happening in real time.',
    targetSelector: '#nav-social',
    placement: 'top',
    surface: 'social',
    audience: 'any',
  },
  {
    id: 'social-composer',
    title: 'Shout out',
    body: 'Post a quick update to your section. Keep it to 140 characters.',
    targetSelector: '[data-tour-id="venue-composer"]',
    placement: 'top',
    surface: 'social',
    audience: 'any',
  },
  {
    id: 'profile-tab',
    title: 'Profile',
    body: 'Your pseudo-name, venue, and account live here.',
    targetSelector: '#nav-profile',
    placement: 'top',
    surface: 'profile',
    audience: 'any',
  },
  {
    id: 'profile-settings',
    title: 'Settings',
    body: 'Change notifications, turn this tour on or off, or switch venues anytime.',
    targetSelector: '#profile-settings-btn',
    placement: 'bottom',
    surface: 'profile',
    audience: 'any',
  },
];

export function stepsForHomeExperience(
  experience: HomeExperience,
): ProductTourStep[] {
  return PRODUCT_TOUR_STEPS.filter(
    (step) => step.audience === 'any' || step.audience === experience,
  );
}

const INITIAL_PRODUCT_TOUR_STEP_IDS = ['navigate-tab', 'social-tab'] as const;

const CONTEXTUAL_PRODUCT_TOUR_STEP_IDS = [
  'try-ar',
  'map-search',
  'social-composer',
  'my-location',
  'profile-settings',
] as const;

export function productTourStepsByIds(ids: readonly string[]): ProductTourStep[] {
  return ids
    .map((id) => PRODUCT_TOUR_STEPS.find((step) => step.id === id) ?? null)
    .filter((step): step is ProductTourStep => step != null);
}

export function initialProductTourSteps(): ProductTourStep[] {
  return productTourStepsByIds(INITIAL_PRODUCT_TOUR_STEP_IDS);
}

export function contextualProductTourStep(id: string): ProductTourStep | null {
  if (
    !CONTEXTUAL_PRODUCT_TOUR_STEP_IDS.some(
      (contextualId) => contextualId === id,
    )
  ) {
    return null;
  }
  return PRODUCT_TOUR_STEPS.find((step) => step.id === id) ?? null;
}

export function productTourStepAt(
  steps: readonly ProductTourStep[],
  index: number,
): ProductTourStep | null {
  if (index < 0 || index >= steps.length) return null;
  return steps[index] ?? null;
}

export function nextProductTourIndex(
  index: number,
  total: number,
): number | 'complete' {
  if (total <= 0) return 'complete';
  if (index + 1 >= total) return 'complete';
  return index + 1;
}

export function previousProductTourIndex(index: number): number {
  return Math.max(0, index - 1);
}

export interface ProductTourPreference {
  /** True after the user finished the tour or opted out on this device. */
  completed: boolean;
  /** Settings / “don’t show again” switch. Auto-start requires this to be on. */
  enabled: boolean;
  /** Contextual tip ids already shown on this device. */
  seenContextualStepIds: string[];
}

export const DEFAULT_PRODUCT_TOUR_PREFERENCE: ProductTourPreference = {
  completed: false,
  enabled: true,
  seenContextualStepIds: [],
};

export function shouldAutoStartProductTour(options: {
  onboardingComplete: boolean;
  tourEnabled: boolean;
  tourCompleted: boolean;
  tourActive: boolean;
  dismissedThisSession: boolean;
}): boolean {
  return (
    options.onboardingComplete &&
    options.tourEnabled &&
    !options.tourCompleted &&
    !options.tourActive &&
    !options.dismissedThisSession
  );
}

/** Persist after Finish, Skip with “don’t show again”, or Settings off. */
export function preferenceAfterProductTourOptOut(): ProductTourPreference {
  return { ...DEFAULT_PRODUCT_TOUR_PREFERENCE, completed: true, enabled: false };
}

/** Persist after Settings turns the tour back on. */
export function preferenceAfterProductTourEnable(): ProductTourPreference {
  return { ...DEFAULT_PRODUCT_TOUR_PREFERENCE, completed: false, enabled: true };
}

/** Checkbox on the dialog is the inverse of the enabled preference. */
export function isProductTourDontShowAgain(enabled: boolean): boolean {
  return !enabled;
}
