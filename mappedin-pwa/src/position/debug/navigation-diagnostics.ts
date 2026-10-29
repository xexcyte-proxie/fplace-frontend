// Shared plain-script implementation is also used in the AR iframe.
// @ts-ignore -- browser side-effect script, intentionally no module exports
import '../../../../ar-nav/js/navigation-diagnostics-core.js';
// @ts-ignore -- shared browser UI
import '../../../../ar-nav/js/navigation-diagnostics-ui.js';
import type { FplacesPositionFrame } from '../types';
interface Recorder {
  development: boolean; recording: boolean; frozen: boolean; cause: number | null;
  record(type: string, source: string, data?: unknown, cause?: number | null): number | null;
  update(type: string, source: string, data: unknown): number | null;
  sample(type: string, source: string, data: unknown, intervalMs?: number): number | null;
  timeline(limit?: number): unknown[];
  statistics(): { recording: boolean; retained: number; dropped: number; capacity: number; durationMs: number };
  distance(a: { latitude: number; longitude: number } | null | undefined, b: { latitude: number; longitude: number } | null | undefined): number | null;
  metadata(data: unknown): void; start(): void; stop(): void; clear(): void; capture(): void;
  accept(frame: FplacesPositionFrame): FplacesPositionFrame;
  snapshot(): unknown; export(mode?: string): string;
}
declare global {
  interface Window {
    createFplacesNavigationDiagnostics: (options?: unknown) => Recorder;
    mountFplacesNavigationDiagnostics: (recorder: Recorder, doc?: Document, options?: unknown) => void;
    FplacesNavigationDiagnostics?: Recorder;
  }
}
export const navigationDiagnostics = import.meta.env.DEV && typeof window !== 'undefined'
  ? (window.FplacesNavigationDiagnostics ??= window.createFplacesNavigationDiagnostics()) : undefined;
if (navigationDiagnostics) {
  navigationDiagnostics.metadata({ appVersion: '0.1.0', userAgent: navigator.userAgent,
    deviceCategory: /Mobile|iPhone|Android/.test(navigator.userAgent) ? 'mobile' : 'desktop',
    timeOrigin: performance.timeOrigin });
  const mount = () => window.mountFplacesNavigationDiagnostics(navigationDiagnostics);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
}

/** Shares the AR recorder and full location export; does not create another buffer. */
export function install2DNavigationDebugger(readState: () => unknown, enableCompass: () => Promise<void>): void {
  if (!import.meta.env.DEV || !navigationDiagnostics) return;
  const mount = () => window.mountFplacesNavigationDiagnostics(navigationDiagnostics, document, {
    kind: '2d', readState, enableCompass,
    clearReport: () => window.FplacesLocationDiagnostics ? window.FplacesLocationDiagnostics.clearAll() : navigationDiagnostics.clear(),
    exportReport: () => window.FplacesLocationDiagnostics?.exportAll() ?? navigationDiagnostics.export('absolute'),
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
}
