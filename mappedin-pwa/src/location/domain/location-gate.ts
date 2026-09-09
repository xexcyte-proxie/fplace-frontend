import {
  isPermissionDeniedError,
  type GeolocationPermissionState,
  type UserCoordinates,
} from './geolocation-permission';
import type { PermissionChoice } from '../../permissions/domain/permission-choice';

/** Preflight before calling getCurrentPosition during the startup location gate. */
export type LocationGatePreflight =
  | { action: 'error-unsupported' }
  | { action: 'required-permanent' }
  | { action: 'request' };

export function resolveLocationGatePreflight(
  permission: GeolocationPermissionState,
): LocationGatePreflight {
  if (permission === 'unsupported') return { action: 'error-unsupported' };
  if (permission === 'denied') return { action: 'required-permanent' };
  return { action: 'request' };
}

/**
 * Whether to show the Enable Location dialog, silently reuse a prior grant,
 * or skip GPS entirely after the user already denied.
 */
export type LocationGateEntry =
  | { action: 'error-unsupported' }
  | { action: 'prompt' }
  | { action: 'silent-request' }
  | { action: 'skip' };

export function resolveLocationGateEntry(
  browser: GeolocationPermissionState,
  stored: PermissionChoice,
): LocationGateEntry {
  if (browser === 'unsupported') return { action: 'error-unsupported' };
  if (browser === 'granted') return { action: 'silent-request' };
  if (browser === 'denied') return { action: 'skip' };
  if (stored === 'granted') return { action: 'silent-request' };
  if (stored === 'denied') return { action: 'skip' };
  return { action: 'prompt' };
}

export type LocationGateFailure =
  | { action: 'required'; permanentlyDenied: boolean }
  | { action: 'error'; message: string };

export function resolveLocationGateFailure(
  error: unknown,
  permanentlyDenied: boolean,
  formatMessage: (error: unknown) => string,
): LocationGateFailure {
  if (isPermissionDeniedError(error)) {
    return { action: 'required', permanentlyDenied };
  }
  return { action: 'error', message: formatMessage(error) };
}

export type LocationGateSuccess = {
  action: 'complete';
  coords: UserCoordinates;
};

/** Auth steps that belong to the post-auth location gate (not marketing/auth). */
export function isLocationGateAuthStep(step: string): boolean {
  return (
    step === 'location-permission' ||
    step === 'location-required' ||
    step === 'location-error'
  );
}

/**
 * Marketing onboarding chain before Create Account.
 * Welcome (`none`) → Introduction → Features → Create.
 */
export function nextMarketingOnboardingStep(
  step: 'none' | 'introduction' | 'features' | 'create' | string,
): 'introduction' | 'features' | 'create' | null {
  if (step === 'none') return 'introduction';
  if (step === 'introduction') return 'features';
  if (step === 'features') return 'create';
  return null;
}
