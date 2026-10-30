import type { MapView } from '@mappedin/mappedin-js';
import type { PositionPipelineAudit, AuditRole, AuditPoint } from './position-diagnostics';
import { positionOverlayEnabled } from './position-diagnostics';
const COLORS: Partial<Record<AuditRole, string>> = { raw: '#b45309', accepted: '#dc2626',
  interpolated: '#0891b2', projected: '#c026d3', sdk: '#111827' };
/** Debug markers only. Never changes camera, floor, routes, SDK BlueDot or navigation. */
export function mountPositionOverlay(audit: PositionPipelineAudit, mapView: MapView,
  coordinate: (point: AuditPoint) => unknown): () => void {
  if (!positionOverlayEnabled()) return () => {};
  const markers = new Map<AuditRole, ReturnType<MapView['Markers']['add']>>();
  const lastPositions = new Map<AuditRole, AuditPoint>();
  const clear = () => {
    for (const marker of markers.values()) { try { mapView.Markers.remove(marker); } catch { /* Map disposed. */ } }
    markers.clear(); lastPositions.clear();
  };
  const unsubscribe = audit.subscribe(snapshot => {
    if (snapshot.state === 'ended' || snapshot.state === 'idle') { clear(); return; }
    for (const [role, color] of Object.entries(COLORS) as Array<[AuditRole, string]>) {
      const point = snapshot.points[role]; if (!point) continue;
      const previous = lastPositions.get(role);
      if (previous && previous.latitude === point.latitude && previous.longitude === point.longitude && previous.floorId === point.floorId) continue;
      try {
        const position = coordinate(point);
        const existing = markers.get(role);
        if (existing) mapView.Markers.setPosition(existing, position as never);
        else {
          const label = role === 'interpolated' ? 'interpolated request' : role === 'sdk' ? 'SDK logical' : role;
          const index = Object.keys(COLORS).indexOf(role); const size = 28 - index * 5;
          const html = `<div style="position:relative;width:1px;height:1px;pointer-events:none;color:${color};font:10px sans-serif;white-space:nowrap"><span style="position:absolute;transform:translate(-50%,-50%);width:${size}px;height:${size}px;border:2px solid ${color};border-radius:50%;background:transparent"></span><span style="position:absolute;left:16px;top:${index * 11}px">${label}</span></div>`;
          markers.set(role, mapView.Markers.add(position as never, html, { placement: 'center', interactive: false }));
        }
        lastPositions.set(role, { ...point });
      } catch { /* Debug visualization unavailable; navigation is unaffected. */ }
    }
  });
  return () => { unsubscribe(); clear(); };
}
