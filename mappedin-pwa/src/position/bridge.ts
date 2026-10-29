import { navigationDiagnostics as navDiag } from './debug/navigation-diagnostics';
import {
  preloadSrcNeedsRefresh,
  shouldReuseWarmedArIframe,
  shouldWaitForInFlightPreload,
  type LiveViewLaunchOptions,
  type WarmedArChildSnapshot,
} from "../ar/domain/warm-iframe";
import { appConfig } from "../config";
import {
  ROUTE_ACK_TIMEOUT_MS,
  ROUTE_DELIVERY_MAX_RETRIES,
} from "../routing/constants";
import { routeLifecycleManager } from "../routing/route-lifecycle-manager";
import type { FloorInfo, RouteCoordinate, RoutePayload } from "../types";
import { buildArRoutePayload, encodeRouteForAr } from "../utils/route-helpers";
import { applyPipShellLayout, hideArBootOverlay, isArShellVisible, showArBootOverlay, armArBootOverlayFallback } from "./ar-pip-shell";
import type { FplacesPositionFrame, NavigationProgressSnapshot } from "./types";
import { appLog, appWarn } from "../utils/logger";

const PRELOAD_ACTIVATE_WAIT_MS = 8_000;

export type RouteDeliveryResult = {
  accepted: boolean;
  routeId: string;
  routeVersion: number;
  source: 'direct' | 'postMessage' | 'sessionStorage' | 'ack';
  attempts?: number;
};

export type NavigationSyncPayload = {
  route: RoutePayload;
  currentLegIndex: number;
  instructions: string;
  navigationProgress?: NavigationProgressSnapshot | null;
  reason: string;
};

export type {
  FplacesPositionFrame,
  NavigationAuthority,
  NavigationProgressSnapshot,
  PositionSourceType,
} from "./types";

export type ArPresentation = "closed" | "fullscreen" | "minimized";

let currentArPresentation: ArPresentation = "closed";

export interface ArMessageBridgeHost {
  isArOpen(): boolean;
  startRouteMovement(options?: { alongPathMeters?: number }): void;
  closeAr(): void;
  minimizeAr(): void;
  maximizeAr(): void;
  lockNavigationArrival(): void;
  endArNavigation(): void | Promise<void>;
  forceFloor?(floorId: string): void;
}

function notifyArPresentation(mode: ArPresentation): void {
  const frame = document.querySelector("#ar-frame") as HTMLIFrameElement | null;
  if (!frame?.contentWindow) return;
  const targetOrigin = resolvePostMessageTargetOrigin(frame);
  frame.contentWindow.postMessage(
    { type: "fplaces_presentation", mode },
    targetOrigin,
  );
}

function syncArPresentationToFrame(): void {
  if (currentArPresentation === "closed") return;
  notifyArPresentation(currentArPresentation);
}

export function setArPresentation(mode: ArPresentation): void {
  currentArPresentation = mode;
  if (mode === "closed") {
    parkArIframe();
    notifyArPresentation(mode);
    clearRouteHandoff();
    applyPipShellLayout(mode);
    queueMicrotask(() => warmArIframe());
    return;
  }
  applyPipShellLayout(mode);
  notifyArPresentation(mode);
}

export function setArMinimized(): void {
  setArPresentation("minimized");
}

export function setArMaximized(): void {
  setArPresentation("fullscreen");
}

const ROUTE_HANDOFF_KEY = "fplaces.handoff.route";
const CAMERA_HANDOFF_KEY = "fplaces.handoff.cameraGranted";

export type ArIframeCameraPermission =
  | "granted"
  | "denied"
  | "prompt"
  | "unsupported";

let pendingRouteAck: {
  routeId: string;
  routeVersion: number;
  resolve: (result: RouteDeliveryResult) => void;
  timer: ReturnType<typeof setTimeout>;
} | null = null;

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
  const configured = appConfig.arUrl.replace(/\/?$/, "/");
  if (/^https?:\/\//i.test(configured)) return configured;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const path = configured.startsWith("/") ? configured : `/${configured}`;
  return `${origin}${path}`;
}

/** True when the AR iframe is served from the same origin as the PWA. */
export function isArSameOrigin(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URL(resolveArBaseUrl()).origin === window.location.origin;
  } catch {
    return false;
  }
}

const AR_IFRAME_ALLOW =
  "camera; geolocation; gyroscope; accelerometer; magnetometer; xr-spatial-tracking; fullscreen";

