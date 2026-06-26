export interface IndoorAtlasCoords {
  latitude: number;
  longitude: number;
  accuracy?: number;
  floor?: number;
  heading?: number;
  altitude?: number;
  altitudeAccuracy?: number;
}

export interface IndoorAtlasPosition {
  coords: IndoorAtlasCoords;
  timestamp?: number;
  floorCertainty?: number;
  floorPlan?: { floorLevel?: number; name?: string };
}

export interface IndoorAtlasSdk {
  initialize(config: { apiKey: string; apiSecret?: string }): Promise<unknown> | unknown;
  watchPosition(
    onPosition: (position: IndoorAtlasPosition) => void,
    options?: Record<string, unknown>,
  ): unknown;
  clearWatch(): void;
  lockFloor?(floorNumber: number): void;
  unlockFloor?(): void;
  watchFloorPlan?(onFloorPlan: (floorPlan: { floorLevel?: number; name?: string } | null) => void): void;
  clearFloorPlanWatch?(): void;
}

declare global {
  interface Window {
    IndoorAtlas?: IndoorAtlasSdk;
    cordova?: { platformId?: string };
  }
  interface Document {
    addEventListener(
      type: 'deviceready',
      listener: () => void,
      options?: boolean | AddEventListenerOptions,
    ): void;
  }
}

export function getIndoorAtlasSdk(): IndoorAtlasSdk | null {
  return window.IndoorAtlas ?? null;
}

export function waitForIndoorAtlasReady(timeoutMs = 8_000): Promise<void> {
  if (getIndoorAtlasSdk()) {
    return Promise.resolve();
  }

  if (typeof window.cordova === 'undefined') {
    return Promise.reject(new Error('IndoorAtlas SDK not present'));
  }

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error('IndoorAtlas SDK ready timeout'));
    }, timeoutMs);

    document.addEventListener(
      'deviceready',
      () => {
        window.clearTimeout(timer);
        if (getIndoorAtlasSdk()) resolve();
        else reject(new Error('IndoorAtlas SDK missing after deviceready'));
      },
      { once: true },
    );
  });
}

export async function initializeIndoorAtlas(apiKey: string, apiSecret?: string): Promise<IndoorAtlasSdk> {
  await waitForIndoorAtlasReady().catch(() => undefined);
  const sdk = getIndoorAtlasSdk();
  if (!sdk) {
    throw new Error('IndoorAtlas SDK unavailable');
  }

  const config: { apiKey: string; apiSecret?: string } = { apiKey };
  if (apiSecret) config.apiSecret = apiSecret;

  await Promise.resolve(sdk.initialize(config));
  return sdk;
}
