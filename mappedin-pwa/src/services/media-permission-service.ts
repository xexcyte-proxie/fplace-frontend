import {
  mediaPermissionFromBrowserState,
  mediaPermissionFromGetUserMediaError,
  shouldSkipCameraPrompt,
  type ArMediaPermissionResult,
  type MediaPermissionState,
} from '../permissions/domain/media-permission';
import { permissionChoiceLocalDatasource } from '../permissions/data/datasources/permission-choice-local-datasource';

export type {
  ArMediaPermissionResult,
  MediaPermissionState,
} from '../permissions/domain/media-permission';

export {
  shouldReuseGrantedArCamera,
} from '../permissions/domain/media-permission';

const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: { ideal: 'environment' } },
  audio: false,
};

let inFlightPrime: Promise<ArMediaPermissionResult> | null = null;

type MotionPermissionCtor = {
  requestPermission?: () => Promise<string>;
};

async function queryCameraPermission(): Promise<MediaPermissionState> {
  if (!navigator.mediaDevices?.getUserMedia) return 'unsupported';
  if (typeof globalThis.isSecureContext === 'boolean' && !globalThis.isSecureContext) {
    return 'unsupported';
  }
  if (!navigator.permissions?.query) return 'prompt';

  try {
    const status = await navigator.permissions.query({
      name: 'camera' as PermissionName,
    });
    return mediaPermissionFromBrowserState(status.state);
  } catch {
    return 'prompt';
  }
}

function stopTracks(stream: MediaStream): void {
  stream.getTracks().forEach((track) => track.stop());
}

/**
 * Invoke getUserMedia immediately (no awaits before the call) so the AR-button
 * user gesture can show Chrome's camera prompt. Tracks are stopped right away;
 * Chrome/Safari persist the origin grant for later AR sessions.
 */
function requestCameraAccess(): Promise<MediaPermissionState> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return Promise.resolve('unsupported');
  }
  if (typeof globalThis.isSecureContext === 'boolean' && !globalThis.isSecureContext) {
    return Promise.resolve('unsupported');
  }

  return navigator.mediaDevices
    .getUserMedia(CAMERA_CONSTRAINTS)
    .then((stream) => {
      stopTracks(stream);
      return 'granted' as const;
    })
    .catch((error: unknown) => mediaPermissionFromGetUserMediaError(error));
}

async function requestSensorPermission(
  ctor: MotionPermissionCtor | undefined,
): Promise<boolean> {
  if (typeof ctor?.requestPermission !== 'function') return true;
  try {
    return (await ctor.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

function requestMotionAccess(): Promise<boolean> {
  const orientationCtor = (
    typeof DeviceOrientationEvent === 'undefined'
      ? undefined
      : DeviceOrientationEvent
  ) as MotionPermissionCtor | undefined;
  const motionCtor = (
    typeof DeviceMotionEvent === 'undefined' ? undefined : DeviceMotionEvent
  ) as MotionPermissionCtor | undefined;
  return Promise.all([
    requestSensorPermission(orientationCtor),
    requestSensorPermission(motionCtor),
  ]).then(([orientationGranted, motionGranted]) =>
    orientationGranted && motionGranted,
  );
}

function persistCameraChoice(camera: MediaPermissionState): void {
  if (camera === 'granted' || camera === 'denied') {
    permissionChoiceLocalDatasource.saveCamera(camera);
  }
}

/**
 * Ask for camera + motion now. Must be called from a user gesture (AR click)
 * before any slow awaits so the browser can show its permission UI.
 * After the first allow/deny, later opens reuse that choice and do not prompt.
 */
export function primeArMediaPermissions(): Promise<ArMediaPermissionResult> {
  const storedCamera = permissionChoiceLocalDatasource.loadCamera();
  const camera = shouldSkipCameraPrompt(storedCamera)
    ? Promise.resolve(storedCamera)
    : requestCameraAccess();

  const storedMotion = permissionChoiceLocalDatasource.loadMotion();
  const motion =
    storedMotion === 'granted'
      ? Promise.resolve(true)
      : storedMotion === 'denied'
        ? Promise.resolve(false)
        : requestMotionAccess();

  return Promise.all([camera, motion]).then(([cameraState, motionGranted]) => {
    persistCameraChoice(cameraState);
    if (storedMotion === 'undecided') {
      permissionChoiceLocalDatasource.saveMotion(
        motionGranted ? 'granted' : 'denied',
      );
    }
    return {
      camera: cameraState,
      motionGranted,
    };
  });
}

/** True when iOS motion permission was already decided: do not call requestPermission again. */
export function shouldRequestArMotionPermission(): boolean {
  return permissionChoiceLocalDatasource.loadMotion() === 'undecided';
}

/** Start the camera prompt from the AR click without blocking the rest of the flow. */
export function beginArMediaPermissionPrime(): Promise<ArMediaPermissionResult> {
  if (!inFlightPrime) {
    inFlightPrime = primeArMediaPermissions();
  }
  return inFlightPrime;
}

/** Wait for the in-flight prime (or start one) and clear it for the next AR open. */
export async function consumeArMediaPermissionPrime(): Promise<ArMediaPermissionResult> {
  const result = await (inFlightPrime ?? primeArMediaPermissions());
  inFlightPrime = null;
  return result;
}

/** Test helper. */
export function resetArMediaPermissionPrime(): void {
  inFlightPrime = null;
  permissionChoiceLocalDatasource.clearCameraAndMotion();
}

export { queryCameraPermission };
