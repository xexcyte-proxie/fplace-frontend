import { appConfig } from '../config';
import type { FloorInfo, RouteCoordinate } from '../types';
import { buildArRoutePayload, encodeRouteForAr } from '../utils/route-helpers';
import type { RoutePayload } from '../types';
import type { FplacesPositionFrame } from './types';
import { appLog, appWarn } from '../utils/logger';

export type { FplacesPositionFrame, PositionSourceType } from './types';

export interface ArMessageBridgeHost {
  isArOpen(): boolean;
  startRouteMovement(options?: { alongPathMeters?: number }): void;
}

const ROUTE_HANDOFF_KEY = 'fplaces.handoff.route';

function stashRouteHandoff(routePayload: Record<string, unknown>): void {
  try {
    sessionStorage.setItem(ROUTE_HANDOFF_KEY, JSON.stringify(routePayload));
  } catch {
    /* quota / private mode */
  }
}

export function clearRouteHandoff(): void {
  try {
    sessionStorage.removeItem(ROUTE_HANDOFF_KEY);
  } catch {
    /* ignore */
  }
}

function resolveArBaseUrl(): string {
  const configured = appConfig.arUrl.replace(/\/?$/, '/');
  if (/^https?:\/\//i.test(configured)) return configured;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const path = configured.startsWith('/') ? configured : `/${configured}`;
  return `${origin}${path}`;
}

export function buildArUrl(
  route: RoutePayload,
  currentLegIndex: number,
  instructions: string,
  userPosition?: RouteCoordinate | null,
  floors?: FloorInfo[],
): string {
  const base = resolveArBaseUrl();
  const payload = buildArRoutePayload(
    route,
    currentLegIndex,
    instructions,
    userPosition,
    floors,
  );
  const pwaOrigin =
    typeof window !== 'undefined'
      ? encodeURIComponent(window.location.origin)
      : '';
  const useFallbackXr =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      !window.isSecureContext);
  const xrModeParam = useFallbackXr ? 'xrMode=fallback&' : '';
  const query = `${xrModeParam}useGpsProgress=0&positioning=mappedin&worldRoute=1&pwaOrigin=${pwaOrigin}`;
  const hash = encodeRouteForAr(payload);
  return base.includes('?') ? `${base}&${query}${hash}` : `${base}?${query}${hash}`;
}

export function buildArRoutePayloadForHandoff(
  route: RoutePayload,
  currentLegIndex: number,
  instructions: string,
  userPosition?: RouteCoordinate | null,
  floors?: FloorInfo[],
): Record<string, unknown> {
  return buildArRoutePayload(
    route,
    currentLegIndex,
    instructions,
    userPosition,
    floors,
  );
}

export interface ArPositionUpdate {
  latitude: number;
  longitude: number;
  accuracy?: number;
  heading?: number;
  floorId?: string;
  timestamp?: number;
  animated?: boolean;
  source?: FplacesPositionFrame['source'] | 'pwa';
}

export function normalizePositionFrame(
  position: ArPositionUpdate | FplacesPositionFrame,
): FplacesPositionFrame {
  return {
    latitude: position.latitude,
    longitude: position.longitude,
    heading: position.heading ?? 0,
    accuracy: position.accuracy ?? 15,
    source:
      position.source === 'pwa' || !position.source
        ? 'gps'
        : (position.source as FplacesPositionFrame['source']),
    floorId: position.floorId,
    timestamp: position.timestamp ?? Date.now(),
  };
}

function legacyPayload(frame: FplacesPositionFrame) {
  return {
    latitude: frame.latitude,
    longitude: frame.longitude,
    accuracy: frame.accuracy,
    heading: frame.heading,
    floorId: frame.floorId,
    source: frame.source,
    timestamp: frame.timestamp ?? Date.now(),
  };
}

