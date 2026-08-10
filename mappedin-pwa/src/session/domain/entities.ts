/** Persisted marker that this browser already finished first-run onboarding. */
export type ReturningSessionMode = 'auth' | 'guest';

export interface ReturningSessionSnapshot {
  onboardingComplete: boolean;
  mode: ReturningSessionMode;
  selectedVenueId: string | null;
  selectedGateId: string | null;
  guestId: string | null;
}

export function isReturningSession(
  snapshot: ReturningSessionSnapshot | null | undefined,
): snapshot is ReturningSessionSnapshot {
  return Boolean(snapshot?.onboardingComplete);
}

/**
 * Cold-start destination after splash.
 * Marketing (Find places → …) is only for brand-new devices.
 */
export type StartupDestination = 'app' | 'sign-in' | 'marketing';

export function resolveStartupDestination(options: {
  hasReturningSession: boolean;
  hasAuthTokens: boolean;
  deviceHasUsedApp: boolean;
}): StartupDestination {
  if (options.hasReturningSession || options.hasAuthTokens) return 'app';
  if (options.deviceHasUsedApp) return 'sign-in';
  return 'marketing';
}