export function buildArUrl(
  route: RoutePayload,
  currentLegIndex: number,
  instructions: string,
  userPosition?: RouteCoordinate | null,
  floors?: FloorInfo[],
  navigationProgress?: NavigationProgressSnapshot | null,
  options?: { cameraReady?: boolean },
): string {
  const base = resolveArBaseUrl();
  const payload = buildArRoutePayload(
    route,
    currentLegIndex,
    instructions,
    userPosition,
    floors,
    navigationProgress,
  );
  const pwaOrigin =
    typeof window !== "undefined"
      ? encodeURIComponent(window.location.origin)
      : "";
  const useFallbackXr =
    typeof window !== "undefined" && !window.isSecureContext;
  const xrModeParam = useFallbackXr ? "xrMode=fallback&" : "";
  const arDebugParam = "arDebug=0&";
  const arBuildParam = `build=${encodeURIComponent(appConfig.arBuildId)}&`;
  const cameraReadyParam = options?.cameraReady ? "cameraReady=1&" : "";
  const query = `${xrModeParam}${arDebugParam}${arBuildParam}${cameraReadyParam}useGpsProgress=0&positioning=mappedin&worldRoute=1&autoCalibrate=1&pwaOrigin=${pwaOrigin}`;
  const hash = encodeRouteForAr(payload);
  return base.includes("?")
    ? `${base}&${query}${hash}`
    : `${base}?${query}${hash}`;
}

export function buildArRoutePayloadForHandoff(
  route: RoutePayload,
  currentLegIndex: number,
  instructions: string,
  userPosition?: RouteCoordinate | null,
  floors?: FloorInfo[],
  navigationProgress?: NavigationProgressSnapshot | null,
): Record<string, unknown> {
  return buildArRoutePayload(
    route,
    currentLegIndex,
    instructions,
    userPosition,
    floors,
    navigationProgress,
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
  source?: FplacesPositionFrame["source"] | "pwa";
  alongPathMeters?: number;
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
      position.source === "pwa" || !position.source
        ? "gps"
        : (position.source as FplacesPositionFrame["source"]),
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
    alongPathMeters: frame.alongPathMeters,
  };
}

function resolvePostMessageTargetOrigin(frame: HTMLIFrameElement): string {
  const src = frame.src;
  if (src && src !== "about:blank") {
    try {
      return new URL(src, window.location.href).origin;
    } catch {
      /* fall through */
    }
  }
  return window.location.origin;
}

export function notifyArSimulatorStarted(detail: {
  alongPathMeters: number;
  pathPoints: number;
}): void {
  const shell = document.querySelector("#ar-pip-shell") as HTMLElement | null;
  const frame = document.querySelector("#ar-frame") as HTMLIFrameElement | null;
  if (!shell || shell.hidden || !frame?.contentWindow) return;
  const targetOrigin = resolvePostMessageTargetOrigin(frame);
  frame.contentWindow.postMessage(
    { type: "fplaces_simulator_started", ...detail },
    targetOrigin,
  );
}

function withParentSimulatorAuthority(
  progress: NavigationProgressSnapshot,
): NavigationProgressSnapshot {
  if (progress.source !== "simulator") return progress;
  return { ...progress, navigationAuthority: "parent-simulator" };
}

/** Push current 2D navigation progress into the AR iframe (position + distances). */
export function syncNavigationToAr(
  progress: NavigationProgressSnapshot,
): void {
  const payload = withParentSimulatorAuthority(progress);
  const diagnosticCause = navDiag?.update('ar-sync', 'syncNavigationToAr', { ...payload, parentCause: navDiag.cause });
  const shell = document.querySelector("#ar-pip-shell") as HTMLElement | null;
  const frameEl = document.querySelector(
    "#ar-frame",
  ) as HTMLIFrameElement | null;
  if (!shell || shell.hidden || !frameEl?.contentWindow) return;

  const targetOrigin = resolvePostMessageTargetOrigin(frameEl);

  if (payload.latitude != null && payload.longitude != null) {
    dispatchPositionToAr({
      latitude: payload.latitude,
      longitude: payload.longitude,
      heading: payload.heading ?? 0,
      accuracy: 4,
      source: payload.source ?? "simulator",
      floorId: payload.floorId,
      timestamp: Date.now(),
      alongPathMeters: payload.alongPathMeters,
    });
  }

  frameEl.contentWindow.postMessage(
    { type: "fplaces_navigation_sync", progress: navDiag ? { ...payload, diagnosticCause } : payload },
    targetOrigin,
  );
}

export function isArFrameVisible(): boolean {
  return isArShellVisible();
}