function resolvePostMessageTargetOrigin(frame: HTMLIFrameElement): string {
  const src = frame.src;
  if (src && src !== 'about:blank') {
    try {
      return new URL(src, window.location.href).origin;
    } catch {
      /* fall through */
    }
  }
  return window.location.origin;
}

export function notifyArSimulatorStarted(detail: {
  alongPathMeters?: number;
  pathPoints: number;
}): void {
  const frame = document.querySelector('#ar-frame') as HTMLIFrameElement | null;
  if (!frame?.contentWindow || frame.hidden) return;
  const targetOrigin = resolvePostMessageTargetOrigin(frame);
  frame.contentWindow.postMessage({ type: 'fplaces_simulator_started', ...detail }, targetOrigin);
}

export function isArFrameVisible(): boolean {
  const frame = document.querySelector('#ar-frame') as HTMLIFrameElement | null;
  return Boolean(frame && !frame.hidden && frame.contentWindow);
}

export function dispatchPositionToAr(frame: FplacesPositionFrame): void {
  const normalized = normalizePositionFrame(frame);
  const frameEl = document.querySelector('#ar-frame') as HTMLIFrameElement | null;
  if (!frameEl || frameEl.hidden || !frameEl.contentWindow) return;

  const legacy = legacyPayload(normalized);

  const targetOrigin = resolvePostMessageTargetOrigin(frameEl);
  let sameOriginDirect = false;

  try {
    const child = frameEl.contentWindow as Window & {
      onFlutterPosition?: (value: typeof legacy) => void;
    };
    if (targetOrigin === window.location.origin && typeof child.onFlutterPosition === 'function') {
      child.onFlutterPosition(legacy);
      sameOriginDirect = true;
    }
  } catch {
    /* cross-origin read blocked */
  }

  if (!sameOriginDirect) {
    frameEl.contentWindow.postMessage(
      { type: 'FPLACES_POSITION_UPDATE', data: normalized },
      targetOrigin,
    );
  }
}

/** @deprecated Use dispatchPositionToAr */
export function sendPositionToAr(position: ArPositionUpdate): void {
  dispatchPositionToAr(normalizePositionFrame(position));
}

function deliverRouteToFrame(
  frame: HTMLIFrameElement,
  routePayload: Record<string, unknown>,
): void {
  if (!frame.contentWindow) return;
  const targetOrigin = resolvePostMessageTargetOrigin(frame);
  const pathCoordinates = routePayload.pathCoordinates;
  const pathPointCount = Array.isArray(pathCoordinates) ? pathCoordinates.length : 0;

  appWarn('AR', 'Delivering route to iframe', {
    targetOrigin,
    pathPointCount,
    destinationName: routePayload.destinationName,
    hashInUrl: frame.src.includes('#route='),
    sessionHandoff: (() => {
      try {
        return Boolean(sessionStorage.getItem(ROUTE_HANDOFF_KEY));
      } catch {
        return false;
      }
    })(),
  });

  if (targetOrigin === window.location.origin) {
    try {
      const child = frame.contentWindow as Window & {
        FplacesRouteBridge?: {
          applyRoute: (payload: Record<string, unknown>, source: string) => unknown;
        };
        fplacesActiveRoute?: unknown;
      };
      if (child.FplacesRouteBridge?.applyRoute) {
        child.FplacesRouteBridge.applyRoute(routePayload, 'parent-direct');
      }
      appLog('AR', 'Direct iframe route apply', {
        hasActiveRoute: Boolean(child.fplacesActiveRoute),
      });
      return;
    } catch (error) {
      appWarn('AR', 'Direct iframe route apply failed', error);
    }
  }

  frame.contentWindow.postMessage(
    { type: 'fplaces_route', route: routePayload },
    targetOrigin,
  );
}

