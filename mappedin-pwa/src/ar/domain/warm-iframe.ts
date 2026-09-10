/** Launch flags the PWA applies when reusing a preloaded Live View document. */
export type LiveViewLaunchOptions = {
  autoCalibrate: boolean;
  preferVenuePositioning: boolean;
  useWorldRoute: boolean;
  cameraReady: boolean;
  pwaOrigin: string;
  /** Start XR from the parent AR-mode click instead of an iframe Start tap. */
  startXrNow: boolean;
};

export type WarmedArChildSnapshot = {
  hasActivate: boolean;
  hasRouteBridge: boolean;
  buildId?: string | null;
  pipelineReady?: boolean;
  hasXrEngine?: boolean;
};

const PRELOAD_PARAM = 'preload';

export function isUsableWarmedArSrc(src: string | null | undefined): boolean {
  return Boolean(src) && src !== 'about:blank';
}

export function isPreloadArSrc(
  src: string | null | undefined,
  baseHref = 'https://local.invalid/',
): boolean {
  if (!src) return false;
  try {
    return new URL(src, baseHref).searchParams.get(PRELOAD_PARAM) === '1';
  } catch {
    return /(?:\?|&)preload=1(?:&|$)/.test(src);
  }
}

export function shouldReuseWarmedArIframe(input: {
  src: string | null | undefined;
  sameOrigin: boolean;
  expectedBuildId: string;
  child: WarmedArChildSnapshot | null;
}): boolean {
  if (!input.sameOrigin) return false;
  if (!isUsableWarmedArSrc(input.src)) return false;
  if (!input.child?.hasActivate || !input.child.hasRouteBridge) return false;
  if (input.child.buildId && input.child.buildId !== input.expectedBuildId) {
    return false;
  }
  return true;
}

/** Preload document is navigating but activate() is not ready yet: do not restart. */
export function shouldWaitForInFlightPreload(input: {
  src: string | null | undefined;
  sameOrigin: boolean;
  child: WarmedArChildSnapshot | null;
}): boolean {
  if (!input.sameOrigin) return false;
  if (!isUsableWarmedArSrc(input.src)) return false;
  if (!isPreloadArSrc(input.src)) return false;
  return !input.child?.hasActivate;
}

export function preloadSrcNeedsRefresh(input: {
  src: string | null | undefined;
  expectedBuildId: string;
  baseHref?: string;
}): boolean {
  if (!isUsableWarmedArSrc(input.src) || !input.src) return true;
  try {
    const current = new URL(input.src, input.baseHref || 'https://local.invalid/');
    return current.searchParams.get('build') !== input.expectedBuildId;
  } catch {
    return true;
  }
}
