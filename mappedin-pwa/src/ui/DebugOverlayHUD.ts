import { positionTelemetry, type TelemetrySnapshot } from '../position/debug/telemetryLogger';

const COLLAPSED_KEY = 'fplaces-debug-hud-collapsed';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function formatCoord(value: number | undefined, digits = 5): string {
  if (value == null || Number.isNaN(value)) return '-';
  return value.toFixed(digits);
}

export class DebugOverlayHUD {
  private root: HTMLElement | null = null;
  private bodyEl: HTMLElement | null = null;
  private rafId: number | null = null;
  private unsubscribe: (() => void) | null = null;
  private collapsed = sessionStorage.getItem(COLLAPSED_KEY) === '1';
  private lastSnapshot: TelemetrySnapshot | null = null;

  start(): void {
    if (this.root) return;

    this.root = document.createElement('div');
    this.root.id = 'fplaces-debug-hud';
    this.root.className = `debug-hud${this.collapsed ? ' debug-hud--collapsed' : ''}`;
    this.root.innerHTML = `
      <button type="button" class="debug-hud-toggle" aria-expanded="${!this.collapsed}">
        <span class="debug-hud-title">Position Debug</span>
        <span class="debug-hud-chevron" aria-hidden="true">${this.collapsed ? '◀' : '▼'}</span>
      </button>
      <div class="debug-hud-body"></div>
    `;

    document.body.appendChild(this.root);
    this.bodyEl = this.root.querySelector('.debug-hud-body');

    this.root.querySelector('.debug-hud-toggle')?.addEventListener('click', () => {
      this.collapsed = !this.collapsed;
      sessionStorage.setItem(COLLAPSED_KEY, this.collapsed ? '1' : '0');
      this.root?.classList.toggle('debug-hud--collapsed', this.collapsed);
      const toggle = this.root?.querySelector('.debug-hud-toggle');
      toggle?.setAttribute('aria-expanded', String(!this.collapsed));
      const chevron = this.root?.querySelector('.debug-hud-chevron');
      if (chevron) chevron.textContent = this.collapsed ? '◀' : '▼';
    });

    this.unsubscribe = positionTelemetry.subscribe((snapshot) => {
      this.lastSnapshot = snapshot;
    });

    const tick = () => {
      if (this.lastSnapshot) this.render(this.lastSnapshot);
      this.rafId = window.requestAnimationFrame(tick);
    };
    this.rafId = window.requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.rafId != null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.root?.remove();
    this.root = null;
    this.bodyEl = null;
  }

  private render(snapshot: TelemetrySnapshot): void {
    if (!this.bodyEl) return;

    const last = snapshot.lastFrame?.frame;
    const hzRows = Object.entries(snapshot.streamHzBySource)
      .map(
        ([source, hz]) =>
          `<tr><td class="debug-hud-metric">Hz · ${escapeHtml(source)}</td><td>${hz.toFixed(1)}</td></tr>`,
      )
      .join('');

    const bleRows = snapshot.bleHierarchy
      .slice(0, 3)
      .map(
        (entry, index) =>
          `<tr><td class="debug-hud-metric">BLE #${index + 1}</td><td>${escapeHtml(entry.uuid.slice(0, 8))}… m${entry.major ?? '*'} n${entry.minor ?? '*'} · ${entry.rssi} dBm</td></tr>`,
      )
      .join('');

    const floorFilter = snapshot.floorFilter;
    const floorFilterLabel = floorFilter
      ? floorFilter.accepted
        ? `accepted → ${floorFilter.mappedinFloorId ?? '-'}`
        : `rejected (${floorFilter.reason ?? 'unknown'})`
      : '-';

    const orch = snapshot.orchestrator;
    const orchBar = orch
      ? `<div class="hysteresis-bar"><div class="hysteresis-bar-fill" style="width:${orch.progressPct}%"></div></div>
         <div class="debug-hud-sub">${escapeHtml(orch.candidateFloorId ?? '-')} → ${escapeHtml(orch.committedFloorId ?? '-')} · ${orch.framesHeld}/${orch.framesRequired}</div>`
      : '<div class="debug-hud-sub">-</div>';

    this.bodyEl.innerHTML = `
      <table class="debug-hud-table">
        <tbody>
          <tr><td class="debug-hud-metric">Source</td><td>${escapeHtml(snapshot.activeSource)}</td></tr>
          ${hzRows || '<tr><td class="debug-hud-metric">Hz</td><td>-</td></tr>'}
          <tr><td class="debug-hud-metric">Lat / Lng</td><td>${formatCoord(last?.latitude, 6)} / ${formatCoord(last?.longitude, 6)}</td></tr>
          <tr><td class="debug-hud-metric">Heading</td><td>${last?.heading != null ? `${Math.round(last.heading)}°` : '-'}</td></tr>
          <tr><td class="debug-hud-metric">Accuracy</td><td>${last?.accuracy != null ? `±${last.accuracy.toFixed(1)} m` : '-'}</td></tr>
          <tr><td class="debug-hud-metric">Floor filter</td><td>${escapeHtml(floorFilterLabel)}</td></tr>
          <tr><td class="debug-hud-metric">Floor hysteresis</td><td>${orchBar}</td></tr>
          ${bleRows || '<tr><td class="debug-hud-metric">BLE RSSI</td><td>-</td></tr>'}
        </tbody>
      </table>
    `;
  }
}