export function openArFullscreen(
  url: string,
  routePayload?: Record<string, unknown>,
): HTMLIFrameElement {
  const frame = document.querySelector('#ar-frame') as HTMLIFrameElement;
  frame.hidden = false;
  frame.setAttribute('allow', 'camera; geolocation; fullscreen');

  const pathPointCount = Array.isArray(routePayload?.pathCoordinates)
    ? routePayload.pathCoordinates.length
    : 0;

  appWarn('AR', 'Opening AR iframe', {
    url,
    urlLength: url.length,
    hasRoutePayload: Boolean(routePayload),
    pathPointCount,
    arBase: appConfig.arUrl,
  });

  if (routePayload) {
    stashRouteHandoff(routePayload);
    let routeDelivered = false;
    const sendRoute = () => {
      if (routeDelivered || !frame.contentWindow) return;
      deliverRouteToFrame(frame, routePayload);
      routeDelivered = true;
    };
    frame.addEventListener('load', sendRoute, { once: true });
    window.setTimeout(sendRoute, 400);
  }

  frame.src = url;
  return frame;
}

/** Mirror AR iframe debug lines into the parent DevTools console (dev only). */
export function installArDebugRelay(): void {
  if (!import.meta.env.DEV) return;

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || data.type !== 'fplaces_ar_debug') return;
    if (event.origin !== window.location.origin) return;

    const line = data.line ?? `[${data.phase}] ${data.message}`;
    if (data.level === 'error') {
      console.error(`[fplaces AR iframe] ${line}`, data.detail ?? '');
    } else if (data.level === 'warn') {
      console.warn(`[fplaces AR iframe] ${line}`, data.detail ?? '');
    } else {
      console.log(`[fplaces AR iframe] ${line}`, data.detail ?? '');
    }
  });

  (window as Window & { __fplacesArDebug?: () => Record<string, unknown> }).__fplacesArDebug =
    () => {
      const frame = document.querySelector('#ar-frame') as HTMLIFrameElement | null;
      const child = frame?.contentWindow as
        | (Window & {
            fplacesActiveRoute?: unknown;
            FplacesRouteBridge?: unknown;
            FplacesArDebug?: unknown;
            location?: Location;
          })
        | null
        | undefined;

      let sessionHandoff: string | null = null;
      try {
        sessionHandoff = sessionStorage.getItem(ROUTE_HANDOFF_KEY);
      } catch {
        /* ignore */
      }

      return {
        parentOrigin: window.location.origin,
        frameHidden: frame?.hidden ?? true,
        frameSrc: frame?.src ?? null,
        sessionHandoffChars: sessionHandoff?.length ?? 0,
        childHasActiveRoute: Boolean(child?.fplacesActiveRoute),
        childLocation: child?.location?.href ?? null,
        childHasBridge: Boolean(child?.FplacesRouteBridge),
        childHasArDebug: Boolean(child?.FplacesArDebug),
      };
    };

  appLog('AR', 'Debug relay installed — filter console with "IndoorNav" or "fplaces AR"');
  console.warn(
    '[fplaces] AR debug relay active. Open the BROWSER console (Cmd+Option+J), not the IDE terminal.',
  );
}

export function closeArFullscreen(): void {
  const frame = document.querySelector('#ar-frame') as HTMLIFrameElement;
  frame.hidden = true;
  frame.src = 'about:blank';
  clearRouteHandoff();
}

/** Central PWA listener for postMessage events emitted by the AR iframe. */
export function installArMessageBridge(host: ArMessageBridgeHost): void {
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;

    const message = event.data;
    if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
      return;
    }

    switch (message.type) {
      case 'fplaces_start_movement': {
        console.log('[PWA Bridge] Received start signal. Activating simulator progression.');
        const alongPathMeters =
          typeof message.alongPathMeters === 'number' ? message.alongPathMeters : undefined;
        appLog('PWA Bridge', 'fplaces_start_movement received', { alongPathMeters });
        host.startRouteMovement({ alongPathMeters });
        break;
      }
      default:
        break;
    }
  });

  appLog('PWA Bridge', 'AR message bridge installed');
}
