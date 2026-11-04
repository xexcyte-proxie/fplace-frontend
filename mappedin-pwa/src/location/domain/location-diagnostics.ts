/** In-memory diagnostics for the current tab; never includes coordinates or tokens. */
type DiagnosticEvent = { time: string; event: string; detail: Record<string, unknown> };
const events: DiagnosticEvent[] = [];

export function recordLocationDiagnostic(event: string, detail: Record<string, unknown> = {}): void {
  if (!import.meta.env.DEV) return;
  events.push({ time: new Date().toISOString(), event, detail });
  if (events.length > 40) events.shift();
}

export function locationErrorDetail(error: unknown): Record<string, unknown> {
  const value = error as { code?: unknown; message?: unknown; name?: unknown } | null;
  const code = typeof value?.code === 'number' ? value.code : null;
  return {
    code,
    category: code === 1 ? 'permission-denied' : code === 2 ? 'position-unavailable' : code === 3 ? 'timeout' : 'other',
    message: typeof value?.message === 'string' ? value.message : 'Unknown location error',
  };
}

export function getLocationDiagnosticReport(): string {
  const policy = typeof document === 'undefined' ? undefined :
    (document as Document & { permissionsPolicy?: { allowsFeature(name: string): boolean }; featurePolicy?: { allowsFeature(name: string): boolean } });
  let policyAllowsGeolocation: boolean | string = 'unknown';
  try {
    policyAllowsGeolocation = (policy?.permissionsPolicy ?? policy?.featurePolicy)?.allowsFeature('geolocation') ?? 'unknown';
  } catch { /* Policy introspection is unavailable in some browsers. */ }
  return JSON.stringify({
    capturedAt: new Date().toISOString(),
    environment: {
      origin: typeof location === 'undefined' ? 'unknown' : location.origin,
      secureContext: typeof window === 'undefined' ? 'unknown' : window.isSecureContext,
      embedded: typeof window === 'undefined' ? 'unknown' : window.self !== window.top,
      geolocationAvailable: typeof navigator !== 'undefined' && Boolean(navigator.geolocation),
      permissionsApiAvailable: typeof navigator !== 'undefined' && Boolean(navigator.permissions?.query),
      online: typeof navigator === 'undefined' ? 'unknown' : navigator.onLine,
      visibility: typeof document === 'undefined' ? 'unknown' : document.visibilityState,
      browser: typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent,
      policyAllowsGeolocation,
    },
    events,
  }, null, 2);
}
