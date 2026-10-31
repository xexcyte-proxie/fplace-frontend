import { mountPositionAuditPanel } from './position-audit-panel';
import type { PhysicalWalkNavigation } from './navigation';
import { mountPhysicalWalkDebugPanel } from './debug-panel';
export function mountPhysicalWalkControls(controller: PhysicalWalkNavigation, start: () => void, visible: () => boolean = () => true): () => void {
  // Diagnostics remain available by explicit developer opt-in, without a default floating button.
  if (import.meta.env.VITE_HIDE_PHYSICAL_WALK_CONTROLS !== '0') return () => {};
  const panel = document.createElement('section');
  panel.setAttribute('aria-label', 'Physical Walk Demo');
  panel.id = 'physical-walk-demo-controls';
  const collapsedKey = 'fplaces-physical-walk-card-collapsed';
  let collapsed = true;
  try { collapsed = sessionStorage.getItem(collapsedKey) === 'true'; } catch { /* Storage is optional. */ }
  const launcher = document.createElement('button');
  launcher.type = 'button'; launcher.textContent = 'Demo / logs';
  launcher.setAttribute('aria-label', 'Open demo controls and diagnostic log');
  launcher.setAttribute('aria-controls', panel.id);
  launcher.setAttribute('aria-expanded', 'false');
  launcher.style.cssText = 'position:fixed;bottom:80px;left:8px;z-index:1500;min-height:44px;padding:8px 12px;border:1px solid #888;border-radius:22px;background:white;color:#172033;font:13px sans-serif';
  const collapse = document.createElement('button');
  collapse.type = 'button'; collapse.textContent = '−';
  collapse.setAttribute('aria-label', 'Collapse Physical Walk Demo');
  collapse.setAttribute('aria-controls', panel.id);
  collapse.setAttribute('aria-expanded', 'true');
  collapse.style.cssText = 'min-width:44px;min-height:44px;flex-shrink:0;font-size:22px';
  const updateVisibility = () => {
    const show = visible();
    panel.hidden = !show || collapsed;
    launcher.hidden = !show || !collapsed;
  };
  const setCollapsed = (value: boolean) => {
    collapsed = value;
    try { sessionStorage.setItem(collapsedKey, String(value)); } catch { /* Storage is optional. */ }
    updateVisibility();
    (value ? launcher : collapse).focus();
  };
  collapse.onclick = () => setCollapsed(true);
  launcher.onclick = () => setCollapsed(false);
  panel.style.cssText = 'position:fixed;bottom:80px;left:8px;z-index:1500;background:white;color:#172033;padding:10px;border:1px solid #888;border-radius:8px;max-width:calc(100vw - 36px);max-height:40vh;overflow:auto;font:13px sans-serif';
  const title = document.createElement('strong'); title.textContent = 'Physical Walk Demo · 2D only';
  const begin = document.createElement('button'); begin.textContent = 'Restart Physical Walk Demo'; begin.hidden = true; begin.onclick = start;
  const end = document.createElement('button'); end.textContent = 'Cancel / End'; end.onclick = () => controller.end();
  const status = document.createElement('div'); status.setAttribute('role', 'status');
  const metrics = document.createElement('div');
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px';
  header.append(title, collapse);
  const mode = document.createElement('select');
  mode.setAttribute('aria-label', 'Physical walk demo mode');
  for (const [value, label] of [['raw', 'Raw Physical Walk Demo · unsnapped diagnostics'], ['route-guided', 'Route-Guided Physical Walk Demo · simulated route-guided walk']]) {
    const option = document.createElement('option'); option.value = value; option.textContent = label; mode.append(option);
  }
  mode.value = controller.mode;
  mode.onchange = () => { controller.end(); controller.mode = mode.value === 'route-guided' ? 'route-guided' : 'raw'; start(); };
  const copy = document.createElement('button'); copy.type = 'button'; copy.textContent = 'Copy log';
  const download = document.createElement('button'); download.type = 'button'; download.textContent = 'Download log';
  const copyStatus = document.createElement('div'); copyStatus.setAttribute('role', 'status');
  const fallback = document.createElement('textarea'); fallback.readOnly = true; fallback.hidden = true;
  fallback.setAttribute('aria-label', 'Diagnostic log to copy');
  fallback.style.cssText = 'width:100%;min-height:140px';
  copy.onclick = () => {
    void controller.recorder.copy().then(() => { fallback.hidden = true; copyStatus.textContent = 'Log copied — paste it into the chat'; }).catch(() => {
      fallback.value = controller.recorder.report(); fallback.hidden = false; fallback.focus(); fallback.select();
      copyStatus.textContent = 'Select and copy the log below, or use Download log';
    });
  };
  download.onclick = () => controller.recorder.download();
  panel.append(header, mode, begin, end, copy, download, copyStatus, fallback, status, metrics);
  const removeDebug = mountPhysicalWalkDebugPanel(controller.recorder, panel);
  const removeAudit = controller.positionAudit ? mountPositionAuditPanel(controller.positionAudit, panel) : () => {};
  updateVisibility();
  document.body.append(panel, launcher);
  const timer = setInterval(() => {
    updateVisibility();
    begin.hidden = false;
    begin.textContent = controller.status.includes('timed out') || controller.status.includes('unavailable') ? 'Retry Physical Walk Demo' : controller.running ? 'Reset Physical Walk Demo' : 'Restart Physical Walk Demo';
    end.textContent = controller.status.includes('Capturing') ? 'Cancel origin capture' : 'End demo';
    title.textContent = controller.mode === 'route-guided' ? 'Route-Guided Physical Walk Demo · simulated' : 'Raw Physical Walk Demo · unsnapped';
    status.textContent = controller.status;
    const m = controller.metrics;
    metrics.textContent = m ? `Walked ${m.physicalMeters.toFixed(1)} m · Route ${m.alongMeters.toFixed(1)} m (${m.percent.toFixed(0)}%) · Remaining ${m.remainingMeters.toFixed(1)} m · ${controller.mode === 'route-guided' ? 'ETA policy' : 'Speed'} ${controller.mode === 'route-guided' ? '1.2' : m.speedMps.toFixed(1)} m/s · Elapsed ${Math.floor(m.elapsedSeconds)} s · Walk time ${m.remainingSeconds == null ? '—' : Math.ceil(m.remainingSeconds) + ' s'} · ETA ${m.eta == null ? '—' : new Date(m.eta).toLocaleTimeString()}${m.offRouteMeters > 4 ? ' · Away from route: ' + m.offRouteMeters.toFixed(1) + ' m' : ''}` : '';
  }, 250);
  return () => { clearInterval(timer); removeDebug(); removeAudit(); panel.remove(); launcher.remove(); };
}
