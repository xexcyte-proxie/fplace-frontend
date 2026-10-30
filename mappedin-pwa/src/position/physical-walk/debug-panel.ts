import type { PhysicalWalkRecorder } from './recorder';
/** Optional mobile harness UI; not mounted by the application in Phase 1. */
export function mountPhysicalWalkDebugPanel(recorder: PhysicalWalkRecorder, parent: HTMLElement): () => void {
  const panel = document.createElement('details');
  const summary = document.createElement('summary'); summary.textContent = 'Physical Walk Diagnostics';
  const output = document.createElement('textarea'); output.readOnly = true;
  output.setAttribute('aria-label', 'Redacted diagnostic JSON');
  output.style.cssText = 'width:100%;min-height:180px';
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  const refresh = () => { output.value = recorder.report(); };
  const buttons = ['Refresh', 'Copy JSON', 'Download JSON'].map(label => {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label; return button;
  });
  buttons[0].onclick = refresh;
  buttons[1].onclick = () => {
    refresh(); void recorder.copy().then(() => { status.textContent = 'Copied'; }).catch(() => {
      output.focus(); output.select(); status.textContent = 'Copy unavailable. Select and copy the report below.';
    });
  };
  buttons[2].onclick = () => { refresh(); recorder.download(); };
  panel.append(summary, ...buttons, status, output); parent.appendChild(panel); refresh();
  return () => panel.remove();
}
