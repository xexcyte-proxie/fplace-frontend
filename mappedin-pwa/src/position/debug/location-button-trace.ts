import { clearLocationDiagnosticEvents, getLocationDiagnosticReport } from '../../location/domain/location-diagnostics';

/** Precise-location diagnostics: development only, memory only, bounded history. */
type Channel = 'Location' | 'Simulation' | 'BlueDot';
type Level = 'success' | 'info' | 'warning' | 'error';
interface Event { step: number; elapsedMs: number; at: string; channel: Channel; level: Level; message: string; values: unknown }
interface Report { schemaVersion: number; interactionId: string; startedAt: string; outcome: string; context: unknown; events: Event[]; finalState?: unknown }
export interface LocationButtonTrace {
  step(channel: Channel, message: string, values?: () => unknown, level?: Level): void;
  finish(outcome: string, finalState?: () => unknown): void;
}
const reports: Report[] = [];
const inProgress = new Map<string, Report>();
let sequence = 0;
let readCurrentState: (() => unknown) | undefined;
const bootedAt = new Date().toISOString();
function snapshot(read?: () => unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(read?.() ?? null, (_key, value) => {
      if (value instanceof Error) return { name: value.name, message: value.message, code: (value as Error & { code?: number }).code };
      return value;
    }));
  } catch (error) { return { diagnosticReadError: error instanceof Error ? error.message : String(error) }; }
}
function safely(write: () => void): void { try { write(); } catch { /* Diagnostics never interrupt location acquisition. */ } }
/** Bootstrap independently of maps, permission grants and location-button interactions. */
export function installLocationDiagnostics(readState?: () => unknown): void {
  if (!import.meta.env.DEV || typeof window === 'undefined') return;
  if (readState) readCurrentState = readState;
  safely(() => { window.FplacesLocationDiagnostics = {
    version: 2,
    export: (id?: string) => JSON.stringify(id ? reports.find(r => r.interactionId === id) ?? null : reports.at(-1) ?? null, null, 2),
    exportAll: () => JSON.stringify({
      schemaVersion: 2, capturedAt: new Date().toISOString(),
      runtime: runtimeStatus(),
      currentState: snapshot(readCurrentState),
      locationLifecycle: snapshot(() => JSON.parse(getLocationDiagnosticReport())),
      interactions: reports, inProgress: [...inProgress.values()],
      positioning: snapshot(() => (window as Window & { FplacesPositionDiagnostics?: { snapshot(): unknown } }).FplacesPositionDiagnostics?.snapshot()),
      navigation: snapshot(() => window.FplacesNavigationDiagnostics ? JSON.parse(window.FplacesNavigationDiagnostics.export('absolute')) : null),
    }, null, 2),
    status: async () => ({ ...runtimeStatus(), serviceWorkers: await serviceWorkerStatus() }),
    list: () => reports.map(({ interactionId, startedAt, outcome }) => ({ interactionId, startedAt, outcome })),
    clear: () => { reports.length = 0; inProgress.clear(); },
    clearAll: () => {
      reports.length = 0; inProgress.clear(); clearLocationDiagnosticEvents();
      (window as Window & { FplacesPositionDiagnostics?: { clear?(): void } }).FplacesPositionDiagnostics?.clear?.();
      window.FplacesNavigationDiagnostics?.clear();
    },
  }; });
}
function runtimeStatus() {
  return { development: import.meta.env.DEV, mode: import.meta.env.MODE, apiVersion: 2, bootedAt,
    url: typeof location === 'undefined' ? null : location.origin + location.pathname,
    moduleUrl: import.meta.url,
    frame: window.self === window.top ? 'top' : 'iframe',
    serviceWorkerController: typeof navigator === 'undefined' ? null : navigator.serviceWorker?.controller?.scriptURL ?? null,
    scope: 'current tab; bounded in-memory history; full report includes precise development locations' };
}
async function serviceWorkerStatus() {
  try {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker?.getRegistrations) return [];
    return (await navigator.serviceWorker.getRegistrations()).map(registration => ({ scope: registration.scope,
      active: registration.active?.scriptURL ?? null, activeState: registration.active?.state ?? null,
      waiting: registration.waiting?.scriptURL ?? null, installing: registration.installing?.scriptURL ?? null }));
  } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
}

