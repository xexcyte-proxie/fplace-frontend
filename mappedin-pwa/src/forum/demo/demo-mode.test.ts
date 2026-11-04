import { afterEach, describe, expect, it, vi } from 'vitest';
import { socialDemoEnabled } from './demo-mode';
afterEach(() => vi.unstubAllGlobals());
describe('public social demo defaults', () => {
  it('defaults to demo and remembers an explicit choice only in this tab', () => {
    const storage = new Map<string, string>();
    const win = { location: { search: '' }, sessionStorage: { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value) } };
    vi.stubGlobal('window', win);
    expect(socialDemoEnabled()).toBe(true);
    win.location.search = '?socialDemo=1';
    expect(socialDemoEnabled()).toBe(true);
    win.location.search = '';
    expect(socialDemoEnabled()).toBe(true);
    win.location.search = '?socialDemo=0';
    expect(socialDemoEnabled()).toBe(false);
    win.location.search = '';
    expect(socialDemoEnabled()).toBe(false);
  });
  it('defaults to demo when browser storage is unavailable', () => {
    vi.stubGlobal('window', { location: { search: '' }, get sessionStorage() { throw new Error('blocked'); } });
    expect(socialDemoEnabled()).toBe(true);
  });
});
