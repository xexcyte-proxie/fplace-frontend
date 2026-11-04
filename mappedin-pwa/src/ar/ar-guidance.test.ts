import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../../../ar-nav/js/ar-guidance.js', import.meta.url), 'utf8');
function mount(search = '') {
  class Element {
    isConnected = true;
    focused = false;
    open = false;
    handlers: Record<string, () => void> = {};
    addEventListener(event: string, callback: () => void) { this.handlers[event] = callback; }
    focus() { this.focused = true; }
    showModal() { this.open = true; }
    close() { this.open = false; this.handlers.close?.(); }
  }
  const dialog = new Element(), info = new Element(), dismiss = new Element(), body = new Element();
  const elements: Record<string, Element> = { 'ar-guidance': dialog, 'ar-guidance-info': info, 'ar-guidance-dismiss': dismiss };
  const window = { location: { search }, FplacesArGuidance: undefined as undefined | { open(): void } };
  const document = { body, activeElement: body, getElementById: (id: string) => elements[id] };
  runInNewContext(source, { window, document, HTMLElement: Element, URLSearchParams });
  return { dialog, info, dismiss, document, window };
}
describe('AR guidance lifecycle', () => {
  it('opens on launch, dismisses and restores focus, and reopens from info', () => {
    const ui = mount();
    expect(ui.dialog.open).toBe(true);
    expect(ui.dismiss.focused).toBe(true);
    ui.dismiss.handlers.click();
    expect(ui.dialog.open).toBe(false);
    expect(ui.info.focused).toBe(true);
    ui.document.activeElement = ui.info;
    ui.info.handlers.click();
    expect(ui.dialog.open).toBe(true);
  });
  it('waits during preload and opens on every activation of a warm document', () => {
    const ui = mount('?preload=1');
    expect(ui.dialog.open).toBe(false);
    ui.window.FplacesArGuidance!.open();
    expect(ui.dialog.open).toBe(true);
    ui.dialog.close();
    ui.window.FplacesArGuidance!.open();
    expect(ui.dialog.open).toBe(true);
  });
});