export function dispatchPositionToAr(
  frame: FplacesPositionFrame | ArPositionUpdate,
): void {
  const normalized = normalizePositionFrame(frame);
  const shell = document.querySelector("#ar-pip-shell") as HTMLElement | null;
  const frameEl = document.querySelector(
    "#ar-frame",
  ) as HTMLIFrameElement | null;
  if (!shell || shell.hidden || !frameEl?.contentWindow) return;

  const legacy = legacyPayload(normalized);

  const targetOrigin = resolvePostMessageTargetOrigin(frameEl);
  let sameOriginDirect = false;

  try {
    const child = frameEl.contentWindow as Window & {
      onFlutterPosition?: (value: typeof legacy) => void;
    };
    if (
      targetOrigin === window.location.origin &&
      typeof child.onFlutterPosition === "function"
    ) {
      child.onFlutterPosition(legacy);
      sameOriginDirect = true;
    }
  } catch {
    /* cross-origin read blocked */
  }

  if (!sameOriginDirect) {
    frameEl.contentWindow.postMessage(
      { type: "FPLACES_POSITION_UPDATE", data: normalized },
      targetOrigin,
    );
  }
}

/** @deprecated Use dispatchPositionToAr */
export function sendPositionToAr(position: ArPositionUpdate): void {
  dispatchPositionToAr(normalizePositionFrame(position));
}

function deliverRouteDirect(
  frame: HTMLIFrameElement,
  routePayload: Record<string, unknown>,
): boolean {
  if (!frame.contentWindow) return false;
  const targetOrigin = resolvePostMessageTargetOrigin(frame);
  if (targetOrigin !== window.location.origin) return false;

  try {
    const child = frame.contentWindow as Window & {
      FplacesRouteBridge?: {
        applyRoute: (
          payload: Record<string, unknown>,
          source: string,
        ) => unknown;
        applyNavigationSync?: (
          progress: NavigationProgressSnapshot,
          source: string,
        ) => void;
      };
      fplacesActiveRoute?: unknown;
    };
    if (!child.FplacesRouteBridge?.applyRoute) return false;

    child.FplacesRouteBridge.applyRoute(routePayload, "parent-direct");
    const progress = routePayload.navigationProgress as
      | NavigationProgressSnapshot
      | undefined;
    if (progress && child.FplacesRouteBridge?.applyNavigationSync) {
      child.FplacesRouteBridge.applyNavigationSync(progress, "parent-direct");
    } else if (progress) {
      syncNavigationToAr(progress);
    }
    appLog("AR", "Direct iframe route apply", {
      hasActiveRoute: Boolean(child.fplacesActiveRoute),
      alongPathMeters: progress?.alongPathMeters,
      routeId: routePayload.routeId,
      routeVersion: routePayload.routeVersion,
    });
    return true;
  } catch (error) {
    appWarn("AR", "Direct iframe route apply failed", error);
    return false;
  }
}

function deliverRoutePostMessage(
  frame: HTMLIFrameElement,
  routePayload: Record<string, unknown>,
): void {
  if (!frame.contentWindow) return;
  const targetOrigin = resolvePostMessageTargetOrigin(frame);
  frame.contentWindow.postMessage(
    { type: "fplaces_route", route: routePayload },
    targetOrigin,
  );
  const progress = routePayload.navigationProgress as
    | NavigationProgressSnapshot
    | undefined;
  if (progress) {
    syncNavigationToAr(progress);
  }
}

function deliverRouteToFrame(
  frame: HTMLIFrameElement,
  routePayload: Record<string, unknown>,
): RouteDeliveryResult {
  if (!frame.contentWindow) {
    return {
      accepted: false,
      routeId: String(routePayload.routeId ?? ''),
      routeVersion: Number(routePayload.routeVersion ?? 0),
      source: 'postMessage',
    };
  }

  const pathCoordinates = routePayload.pathCoordinates;
  const pathPointCount = Array.isArray(pathCoordinates)
    ? pathCoordinates.length
    : 0;

  appWarn("AR", "Delivering route to iframe", {
    targetOrigin: resolvePostMessageTargetOrigin(frame),
    pathPointCount,
    destinationName: routePayload.destinationName,
    routeId: routePayload.routeId,
    routeVersion: routePayload.routeVersion,
  });

  routeLifecycleManager.transition('sentToAR');

  // Priority 1: same-origin direct bridge
  if (deliverRouteDirect(frame, routePayload)) {
    return {
      accepted: true,
      routeId: String(routePayload.routeId ?? ''),
      routeVersion: Number(routePayload.routeVersion ?? 0),
      source: 'direct',
    };
  }

  // Priority 2: postMessage
  deliverRoutePostMessage(frame, routePayload);

  // Priority 3: session storage (fallback for slow iframe load)
  stashRouteHandoff(routePayload);

  return {
    accepted: false,
    routeId: String(routePayload.routeId ?? ''),
    routeVersion: Number(routePayload.routeVersion ?? 0),
    source: 'postMessage',
  };
}

