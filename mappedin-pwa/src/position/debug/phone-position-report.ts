import type { FplacesPositionFrame } from '../types';

const records: object[] = [];
let lastSampleAt = -Infinity;
function point(frame: FplacesPositionFrame) {
  return { latitude: frame.latitude, longitude: frame.longitude, heading: frame.heading,
    accuracy: frame.accuracy, floorId: frame.floorId, source: frame.source,
    timestamp: frame.timestamp, alongPathMeters: frame.alongPathMeters,
    offRouteMeters: frame.offRouteMeters };
}
export function recordPhonePosition(
  raw: FplacesPositionFrame, translated: FplacesPositionFrame | null,
  projected: FplacesPositionFrame | null, status: string, simulation: boolean,
): void {
  if (!import.meta.env.DEV) return;
  const now = performance.now();
  if (now - lastSampleAt < 200) return;
  lastSampleAt = now;
  records.push({ atMs: Math.round(now), status, simulation, raw: point(raw),
    translated: translated && point(translated), projected: projected && point(projected) });
  if (records.length > 150) records.shift();
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  Object.assign(window, { FplacesPositionDiagnostics: {
    clear: () => { records.length = 0; lastSampleAt = -Infinity; },
    snapshot: () => ({ development: import.meta.env.DEV, timeOrigin: performance.timeOrigin, records: records.slice() }),
  } });
}
