import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
function fixture() {
  class Element {
    classes = new Set<string>(); attrs = new Map<string, string>(); dataset: Record<string, string> = {};
    writes = 0; innerHTML = ''; text = ''; hidden = false;
    focus = vi.fn(); events = new Map<string, () => void>();
    get textContent() { return this.text; }
    set textContent(value: string) { this.text = value; this.writes++; }
    getAttribute(name: string) { return this.attrs.get(name) ?? null; }
    setAttribute(name: string, value: string) { this.attrs.set(name, value); this.writes++; }
    addEventListener(name: string, callback: () => void) { this.events.set(name, callback); }
    querySelector() { return null; }
    classList = {
      contains: (name: string) => this.classes.has(name),
      add: (...names: string[]) => names.forEach(n => this.classes.add(n)),
      remove: (...names: string[]) => names.forEach(n => this.classes.delete(n)),
      toggle: (name: string, force?: boolean) => { const on = force ?? !this.classes.has(name); on ? this.classes.add(name) : this.classes.delete(name); return on; },
    };
  }
  const ids = ['live-nav', 'trip-footer', 'status', 'offPath', 'scan-overlay', 'arrival-card', 'arrival-dest', 'arrival-ok-btn',
    'turn-text', 'distance-bar', 'turn-icon', 'fplaces-calibrate-btn', 'lv-chrome', 'lv-back-btn', 'lv-map-btn', 'lv-end-nav-btn', 'lv-sheet-toggle'];
  const elements = Object.fromEntries(ids.map(id => [id, new Element()]));
  elements['arrival-card'].classList.add('hidden'); elements['arrival-card'].setAttribute('aria-hidden', 'true');
  const body = new Element(); let message: (event: unknown) => void;
  let started = true;
  const c: any = { document: { getElementById: (id: string) => elements[id] ?? null, body },
    location: { origin: 'https://fplaces.test' }, parent: { postMessage: vi.fn() },
    FplacesCameraStart: { isStarted: () => started, isAwaiting: () => !started },
    addEventListener: (event: string, cb: any) => { if (event === 'message') message = cb; },
  };
  c.window = c; vm.createContext(c);
  for (const file of ['live-view-hud', 'lv-chrome']) vm.runInContext(readFileSync(new URL(`../../../ar-nav/js/${file}.js`, import.meta.url), 'utf8'), c);
  const nav = { route: { destinationName: 'Gate A', distanceMeters: 30 }, getLiveGuidance: () => ({}) };
  const update = (arrived: boolean, destinationName = 'Gate A') => c.FplacesLiveViewHud.update({ arrived, destinationName, distanceRemainingMeters: arrived ? 0 : 10 }, nav);
  const presentation = (mode: string) => message!({ origin: c.location.origin, data: { type: 'fplaces_presentation', mode } });
  return { c, body, elements, nav, update, presentation, camera: (value: boolean) => { started = value; } };
}
describe('confirmed arrival presentation', () => {
  it('shows a single full-screen dialog only for the confirmed arrival flag', () => {
    const h = fixture(); h.update(false); expect(h.elements['arrival-card'].getAttribute('aria-hidden')).toBe('true');
    h.update(true); expect(h.elements['arrival-card'].getAttribute('aria-hidden')).toBe('false');
    expect(h.body.classList.contains('lv-arrived')).toBe(true);
    expect(h.elements['arrival-dest'].textContent).toBe('Gate A'); expect(h.elements['arrival-ok-btn'].focus).toHaveBeenCalledOnce();
  });
  it('holds arrival across camera interruptions and ignores status chatter', () => {
    const h = fixture(); h.camera(false); h.update(true);
    h.c.FplacesLiveViewHud.setStatus('Tracking interrupted', true);
    expect(h.elements['arrival-card'].getAttribute('aria-hidden')).toBe('false');
    expect(h.elements['scan-overlay'].classList.contains('hidden')).toBe(true);
  });
  it('does not rebuild, refocus, rewrite destination or retrigger the modal on repeated completed updates', () => {
    const h = fixture(); h.update(true);
    const card = h.elements['arrival-card'], destination = h.elements['arrival-dest'];
    const writes = [card.writes, destination.writes];
    for (let i = 0; i < 100; i++) h.update(true);
    expect([card.writes, destination.writes]).toEqual(writes);
    expect(h.elements['arrival-ok-btn'].focus).toHaveBeenCalledOnce(); expect(card.innerHTML).toBe('');
  });
  it('switches modes without rendering the full-screen card inside minimized AR', () => {
    const h = fixture(); h.update(true); h.presentation('minimized');
    expect(h.body.classList.contains('lv-minimized')).toBe(true);
    expect(h.elements['arrival-card'].getAttribute('aria-hidden')).toBe('true');
    h.update(true); expect(h.elements['arrival-card'].classList.contains('hidden')).toBe(true);
    h.presentation('fullscreen'); expect(h.elements['arrival-card'].getAttribute('aria-hidden')).toBe('false');
    expect(h.elements['arrival-dest'].textContent).toBe('Gate A');
  });
  it('clears arrival on a new route/session and restores ordinary navigation', () => {
    const h = fixture(); h.update(true); h.presentation('minimized'); h.update(false, 'Gate B');
    expect(h.body.classList.contains('lv-arrived')).toBe(false);
    expect(h.elements['arrival-card'].getAttribute('aria-hidden')).toBe('true');
    expect(h.elements['live-nav'].classList.contains('hidden')).toBe(false);
    h.presentation('fullscreen'); expect(h.elements['arrival-card'].classList.contains('hidden')).toBe(true);
    h.c.FplacesLiveViewHud.update(null, null); expect(h.body.classList.contains('lv-arrived')).toBe(false);
  });
  it('keeps the existing Done navigation action and inserts destination text safely', () => {
    const h = fixture(); h.update(true, '<img src=x>');
    expect(h.elements['arrival-dest'].textContent).toBe('<img src=x>'); expect(h.elements['arrival-dest'].innerHTML).toBe('');
    h.elements['arrival-ok-btn'].events.get('click')!();
    expect(h.c.parent.postMessage).toHaveBeenCalledWith({ type: 'fplaces_ar_arrived_done' }, h.c.location.origin);
  });
});