/** Deliver route with acknowledgement and automatic retry. */
export function deliverRouteWithRetry(
  routePayload: Record<string, unknown>,
): Promise<RouteDeliveryResult> {
  const frame = document.querySelector("#ar-frame") as HTMLIFrameElement | null;
  const routeId = String(routePayload.routeId ?? '');
  const routeVersion = Number(routePayload.routeVersion ?? 0);

  if (!frame?.contentWindow || frame.hidden) {
    stashRouteHandoff(routePayload);
    return Promise.resolve({
      accepted: false,
      routeId,
      routeVersion,
      source: 'sessionStorage',
    });
  }

  return new Promise((resolve) => {
    let attempts = 0;

    const tryDeliver = () => {
      attempts++;
      const result = deliverRouteToFrame(frame, routePayload);

      if (result.source === 'direct') {
        resolve({ ...result, attempts });
        return;
      }

      if (pendingRouteAck) {
        clearTimeout(pendingRouteAck.timer);
      }

      pendingRouteAck = {
        routeId,
        routeVersion,
        resolve: (ackResult) => {
          resolve({ ...ackResult, attempts });
        },
        timer: window.setTimeout(() => {
          pendingRouteAck = null;
          if (attempts < ROUTE_DELIVERY_MAX_RETRIES) {
            appWarn("AR", `Route ack timeout - retry ${attempts}/${ROUTE_DELIVERY_MAX_RETRIES}`, {
              routeId,
              routeVersion,
            });
            tryDeliver();
          } else {
            appWarn("AR", "Route delivery failed after max retries - stashed in sessionStorage", {
              routeId,
              routeVersion,
            });
            stashRouteHandoff(routePayload);
            resolve({
              accepted: false,
              routeId,
              routeVersion,
              source: 'sessionStorage',
              attempts,
            });
          }
        }, ROUTE_ACK_TIMEOUT_MS),
      };
    };

    tryDeliver();
  });
}

/** Incremental navigation sync - leg, floor, version changes without full reopen. */
export function syncNavigationState(payload: NavigationSyncPayload): void {
  const frameEl = document.querySelector("#ar-frame") as HTMLIFrameElement | null;
  const shell = document.querySelector("#ar-pip-shell") as HTMLElement | null;
  if (!shell || shell.hidden || !frameEl?.contentWindow) return;

  const targetOrigin = resolvePostMessageTargetOrigin(frameEl);
  const arPayload = buildArRoutePayload(
    payload.route,
    payload.currentLegIndex,
    payload.instructions,
    null,
    undefined,
    payload.navigationProgress,
  );

  arPayload.syncReason = payload.reason;
  arPayload.partialUpdate = payload.reason !== 'reroute' && payload.reason !== 'handoff';

  // Direct bridge for same-origin
  if (targetOrigin === window.location.origin) {
    try {
      const child = frameEl.contentWindow as Window & {
        FplacesRouteBridge?: {
          applyRoute?: (p: Record<string, unknown>, s: string) => unknown;
          applyNavigationSync?: (p: NavigationProgressSnapshot, s: string) => void;
        };
      };
      if (payload.reason === 'reroute' || payload.reason === 'handoff') {
        child.FplacesRouteBridge?.applyRoute?.(arPayload, `parent-sync-${payload.reason}`);
      } else {
        frameEl.contentWindow.postMessage(
          {
            type: 'fplaces_navigation_state',
            route: arPayload,
            currentLegIndex: payload.currentLegIndex,
            instructions: payload.instructions,
            reason: payload.reason,
          },
          targetOrigin,
        );
      }
    } catch {
      /* fall through to postMessage */
    }
  }

  if (payload.navigationProgress) {
    syncNavigationToAr(payload.navigationProgress);
  }

  appLog("AR", "Navigation state sync", {
    reason: payload.reason,
    currentLegIndex: payload.currentLegIndex,
    routeVersion: payload.route.routeVersion,
  });
}

export function handleRouteAck(
  routeId: string,
  routeVersion: number,
  accepted: boolean,
): void {
  if (
    pendingRouteAck &&
    pendingRouteAck.routeId === routeId &&
    pendingRouteAck.routeVersion === routeVersion
  ) {
    clearTimeout(pendingRouteAck.timer);
    pendingRouteAck.resolve({
      accepted,
      routeId,
      routeVersion,
      source: 'ack',
    });
    pendingRouteAck = null;
    if (accepted) {
      routeLifecycleManager.transition('accepted');
    }
  }
}