declare global {
  interface Window {
    FplacesLocationDiagnostics?: {
      version: number;
      export(id?: string): string;
      exportAll(): string;
      status(): Promise<unknown>;
      list(): { interactionId: string; startedAt: string; outcome: string }[];
      clear(): void;
      clearAll(): void;
    };
  }
}
export function beginLocationButtonTrace(context: () => unknown): LocationButtonTrace | undefined {
  if (!import.meta.env.DEV) return undefined;
  safely(() => installLocationDiagnostics());
  const started = performance.now();
  const report: Report = { schemaVersion: 1, interactionId: `location-${Date.now()}-${++sequence}`, startedAt: new Date().toISOString(), outcome: 'running', context: snapshot(context), events: [] };
  inProgress.set(report.interactionId, report);
  if (inProgress.size > 10) inProgress.delete(inProgress.keys().next().value!);
  let finished = false;
  const trace: LocationButtonTrace = {
    step(channel, message, values, level = 'info') {
      if (finished || !import.meta.env.DEV) return;
      const details = snapshot(values);
      if (channel === 'BlueDot' && level === 'info' && details && typeof details === 'object') {
        const state = details as Record<string, unknown>;
        if (state.matchesExpectedWithin1cm === false || state.configuredVisible === false || state.enabled === false || state.floorMatchesView === false) level = 'warning';
      }
      const event: Event = { step: report.events.length + 1, elapsedMs: Math.round(performance.now() - started), at: new Date().toISOString(), channel, level, message, values: details };
      if (report.events.length < 100) report.events.push(event);
      safely(() => window.FplacesNavigationDiagnostics?.record('location-button', 'LocationButtonTrace', {
        ...event, name: message, interactionId: report.interactionId,
        severity: level === 'warning' ? 'warning' : level === 'error' ? 'error' : 'info',
      }));
      safely(() => {
        const write = level === 'error' ? console.error : level === 'warning' ? console.warn : console.log;
        write.call(console, `[Fplaces:${channel}] [${report.interactionId}] ${event.step}. ${level.toUpperCase()}: ${message}`, event.values);
      });
    },
    finish(outcome, finalState) {
      if (finished || !import.meta.env.DEV) return;
      trace.step('Location', `Interaction completed: ${outcome}`, finalState, outcome === 'success' ? 'success' : 'warning');
      finished = true; report.outcome = outcome; report.finalState = snapshot(finalState);
      inProgress.delete(report.interactionId);
      reports.push(report); if (reports.length > 10) reports.shift();
      const json = JSON.stringify(report, null, 2);
      safely(() => {
        // Open the group only now: concurrent async requests cannot misnest console groups.
        console.groupCollapsed(`[Fplaces:Location] [${report.interactionId}] ${outcome.toUpperCase()} — complete diagnostic trace`);
        try {
          console.log('Selected venue / initial state', report.context);
          console.table(report.events.map(({ step, elapsedMs, channel, level, message }) => ({ step, elapsedMs, channel, level, message })));
          for (const event of report.events) console.log(`[Fplaces:${event.channel}] ${event.step}. ${event.message}`, event.values);
          console.log('[Fplaces:Location] COPYABLE DIAGNOSTIC SUMMARY (precise development location data)\n' + json);
          console.log(`Copy this interaction: copy(window.FplacesLocationDiagnostics.export('${report.interactionId}'))`);
          console.log('Copy complete location report: copy(window.FplacesLocationDiagnostics.exportAll())');
        } finally { console.groupEnd(); }
      });
    },
  };
  trace.step('Location', 'Get Current Location tapped', () => report.context);
  return trace;
}
