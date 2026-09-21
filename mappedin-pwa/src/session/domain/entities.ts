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

/**
 * Full-screen splash vs the rest of the app.
 * The 3D map may still be loading after splash is dismissed.
 */
export type StartupShell = 'splash' | 'onboarding' | 'app';

export type MapBootStatus = 'initial' | 'loading' | 'ready' | 'error';

export function resolveStartupShell(options: {
  destinationResolved: boolean;
  onboardingComplete: boolean;
}): StartupShell {
  if (!options.destinationResolved) return 'splash';
  if (options.onboardingComplete) return 'app';
  return 'onboarding';
}

export function shouldShowStartupSplash(destinationResolved: boolean): boolean {
  return !destinationResolved;
}

/** Keep the orange splash visible long enough to read, even on a fast boot. */
export const MINIMUM_STARTUP_SPLASH_MS = 2000;

export function remainingStartupSplashMs(
  shownAtMs: number,
  nowMs: number,
  minimumMs: number = MINIMUM_STARTUP_SPLASH_MS,
): number {
  if (shownAtMs <= 0) return 0;
  return Math.max(0, minimumMs - (nowMs - shownAtMs));
}

/** Indoor map canvas (not venue home / other tabs). */
export function isIndoorMapSurface(options: {
  shell: StartupShell;
  activeTab: string;
  navigateView: string;
}): boolean {
  return (
    options.shell === 'app' &&
    options.activeTab === 'map' &&
    options.navigateView === 'map'
  );
}

/** In-map loader/error while Mappedin boots in the background. */
export function shouldShowMapBootOverlay(options: {
  shell: StartupShell;
  activeTab: string;
  navigateView: string;
  mapStatus: MapBootStatus;
}): boolean {
  return (
    isIndoorMapSurface(options) &&
    options.mapStatus !== 'ready'
  );
}

/**
 * Hide the 3D canvas whenever it is not the visible surface, and while the
 * next indoor map is booting so the previous WebGL frame cannot flash.
 * Splash keeps it visible so Mappedin can start.
 * Uses visibility (not display) so the canvas stays laid out while hidden.
 */
export function shouldHideMapCanvas(options: {
  shell: StartupShell;
  activeTab: string;
  navigateView: string;
  mapStatus?: MapBootStatus;
}): boolean {
  if (options.shell === 'splash') return false;
  if (!isIndoorMapSurface(options)) return true;
  return Boolean(options.mapStatus && options.mapStatus !== 'ready');
}
