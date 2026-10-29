/** Development-owned recorder. The factory itself enables nothing. No network IO. */
(function (root) {
  root.createFplacesNavigationDiagnostics = function (options = {}) {
    const clock = options.clock || (() => performance.now());
    const wall = options.wall || (() => Date.now());
    const capacity = Math.max(10, Math.min(20000, options.capacity || 6000));
    const config = { stationaryM: 0.15, progressJumpM: 4, disagreementM: 3, poorAccuracyM: 15,
      rotationRad: 0.35, recreationCount: 8, ...options.thresholds };
    let events = [], sequence = 0, dropped = 0, recording = false, started = clock();
    let stoppedAt = null;
    let initial = {}, state = {}, metadata = {}, lastPosition = null, lastProgress = null, lastArrow = null;
    let freeze = false, frozen = null, accepted = null, marker = false, context = null;
    let sampled = new Map();
    let sessionId = '', counts = {}, lastWarning = new Map(), stoppedState = null, recreation = [], simulationOrigin = null;
    const copy = v => { try { return JSON.parse(JSON.stringify(v ?? null)); } catch (_) { return { unavailable: 'non-serializable diagnostic value' }; } };
    function record(type, source, data = {}, cause = context) {
      if (!recording) return null;
      if (type === 'arrow-create') {
        recreation.push(clock()); recreation = recreation.filter(t => clock()-t < 2000).slice(-100);
        if (recreation.length > config.recreationCount && state.stationaryObservation)
          warn('Repeated arrow creation while accepted position is effectively stationary', { createsInTwoSeconds: recreation.length });
      }
      const event = { sequence: ++sequence, wallTime: new Date(wall()).toISOString(),
        elapsedMs: clock() - started, type, category: /gps/.test(type) ? 'gps' : /compass/.test(type) ? 'compass' : /renderer|blue-dot|mappedin/.test(type) ? 'renderer' : /route|arrival|progress|navigation/.test(type) ? 'navigation' : type.split('-')[0], name: data.name ?? type,
        severity: data.severity ?? (type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'info'),
        source, cause, interactionId: data.interactionId ?? null, reason: data.reason ?? null,
        previousState: copy(data.previousState), newState: copy(data.newState),
        data: copy(Object.fromEntries(Object.entries(data).filter(([key]) => key !== 'previousState' && key !== 'newState'))) };
      if (events.length >= capacity) { events.shift(); dropped++; }
      events.push(event); counts[type] = (counts[type] || 0) + 1;
      if (event.severity === 'warning' || event.severity === 'error') counts.warningEvents = (counts.warningEvents || 0) + 1;
      if (type === 'arrival' && data.triggered) counts.arrivalTriggers = (counts.arrivalTriggers || 0) + 1;
      return event.sequence;
    }
    function warn(observation, data) {
      if (clock() - (lastWarning.get(observation) ?? -Infinity) < 1000) return;
      lastWarning.set(observation, clock()); record('warning', 'diagnostic-observation', { observation, ...data });
    }
    function distance(a, b) {
      if (!a || !b) return null;
      return Math.hypot((a.latitude-b.latitude)*111195,
        (a.longitude-b.longitude)*111195*Math.cos((a.latitude+b.latitude)*Math.PI/360));
    }
    function update(type, source, data) {
      const previous = state[type];
      state[type] = copy(data);
      // Keep current state fresh; unchanged snapshots do not consume timeline capacity.
      const changed = JSON.stringify(previous) !== JSON.stringify(state[type]);
      const id = changed ? record(type, source, { ...data, previousState: previous ?? null, newState: data }) : null;
      if (!recording) return id;
      if (type === 'simulation') {
        if (simulationOrigin && data.physical && distance(simulationOrigin, data.physical) > config.stationaryM)
          warn('Simulation origin changed; inspect reference reset events', { previousRaw: simulationOrigin, raw: data.physical });
        if (data.physical) simulationOrigin = copy(data.physical);
      }
      if (type === 'position' && data.accepted !== false) {
        const displacement = distance(lastPosition, data.filtered);
        if (displacement != null && displacement > config.progressJumpM && data.filtered?.accuracy > config.poorAccuracyM)
          warn('Position changed substantially with poor reported accuracy', { displacement, accuracy: data.filtered.accuracy });
        state.stationaryObservation = displacement != null && displacement < config.stationaryM;
        lastPosition = copy(data.filtered);
      }
      if (type === 'progress') {
        const delta = lastProgress == null ? null : data.alongPathMeters-lastProgress;
        if (delta != null && Math.abs(delta) > config.progressJumpM) warn('Route progress jumped', { delta });
        if (delta != null && Math.abs(delta) > config.stationaryM && (freeze || state.stationaryObservation))
          warn('Progress changed while accepted position was held or effectively stationary; physical stillness is unverified', { delta, freeze });
        lastProgress = data.alongPathMeters;
      }
      if (type === 'arrival' && data.triggered && (freeze || state.stationaryObservation || data.accuracy == null))
        warn('Arrival triggered with frozen, stationary-classified, or unavailable accuracy evidence', { source, freeze, accuracy: data.accuracy ?? null });
      if (type === 'ar-sample') {
        const visual = Number.isFinite(data.progress?.selectedAlongM) ? data.progress.selectedAlongM + (data.progress.sectionStartAlongM ?? 0) : null;
        const authority = data.parentAlongM;
        if (Number.isFinite(visual) && Number.isFinite(authority) && Math.abs(visual-authority) > config.disagreementM)
          warn('AR visual and authoritative progress disagree in route-global metres', { visual, authority });
        if (lastArrow) {
          const a = data.camera, b = lastArrow.camera;
          const shift = a?.position && b?.position ? Math.hypot(a.position.x-b.position.x,a.position.y-b.position.y,a.position.z-b.position.z) : null;
          if (shift != null && shift < config.stationaryM && Math.abs((a.yaw ?? 0)-(b.yaw ?? 0)) > config.rotationRad && Math.abs((authority ?? 0)-(lastArrow.parentAlongM ?? 0)) > config.stationaryM)
            warn('Progress and camera rotation changed with little measured camera translation', { shift, authority });
          if (data.calibration?.revision !== lastArrow.calibration?.revision) {
            if (state.calibration?.revision !== data.calibration?.revision) warn('Anchor revision changed without matching recorded calibration', { revision: data.calibration?.revision });
            record('anchor-revision', source, { previous: lastArrow.calibration, current: data.calibration, calibrationEvidence: state.calibration ?? null });
          }
        }
        if (data.trackingStatus === 'NORMAL' && data.arrows?.length && data.arrows.every(a => !a.visible) && data.arrows.some(a => a.insideFrustum && a.cameraDepth > 1.4))
          warn('All arrows hidden despite NORMAL tracking and a sampled arrow ahead inside the frustum', { arrowCount: data.arrows.length });
        lastArrow = copy(data);
      }
      return id;
    }
    function snapshot() { return { metadata: copy(metadata), ...copy(state), freeze, marker }; }
    function privacy(value, mode) {
      // Only structured, explicitly selected instrumentation enters this recorder. Never include config/URLs/auth objects.
      const origins = new Map();
      function visit(v, space = 'venue') {
        if (!v || typeof v !== 'object') return v;
        if (Array.isArray(v)) return v.map(x => visit(x, space));
        const result = {};
        const geo = Number.isFinite(v.latitude) && Number.isFinite(v.longitude);
        if (geo && mode === 'offset') {
          if (!origins.has(space)) origins.set(space, { latitude: v.latitude, longitude: v.longitude });
          const o = origins.get(space);
          result.localEastM = (v.longitude-o.longitude)*111195*Math.cos(o.latitude*Math.PI/180);
          result.localNorthM = (v.latitude-o.latitude)*111195;
          result.coordinateSpace = space;
        }
        for (const [k,x] of Object.entries(v)) {
          if (/token|secret|password|api.?key|authorization|userId|email|href|url|stack/i.test(k)) continue;
          if (/^(latitude|longitude|lat|lng|lon)$/i.test(k)) { if (mode === 'absolute') result[k] = x; else if (mode === 'redact') result[k] = null; continue; }
          result[k] = visit(x, /raw|physical|simulationOrigin/i.test(k) ? 'physical' : /translated|projected|snapped|mapAnchor|venueReference|filtered/i.test(k) ? 'venue' : space);
        }
        return result;
      }
      return visit(value);
    }
    const api = {
      development: true, config, record, update, warn, distance, snapshot,
      sample(type, source, data, intervalMs = 200) {
        const key = type + ':' + source, now = clock();
        if (now - (sampled.get(key) ?? -Infinity) < intervalMs) return null;
        sampled.set(key, now); return update(type, source, data);
      },
      timeline(limit = 80) { return copy(events.slice(-Math.max(1, Math.min(300, limit)))); },
      statistics() { return { recording, retained: events.length, dropped, capacity, durationMs: (stoppedAt ?? clock()) - started }; },
      get recording() { return recording; }, get frozen() { return freeze; }, get markerEnabled() { return marker; },
      get cause() { return context; }, set cause(value) { context = value; },
      metadata(value) { metadata = { ...metadata, ...copy(value) }; },
      start() { if (recording) return; recording = true; stoppedState = null; stoppedAt = null; if (!events.length) { initial = snapshot(); started = clock(); } record('recording', 'controls', { action: 'start' }); },
      stop() { record('recording', 'controls', { action: 'stop' }); recording = false; stoppedAt = clock(); stoppedState = snapshot(); },
      clear() {
        events = []; sampled.clear(); counts = {}; sequence = 0; dropped = 0; started = clock();
        sessionId = `nav-${wall().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
        initial = snapshot(); stoppedAt = null; stoppedState = null; recreation = []; simulationOrigin = null; context = null; lastPosition = null; lastProgress = null; lastArrow = null; lastWarning.clear();
      },
      capture() { const current = snapshot(); const wasRecording = recording; recording = true; record('snapshot', 'controls', current); recording = wasRecording; if (!wasRecording) stoppedState = current; return current; },
      setFrozen(value) { freeze = value === true; frozen = freeze ? copy(accepted) : null; record('stationary-test', 'controls', { enabled: freeze, waitingForAcceptedPosition: freeze && !frozen }); },
      accept(frame) {
        if (freeze) { frozen ??= copy(frame); return { ...frame, ...frozen, heading: frame.heading, timestamp: frame.timestamp }; }
        accepted = copy(frame); return frame;
      },
      setMarker(value) { marker = value === true; record('marker-control', 'controls', { enabled: marker }); },
      export(mode = 'redact') {
        const final = stoppedState ?? snapshot();
        const select = types => events.filter(e => types.includes(e.type));
        const report = { summary: `FPLACES NAVIGATION DIAGNOSTICS\nDuration: ${(((stoppedAt ?? clock())-started)/1000).toFixed(1)} s\nGPS samples: ${counts['raw-gps'] || 0}\nProgress updates: ${counts.progress || 0}\nArrival evaluations: ${counts.arrival || 0}\nArrival triggers: ${counts.arrivalTriggers || 0}\nAR anchor resets: ${counts['anchor-reset'] || 0}\nArrow creations: ${counts['arrow-create'] || 0}\nWarnings: ${counts.warning || 0}\nDropped events: ${dropped}`,
          schemaVersion: 2, sessionId, metadata, coordinateNotes: 'Offset mode uses independent fixed first-seen physical and venue origins; east/north are approximate local metres. Origins are never exported. Null means unavailable or redacted.', configuration: { ...config, capacity, privacy: mode, poseSamplingMs: 200 },
          initialPositioningState: initial, finalPositioningState: final, eventTimeline: events,
          positionSamples: select(['raw-gps','position','simulation','simulation-transform','route-snap','display-position','mappedin-filter','mappedin-conversion','provider-filter']), progressSamples: select(['progress','ar-sync']),
          locationButtonInteractions: select(['location-button']),
          arrivalEvaluations: select(['arrival']), arTrackingEvents: select(['tracking','pose','ar-sample','anchor-revision','anchor-reset','calibration']),
          arrowLifecycleEvents: select(['arrow-create','arrow-remove','arrow-visibility','arrow-depth-visibility','arrow-transform','marker']),
          diagnosticWarnings: events.filter(event => event.severity === 'warning' || event.severity === 'error'), summaryStatistics: { counts, retained: events.length, dropped, durationMs: (stoppedAt ?? clock())-started, recording } };
        return JSON.stringify(privacy(report, mode), null, 2);
      },
    };
    api.clear(); return api;
  };
})(typeof window !== 'undefined' ? window : globalThis);