type ArLiveViewChild = Window & {
  __fplacesActivateLiveView?: (options: LiveViewLaunchOptions) => boolean;
  __fplacesParkLiveView?: () => void;
  FplacesRouteBridge?: {
    applyRoute: (payload: Record<string, unknown>, source: string) => unknown;
  };
  FplacesCameraStart?: {
    applyParentPermissions?: (data: { camera: string }) => void;
    recoverIfWaiting?: () => void;
  };
  FPLACES_AR_CONFIG?: { buildId?: string };
  __fplacesXrPipelineReady?: boolean;
  XR8?: unknown;
  THREE?: unknown;
};

type PendingLiveViewActivate = {
  url: string;
  routePayload?: Record<string, unknown>;
  launch: LiveViewLaunchOptions;
};

let pendingLiveViewActivate: PendingLiveViewActivate | null = null;
let pendingLiveViewActivateTimer: ReturnType<typeof setTimeout> | null = null;

function buildPreloadArSrc(): string {
  const base = resolveArBaseUrl();
  return `${base}?arDebug=0&preload=1&build=${encodeURIComponent(appConfig.arBuildId)}`;
}

function readArLiveViewChild(frame: HTMLIFrameElement): ArLiveViewChild | null {
  try {
    return frame.contentWindow as ArLiveViewChild;
  } catch {
    return null;
  }
}

function snapshotArChild(child: ArLiveViewChild | null): WarmedArChildSnapshot | null {
  if (!child) return null;
  return {
    hasActivate: typeof child.__fplacesActivateLiveView === "function",
    hasRouteBridge: typeof child.FplacesRouteBridge?.applyRoute === "function",
    buildId: child.FPLACES_AR_CONFIG?.buildId ?? null,
    pipelineReady: Boolean(child.__fplacesXrPipelineReady),
    hasXrEngine: Boolean(child.THREE && child.XR8),
  };
}

function liveViewLaunchOptions(
  cameraReady: boolean,
  startXrNow = true,
): LiveViewLaunchOptions {
  return {
    autoCalibrate: true,
    preferVenuePositioning: true,
    useWorldRoute: true,
    cameraReady,
    pwaOrigin: typeof window !== "undefined" ? window.location.origin : "",
    startXrNow,
  };
}

function revealArStartFallback(): void {
  hideArBootOverlay();
  const frame = document.querySelector("#ar-frame") as HTMLIFrameElement | null;
  if (!frame) return;
  try {
    readArLiveViewChild(frame)?.FplacesCameraStart?.recoverIfWaiting?.();
  } catch {
    /* ignore */
  }
}

function clearPendingLiveViewActivate(): void {
  pendingLiveViewActivate = null;
  if (pendingLiveViewActivateTimer != null) {
    window.clearTimeout(pendingLiveViewActivateTimer);
    pendingLiveViewActivateTimer = null;
  }
}

function parkArIframe(): void {
  const frame = document.querySelector("#ar-frame") as HTMLIFrameElement | null;
  if (!frame) return;
  const child = readArLiveViewChild(frame);
  try {
    child?.__fplacesParkLiveView?.();
  } catch (error) {
    appWarn("AR", "Park Live View failed", error);
  }
}

function tryActivateWarmedArIframe(
  frame: HTMLIFrameElement,
  routePayload: Record<string, unknown> | undefined,
  launch: LiveViewLaunchOptions,
): boolean {
  if (
    !shouldReuseWarmedArIframe({
      src: frame.getAttribute("src") || frame.src,
      sameOrigin: isArSameOrigin(),
      expectedBuildId: appConfig.arBuildId,
      child: snapshotArChild(readArLiveViewChild(frame)),
    })
  ) {
    return false;
  }

  const child = readArLiveViewChild(frame);
  if (!child?.__fplacesActivateLiveView) return false;

  try {
    if (routePayload) {
      if (!deliverRouteDirect(frame, routePayload)) {
        deliverRoutePostMessage(frame, routePayload);
        stashRouteHandoff(routePayload);
      }
    }
    const activated = child.__fplacesActivateLiveView(launch);
    if (activated === false) return false;
    syncArPresentationToFrame();
    appLog("AR", "Reused warmed Live View iframe", {
      pipelineReady: Boolean(child.__fplacesXrPipelineReady),
      hasXrEngine: Boolean(child.THREE && child.XR8),
      startXrNow: launch.startXrNow,
    });
    return true;
  } catch (error) {
    appWarn("AR", "Warm iframe activate failed", error);
    return false;
  }
}

