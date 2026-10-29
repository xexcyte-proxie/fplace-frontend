import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
function setup(clipboardWorks = true) {
  const elements: any[] = [];
  const element = (): any => ({ children: {} as Record<string, any>, buttons: [] as any[], value: 'redact',
    setAttribute: vi.fn(), style: {}, focus: vi.fn(), select: vi.fn(), setSelectionRange: vi.fn(), showModal: vi.fn(), close: vi.fn(),
    appendChild(b: any) { this.buttons.push(b); },
    querySelector(s: string) { return this.children[s] ??= element(); },
  });
  const recorder = { development: true, recording: false, frozen: false, markerEnabled: false,
    export: vi.fn(() => '{"schemaVersion":2}'), start: vi.fn(), stop: vi.fn(), clear: vi.fn(), capture: vi.fn(), setFrozen: vi.fn(), setMarker: vi.fn() };
  const c: any = { document: { createElement: () => { const e=element(); elements.push(e); return e; }, getElementById: () => null, body: { append: vi.fn() }, execCommand: vi.fn(() => false) },
    navigator: { clipboard: { writeText: vi.fn(async () => { if (!clipboardWorks) throw Error('blocked'); }) } } };
  c.window=c; vm.createContext(c);
  vm.runInContext(readFileSync(new URL('../../../ar-nav/js/navigation-diagnostics-ui.js',import.meta.url),'utf8'),c);
  c.mountFplacesNavigationDiagnostics(recorder);
  const panel=elements[1]; const action=(label: string)=>panel.querySelector('div').buttons.find((b: any)=>b.textContent===label).onclick();
  return { c, recorder, panel, button: elements[0], action };
}
describe('development phone report controls',()=>{
  it('opens, controls recording, snapshots and copies a redacted report',async()=>{
    const { c, recorder, panel, button, action }=setup(); button.onclick(); expect(panel.showModal).toHaveBeenCalledOnce();
    action('Start'); action('Stop'); action('Clear'); action('Snapshot');
    expect(recorder.start).toHaveBeenCalledOnce(); expect(recorder.stop).toHaveBeenCalledOnce(); expect(recorder.clear).toHaveBeenCalledOnce(); expect(recorder.capture).toHaveBeenCalledOnce();
    await action('Copy report'); expect(c.navigator.clipboard.writeText).toHaveBeenCalledWith('{"schemaVersion":2}'); expect(recorder.export).toHaveBeenCalledWith('redact');
  });
  it('retains selectable text on denied clipboard access',async()=>{
    const { panel, action }=setup(false); await action('Copy report');
    expect(panel.querySelector('textarea').select).toHaveBeenCalled(); expect(panel.querySelector('[role=status]').textContent).toContain('Touch and hold');
  });
  it('does not enable AR capture for production, query flags, or inaccessible parents',()=>{
    const source=readFileSync(new URL('../../../ar-nav/js/diagnostic-report.js',import.meta.url),'utf8');
    for(const parent of [{}, Object.defineProperty({},'FplacesNavigationDiagnostics',{ get(){ throw Error('cross origin'); } })]) {
      const c: any={ parent, location:{ search:'?arDebug=1&arTrailDebug=1' } }; c.window=c; vm.createContext(c); vm.runInContext(source,c);
      expect(c.FplacesNavigationDiagnostics).toBeUndefined(); expect(c.FplacesPhoneDiagnostics).toBeUndefined();
    }
  });
});
