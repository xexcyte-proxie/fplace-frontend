import type { PositionPipelineAudit } from './position-diagnostics';
/** Text display reads snapshots; it has no navigation command or sensor access. */
export function mountPositionAuditPanel(audit: PositionPipelineAudit, parent: HTMLElement): () => void {
  const panel = document.createElement('details');
  const label = document.createElement('summary'); label.textContent = 'Position pipeline audit';
  const display = document.createElement('pre');
  display.style.cssText = 'font:11px monospace;white-space:pre-wrap;max-height:200px;overflow:auto';
  panel.append(label, display); parent.appendChild(panel);
  const refresh = () => {
    const s = audit.snapshot();
    const points = Object.entries(s.points).filter(([, p]) => p).map(([role, p]) =>
      `${role}: ${p!.latitude.toFixed(7)}, ${p!.longitude.toFixed(7)} (${p!.floorId ?? '?'})`).join('\n');
    display.textContent = `Session ${s.sessionId}\n${s.state} · ${s.decision ?? 'waiting'}\nAccuracy ${s.accuracy ?? '?'}m · latest attempted fix age ${s.fixAgeMs ?? '?'}ms\nTrusted observation age ${s.observationAgeMs ?? '?'}ms · accepted age ${s.acceptedAgeMs ?? '?'}ms\nGPS gap ${s.gpsDeliveryGapMs ?? '?'}ms · acceptance gap ${s.acceptedDeliveryGapMs ?? '?'}ms\nAnimation ${s.durationMs ?? '?'}ms · frame gap ${s.frameGapMs ?? '?'}ms · heading age ${s.headingAgeMs ?? '?'}ms\n${points}\nAccepted↔SDK ${s.acceptedToSdkM?.toFixed(2) ?? '?'}m · interpolated↔SDK ${s.interpolatedToSdkM?.toFixed(2) ?? '?'}m\nSDK logical/model state are not proof of rendered pixels.\nOverlay: amber=raw, red=accepted, cyan=interpolated request, magenta=projection, black=SDK logical.`;
  };
  refresh(); const timer = setInterval(refresh, 500);
  return () => { clearInterval(timer); panel.remove(); };
}
