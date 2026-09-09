/** Browser media / motion permission as used by AR startup. */
export type MediaPermissionState =
  | 'granted'
  | 'denied'
  | 'prompt'
  | 'unsupported';

export interface ArMediaPermissionResult {
  camera: MediaPermissionState;
  motionGranted: boolean;
}

export function mediaPermissionFromBrowserState(
  state: string | undefined,
): MediaPermissionState {
  if (state === 'granted' || state === 'denied' || state === 'prompt') {
    return state;
  }
  return 'prompt';
}

export function mediaPermissionFromGetUserMediaError(
  error: unknown,
): MediaPermissionState {
  const name =
    error && typeof error === 'object' && 'name' in error
      ? String((error as { name: string }).name)
      : '';

  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'denied';
  }
  if (
    name === 'NotFoundError' ||
    name === 'OverconstrainedError' ||
    name === 'NotSupportedError' ||
    name === 'SecurityError'
  ) {
    return 'unsupported';
  }
  return 'prompt';
}

/**
 * Parent camera grant only authorizes the AR iframe when they share an origin.
 * Cross-origin AR still needs its own camera prompt inside the iframe.
 */
export function shouldReuseGrantedArCamera(
  camera: MediaPermissionState,
  arIsSameOrigin: boolean,
): boolean {
  return camera === 'granted' && arIsSameOrigin;
}

/** Skip getUserMedia after the first camera allow/deny. */
export function shouldSkipCameraPrompt(
  stored: 'undecided' | 'granted' | 'denied',
): stored is 'granted' | 'denied' {
  return stored === 'granted' || stored === 'denied';
}