it('requests Align route whenever the visible card is requesting alignment, and clears it afterward', () => {
  const h = fixture();
  const setFindingDirection = vi.fn();
  h.c.FplacesSpatialAlignment = { setFindingDirection };
  h.nav.getLiveGuidance = () => ({ primary: { label: 'Face the route', symbol: 'explore' } });
  h.update(false); expect(setFindingDirection).toHaveBeenLastCalledWith(true);
  h.nav.getLiveGuidance = () => ({ primary: { label: 'Head straight', symbol: 'straight' } });
  h.update(false); expect(setFindingDirection).toHaveBeenLastCalledWith(false);
  h.update(true); expect(setFindingDirection).toHaveBeenLastCalledWith(false);
  h.camera(false); h.update(false); expect(setFindingDirection).toHaveBeenLastCalledWith(false);
});

it('uses one stable red instruction card for alignment and restores its normal theme', () => {
  const h = fixture();
  const setFindingDirection = vi.fn();
  h.c.FplacesSpatialAlignment = { setFindingDirection, needsControl: true };
  h.nav.getLiveGuidance = () => ({ primary: { label: 'Head straight', symbol: 'straight' } });
  h.update(false);
  const card = h.elements['live-nav'], title = h.elements['turn-text'], detail = h.elements['distance-bar'];
  expect(title.textContent).toBe('Face the route');
  expect(card.classList.contains('lv-instruction-card--alignment')).toBe(true);
  expect(card.classList.contains('hidden')).toBe(false);
  expect(h.elements['status'].classList.contains('hidden')).toBe(true);
  const writes = [title.writes, detail.writes, h.elements['turn-icon'].innerHTML];
  setFindingDirection.mockClear();
  for (let i = 0; i < 100; i++) h.update(false);
  expect([title.writes, detail.writes, h.elements['turn-icon'].innerHTML]).toEqual(writes);
  expect(setFindingDirection.mock.calls.every(([visible]) => visible === true)).toBe(true);
  h.c.FplacesSpatialAlignment.needsControl = false;
  h.update(false);
  expect(title.textContent).toBe('Head straight');
  expect(card.classList.contains('lv-instruction-card--alignment')).toBe(false);
  expect(setFindingDirection).toHaveBeenLastCalledWith(false);
});