function loadLiveViewUrl(
  frame: HTMLIFrameElement,
  url: string,
  routePayload?: Record<string, unknown>,
): void {
  const onLiveViewLoaded = () => {
    syncArPresentationToFrame();
    if (!routePayload || !frame.contentWindow) return;
    if (tryActivateWarmedArIframe(frame, routePayload, liveViewLaunchOptions(false, true))) {
      return;
    }
    void deliverRouteWithRetry(routePayload).then((result) => {
      appLog("AR", "Route delivery result", result);
    });
  };

  frame.addEventListener("load", onLiveViewLoaded, { once: true });
  if (routePayload) {
    stashRouteHandoff(routePayload);
    window.setTimeout(onLiveViewLoaded, 400);
    window.setTimeout(onLiveViewLoaded, 1200);
    window.setTimeout(onLiveViewLoaded, 2500);
  }
  frame.src = url;
}

function flushPendingLiveViewActivate(): boolean {
  const pending = pendingLiveViewActivate;
  if (!pending) return false;
  const frame = document.querySelector("#ar-frame") as HTMLIFrameElement | null;
  if (!frame) return false;
  if (tryActivateWarmedArIframe(frame, pending.routePayload, pending.launch)) {
    clearPendingLiveViewActivate();
    return true;
  }
  return false;
}

function queuePreloadActivate(
  frame: HTMLIFrameElement,
  url: string,
  routePayload: Record<string, unknown> | undefined,
  launch: LiveViewLaunchOptions,
): void {
  pendingLiveViewActivate = { url, routePayload, launch };
  if (routePayload) stashRouteHandoff(routePayload);
  if (pendingLiveViewActivateTimer != null) {
    window.clearTimeout(pendingLiveViewActivateTimer);
  }
  pendingLiveViewActivateTimer = window.setTimeout(() => {
    const pending = pendingLiveViewActivate;
    pendingLiveViewActivateTimer = null;
    if (!pending) return;
    pendingLiveViewActivate = null;
    appWarn("AR", "Preload activate timed out - loading Live View URL");
    loadLiveViewUrl(frame, pending.url, pending.routePayload);
  }, PRELOAD_ACTIVATE_WAIT_MS);

  const onLoad = () => {
    flushPendingLiveViewActivate();
  };
  frame.addEventListener("load", onLoad, { once: true });
  window.setTimeout(onLoad, 0);
  window.setTimeout(onLoad, 300);
}

export function warmArIframe(): void {
  if (typeof window === "undefined" || !window.isSecureContext) return;
  const frame = document.querySelector("#ar-frame") as HTMLIFrameElement | null;
  if (!frame) return;
  if (currentArPresentation !== "closed") return;

  frame.setAttribute("allow", AR_IFRAME_ALLOW);
  const src = frame.getAttribute("src") || "";
  const preloadSrc = buildPreloadArSrc();
  if (
    !src ||
    src === "about:blank" ||
    preloadSrcNeedsRefresh({
      src,
      expectedBuildId: appConfig.arBuildId,
      baseHref: window.location.href,
    })
  ) {
    frame.src = preloadSrc;
  }
}

export function openArFullscreen(
  url: string,
  routePayload?: Record<string, unknown>,
  options?: { cameraReady?: boolean },
): HTMLIFrameElement {
  const frame = document.querySelector("#ar-frame") as HTMLIFrameElement;
  frame.setAttribute("allow", AR_IFRAME_ALLOW);

  const pathPointCount = Array.isArray(routePayload?.pathCoordinates)
    ? routePayload.pathCoordinates.length
    : 0;
  const launch = liveViewLaunchOptions(Boolean(options?.cameraReady), true);

  appWarn("AR", "Opening AR iframe", {
    url,
    urlLength: url.length,
    hasRoutePayload: Boolean(routePayload),
    pathPointCount,
    arBase: appConfig.arUrl,
    reuse: shouldReuseWarmedArIframe({
      src: frame.getAttribute("src") || frame.src,
      sameOrigin: isArSameOrigin(),
      expectedBuildId: appConfig.arBuildId,
      child: snapshotArChild(readArLiveViewChild(frame)),
    }),
  });

  // Show shell before delivery so deliverRouteWithRetry is not blocked by frame.hidden.
  setArPresentation("fullscreen");
  showArBootOverlay();
  armArBootOverlayFallback(revealArStartFallback);

  if (tryActivateWarmedArIframe(frame, routePayload, launch)) {
    clearPendingLiveViewActivate();
    return frame;
  }

  if (
    shouldWaitForInFlightPreload({
      src: frame.getAttribute("src") || frame.src,
      sameOrigin: isArSameOrigin(),
      child: snapshotArChild(readArLiveViewChild(frame)),
    })
  ) {
    appLog("AR", "Waiting for in-flight Live View preload");
    queuePreloadActivate(frame, url, routePayload, launch);
    return frame;
  }

  loadLiveViewUrl(frame, url, routePayload);
  return frame;
}

