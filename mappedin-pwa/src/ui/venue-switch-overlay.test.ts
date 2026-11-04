import { afterEach, expect, it, vi } from 'vitest';
import { initialAppState } from '../types';
import { UiRoot } from './ui-root';

vi.mock('./location-dialog-focus', () => ({ captureLocationDialogFocus: vi.fn(), restoreLocationDialogFocus: vi.fn() }));

afterEach(() => vi.unstubAllGlobals());

it('preserves the rendered venue while showing one blocking loader across intermediate updates', () => {
  class Element {
    inert = false;
    className = '';
    innerHTML = '';
    message = { textContent: '' };
    querySelector() { return this.message; }
  }
  vi.stubGlobal('HTMLElement', Element);
  vi.stubGlobal('document', { createElement: () => new Element() });
  const previous = { ...initialAppState(), selectedVenueId: '1' };
  const page = new Element();
  page.innerHTML = 'Previous venue';
  let overlay: Element | null = null;
  const root = {
    children: [page],
    querySelector: () => overlay,
    append: vi.fn((element: Element) => { overlay = element; }),
  };
  const ui = Object.create(UiRoot.prototype) as any;
  Object.assign(ui, { root, lastRenderedState: previous, venueSwitchPreviousState: null });
  const state = { ...previous, venueSwitchStatus: 'loading' as const, venueSwitchMessage: 'Opening new venue…' };
  ui.render(state, {});
  expect(page.innerHTML).toBe('Previous venue');
  expect(page.inert).toBe(true);
  expect(ui.venueSwitchPreviousState).toBe(previous);
  expect(overlay!.innerHTML).toContain('screen-loading-spinner');
  ui.render({ ...state, selectedVenueId: '2', venueSwitchStatus: 'slow', venueSwitchMessage: 'Still trying…' }, {});
  expect(root.append).toHaveBeenCalledTimes(1);
  expect(page.innerHTML).toBe('Previous venue');
  expect(overlay!.message.textContent).toBe('Still trying…');
  expect(ui.lastRenderedState.selectedVenueId).toBe('1');
});
