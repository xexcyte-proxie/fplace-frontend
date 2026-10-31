import { afterEach, describe, expect, it, vi } from 'vitest';
import { setArArrivalPresentation } from './ar-pip-shell';
import { syncNavigationToAr } from './bridge';
import { readFileSync } from 'node:fs';
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const classes = new Set(['ar-pip-shell--minimized']); let writes = 0;
  const indicator = { hidden: true }, overlay = { hidden: true };
  const frame = { src: 'https://fplaces.test/ar/', contentWindow: { postMessage: vi.fn() } };
  const shell = { hidden: false, querySelector: (selector: string) => selector === '#ar-pip-arrival' ? indicator : null,
    classList: { contains: (name: string) => classes.has(name), toggle: (name: string, on: boolean) => { writes++; on ? classes.add(name) : classes.delete(name); } },
  };
  vi.stubGlobal('document', { querySelector: (selector: string) => selector === '#ar-pip-shell' ? shell : selector === '#ar-boot-overlay' ? overlay : frame });
  vi.stubGlobal('window', { location: { origin: 'https://fplaces.test', href: 'https://fplaces.test/' } });
  return { classes, indicator, frame, writes: () => writes };
}
describe('minimized arrival surface', () => {
  it('uses the same committed completion snapshot as AR and resets when completion clears', () => {
    const h = fixture();
    const snapshot = { alongPathMeters: 10, routeTraveledMeters: 10, routeRemainingMeters: 0, routeSimulating: false, routeSimulationComplete: true, navigationAuthority: 'parent-physical-walk' as const };
    syncNavigationToAr(snapshot); expect(h.classes.has('ar-pip-shell--arrived')).toBe(true); expect(h.indicator.hidden).toBe(false);
    expect(h.frame.contentWindow.postMessage).toHaveBeenCalledWith({ type: 'fplaces_navigation_sync', progress: snapshot }, 'https://fplaces.test');
    for (let i = 0; i < 100; i++) setArArrivalPresentation(true); expect(h.writes()).toBe(1);
    syncNavigationToAr({ ...snapshot, alongPathMeters: 0, routeTraveledMeters: 0, routeRemainingMeters: 10, routeSimulationComplete: false });
    expect(h.classes.has('ar-pip-shell--arrived')).toBe(false); expect(h.indicator.hidden).toBe(true);
  });
  it('defines an uncluttered full-viewport center independently of the PiP toolbar and safe-area padding', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
    const indicator = html.match(/<div id="ar-pip-arrival"[\s\S]*?<\/div>/)![0];
    expect(indicator).toContain('role="status"'); expect(indicator.match(/<svg/g)).toHaveLength(1);
    expect(indicator).not.toMatch(/<p(?:\s|>)/); expect(indicator).not.toContain('<button');
    expect(css).toMatch(/\.ar-pip-arrival\s*\{[^}]*inset: 0[^}]*place-items: center/);
    expect(css).toMatch(/ar-pip-shell--arrived \.ar-pip-bar\s*\{\s*display: none/);
    expect(css).toContain('prefers-reduced-motion');
  });
});

it('clears the parent indicator and tells the AR child which route was explicitly reset', async () => {
  const h = fixture(); const { resetArRoutePresentation } = await import('./bridge');
  setArArrivalPresentation(true);
  resetArRoutePresentation({ routeId: 'route-1', routeVersion: 2 });
  expect(h.indicator.hidden).toBe(true);
  expect(h.frame.contentWindow.postMessage).toHaveBeenCalledWith({ type: 'fplaces_navigation_reset', routeId: 'route-1', routeVersion: 2 }, 'https://fplaces.test');
});

it('preserves keyboard expansion when arrival hides the usual PiP toolbar', async () => {
  const { installArPipShell } = await import('./ar-pip-shell');
  const listeners = new Map<string, (event: any) => void>();
  const drag = { addEventListener: (name: string, cb: any) => listeners.set(name, cb) };
  const shell = { querySelector: (selector: string) => selector === '.ar-pip-drag-layer' ? drag : null,
    classList: { contains: (name: string) => ['ar-pip-shell--minimized', 'ar-pip-shell--arrived'].includes(name) } };
  vi.stubGlobal('document', { querySelector: () => shell }); vi.stubGlobal('window', { addEventListener: vi.fn() });
  const maximizeAr = vi.fn(); installArPipShell({ maximizeAr, closeAr: vi.fn() });
  const event = { key: 'Enter', preventDefault: vi.fn() }; listeners.get('keydown')!(event);
  expect(event.preventDefault).toHaveBeenCalledOnce(); expect(maximizeAr).toHaveBeenCalledOnce();
});