/** Tell Live View that the parent already resolved camera permission for this origin. */
export function notifyArIframePermissions(camera: ArIframeCameraPermission): void {
  const granted = camera === "granted";
  try {
    if (granted) {
      sessionStorage.setItem(CAMERA_HANDOFF_KEY, "1");
    } else {
      sessionStorage.removeItem(CAMERA_HANDOFF_KEY);
    }
  } catch {
    /* quota / private mode */
  }

  const deliver = () => {
    const frame = document.querySelector("#ar-frame") as HTMLIFrameElement | null;
    if (!frame?.contentWindow) return;
    const child = readArLiveViewChild(frame);
    try {
      if (typeof child?.FplacesCameraStart?.applyParentPermissions === "function") {
        child.FplacesCameraStart.applyParentPermissions({ camera });
        return;
      }
    } catch {
      /* fall through to postMessage */
    }
    frame.contentWindow.postMessage(
      { type: "fplaces_permissions", camera },
      resolvePostMessageTargetOrigin(frame),
    );
  };

  deliver();
  window.setTimeout(deliver, 400);
  window.setTimeout(deliver, 1200);
}

/** Run AR health / SLAM helpers against the Live View iframe from the parent console. */
export function installArConsoleHelpers(): void {
  type ArChildWindow = Window & {
    logArHealth?: () => unknown;
    logSlamStatus?: () => unknown;
    debugArCamera?: () => unknown;
    FplacesSlamDiagnostics?: {
      runHealthCheck?: (reason: string) => unknown;
      audit?: (reason: string) => unknown;
      debugArCamera?: () => unknown;
    };
    FPLACES_AR_CONFIG?: { buildId?: string };
  };

  function arFrameWindow(): ArChildWindow | null {
    const frame = document.querySelector("#ar-frame") as HTMLIFrameElement | null;
    if (!frame?.contentWindow) return null;
    return frame.contentWindow as ArChildWindow;
  }

  const w = window as Window & {
    logArHealth?: () => unknown;
    logSlamStatus?: () => unknown;
    debugArCamera?: () => unknown;
    arBuildId?: () => string | null;
    __fplacesArFrame?: () => ArChildWindow | null;
  };

  w.__fplacesArFrame = arFrameWindow;

  w.logArHealth = () => {
    const child = arFrameWindow();
    if (!child) {
      console.warn(
        "[fplaces] logArHealth: Live View is not open. Generate a route, tap Live View, then try again.",
      );
      return null;
    }
    if (typeof child.logArHealth === "function") {
      return child.logArHealth();
    }
    if (child.FplacesSlamDiagnostics?.runHealthCheck) {
      return child.FplacesSlamDiagnostics.runHealthCheck("parent-console");
    }
    console.warn(
      "[fplaces] logArHealth: AR iframe is open but diagnostics are not loaded yet. Wait a few seconds or hard-refresh.",
    );
    return null;
  };

  w.logSlamStatus = () => {
    const child = arFrameWindow();
    if (!child) {
      console.warn(
        "[fplaces] logSlamStatus: Live View is not open. Generate a route, tap Live View, then try again.",
      );
      return null;
    }
    if (typeof child.logSlamStatus === "function") {
      return child.logSlamStatus();
    }
    if (child.FplacesSlamDiagnostics?.audit) {
      return child.FplacesSlamDiagnostics.audit("parent-console");
    }
    console.warn(
      "[fplaces] logSlamStatus: AR iframe is open but diagnostics are not loaded yet.",
    );
    return null;
  };

  w.debugArCamera = () => {
    const child = arFrameWindow();
    if (!child) {
      console.warn(
        "[fplaces] debugArCamera: Live View is not open. Generate a route, tap Live View, then try again.",
      );
      return null;
    }
    if (typeof child.debugArCamera === "function") {
      return child.debugArCamera();
    }
    if (child.FplacesSlamDiagnostics?.debugArCamera) {
      return child.FplacesSlamDiagnostics.debugArCamera();
    }
    console.warn(
      "[fplaces] debugArCamera: AR iframe open but diagnostics not loaded - hard refresh.",
    );
    return null;
  };

  w.arBuildId = () => {
    const child = arFrameWindow();
    if (!child) {
      console.warn(
        "[fplaces] arBuildId: Live View is not open - open Live View first.",
      );
      return null;
    }
    const buildId = child.FPLACES_AR_CONFIG?.buildId ?? null;
    if (!buildId) {
      console.warn(
        "[fplaces] arBuildId: iframe open but config not loaded - hard refresh Live View.",
      );
      return null;
    }
    console.log("[fplaces] AR buildId:", buildId);
    return buildId;
  };
}

/** Mirror AR iframe debug lines into the parent DevTools console (dev only). */
export function installArDebugRelay(): void {
  if (!import.meta.env.DEV) return;

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || data.type !== "fplaces_ar_debug") return;
    if (event.origin !== window.location.origin) return;

    const line = data.line ?? `[${data.phase}] ${data.message}`;
    if (data.level === "error") {
      console.error(`[fplaces AR iframe] ${line}`, data.detail ?? "");
    } else if (data.level === "warn") {
      console.warn(`[fplaces AR iframe] ${line}`, data.detail ?? "");
    } else {
      console.log(`[fplaces AR iframe] ${line}`, data.detail ?? "");
    }
  });

  (
    window as Window & { __fplacesArDebug?: () => Record<string, unknown> }
  ).__fplacesArDebug = () => {
    const frame = document.querySelector(
      "#ar-frame",
    ) as HTMLIFrameElement | null;
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

  appLog(
    "AR",
    'Debug relay installed - filter console with "IndoorNav" or "fplaces AR"',
  );
  console.warn(
    "[fplaces] AR helpers: logArHealth() | logSlamStatus() | debugArCamera() - run while Live View is open.",
  );
}

export function closeArFullscreen(): void {
  setArPresentation("closed");
}

/** Central PWA listener for postMessage events emitted by the AR iframe. */
export function installArMessageBridge(host: ArMessageBridgeHost): void {
  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;

    const message = event.data;
    if (
      !message ||
      typeof message !== "object" ||
      typeof message.type !== "string"
    ) {
      return;
    }

    switch (message.type) {
      case "fplaces_start_movement": {
        console.log(
          "[PWA Bridge] Received start signal. Activating simulator progression.",
        );
        const alongPathMeters =
          typeof message.alongPathMeters === "number"
            ? message.alongPathMeters
            : undefined;
        appLog("PWA Bridge", "fplaces_start_movement received", {
          alongPathMeters,
        });
        host.startRouteMovement({ alongPathMeters });
        break;
      }
      case "fplaces_ar_back":
      case "fplaces_ar_close":
        appLog("PWA Bridge", `${message.type} received`);
        host.closeAr();
        break;
      case "fplaces_ar_arrived":
        navDiag?.record('arrival-message', 'installArMessageBridge', { eventSourceIsArFrame: event.source === document.querySelector<HTMLIFrameElement>('#ar-frame')?.contentWindow });
        appLog("PWA Bridge", "fplaces_ar_arrived received");
        host.lockNavigationArrival();
        break;
      case "fplaces_ar_arrived_done":
        appLog("PWA Bridge", "fplaces_ar_arrived_done received");
        void host.endArNavigation();
        break;
      case "fplaces_ar_minimize":
        appLog("PWA Bridge", "fplaces_ar_minimize received");
        host.minimizeAr();
        break;
      case "fplaces_ar_maximize":
        appLog("PWA Bridge", "fplaces_ar_maximize received");
        host.maximizeAr();
        break;
      case "fplaces_ar_ready":
      case "fplaces_ar_engine_ready":
        syncArPresentationToFrame();
        flushPendingLiveViewActivate();
        break;
      case "fplaces_ar_camera_started":
        hideArBootOverlay();
        break;
      case "fplaces_ar_needs_tap":
        hideArBootOverlay();
        break;
      case "fplaces_floor_change": {
        const floorId =
          typeof message.floorId === "string" ? message.floorId : null;
        if (floorId) {
          appLog("PWA Bridge", "fplaces_floor_change received", { floorId });
          host.forceFloor?.(floorId);
        }
        break;
      }
      case "fplaces_route_ack": {
        const routeId = typeof message.routeId === "string" ? message.routeId : "";
        const routeVersion =
          typeof message.routeVersion === "number" ? message.routeVersion : 0;
        const accepted = message.accepted !== false;
        appLog("PWA Bridge", "fplaces_route_ack received", {
          routeId,
          routeVersion,
          accepted,
        });
        handleRouteAck(routeId, routeVersion, accepted);
        break;
      }
      default:
        break;
    }
  });

  appLog("PWA Bridge", "AR message bridge installed");
}
