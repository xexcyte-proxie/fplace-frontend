/** Shared development UI; only mounted with a recorder supplied by a dev PWA. */
(function (root) {
  root.mountFplacesNavigationDiagnostics = function (recorder, doc = document, options = {}) {
    if (options.kind === '2d') return mount2D(recorder, doc, options);
    if (!recorder?.development || doc.getElementById('navigation-debug-open')) return;
    const button = doc.createElement('button'); button.id = 'navigation-debug-open'; button.textContent = 'AR Debug';
    button.style.cssText = 'position:fixed;right:10px;top:calc(env(safe-area-inset-top,0px) + 56px);z-index:2147483000;padding:7px;border-radius:8px;font:12px system-ui;background:#182530;color:white;border:1px solid #91b2cb';
    const panel = doc.createElement('dialog'); panel.setAttribute('aria-label', 'Development navigation diagnostics');
    panel.style.cssText = 'max-width:480px;width:85vw;max-height:75vh;overflow:auto;border-radius:12px;padding:16px;font:14px system-ui';
    panel.innerHTML = '<h2>AR Debug · development</h2><p>Local recording only. Start before opening a venue. Freeze holds accepted navigation coordinates; camera and raw GPS continue.</p><p role="status"></p><div></div><p><label>Coordinates <select><option value="redact">Redact (default)</option><option value="offset">Local offsets in metres</option><option value="absolute">Include absolute GPS</option></select></label></p><textarea aria-label="Diagnostic report" readonly style="width:100%;height:180px;font:11px monospace" spellcheck="false"></textarea>';
    const status = panel.querySelector('[role=status]'), actions = panel.querySelector('div'), text = panel.querySelector('textarea'), privacy = panel.querySelector('select');
    const refresh = () => { button.textContent = recorder.frozen ? 'AR Debug · FROZEN' : 'AR Debug'; text.value = recorder.export(privacy.value); status.textContent = `${recorder.recording ? 'Recording' : 'Stopped'} · Freeze ${recorder.frozen ? 'ON' : 'off'} · Marker ${recorder.markerEnabled ? 'ON' : 'off'}`; };
    function action(label, callback) { const b = doc.createElement('button'); b.type='button'; b.textContent=label; b.style.margin='4px'; b.onclick=callback; actions.appendChild(b); }
    action('Start', () => { recorder.start(); refresh(); }); action('Stop', () => { recorder.stop(); refresh(); });
    action('Clear', () => { recorder.clear(); refresh(); }); action('Snapshot', () => { recorder.capture(); refresh(); });
    action('Freeze accepted position', () => { recorder.setFrozen(!recorder.frozen); refresh(); });
    action('Fixed world marker', () => { recorder.setMarker(!recorder.markerEnabled); refresh(); });
    action('Copy report', async () => {
      refresh(); text.focus(); text.select(); text.setSelectionRange(0,text.value.length);
      try { await navigator.clipboard.writeText(text.value); status.textContent='Copied.'; }
      catch (_) { let ok=false; try { ok=doc.execCommand('copy'); } catch (_) {} status.textContent=ok?'Copied.':'Touch and hold the selected report, then choose Copy.'; }
    });
    action('Download JSON', () => {
      refresh(); const url=URL.createObjectURL(new Blob([text.value],{type:'application/json'}));
      const a=doc.createElement('a'); a.href=url; a.download='fplaces-navigation-diagnostics.json'; doc.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
    action('Close',()=>panel.close()); privacy.onchange=refresh;
    button.onclick=()=>{ refresh(); panel.showModal(); }; doc.body.append(button,panel);
  };

  function mount2D(recorder, doc, options) {
    if (!recorder?.development || doc.getElementById('navigation-2d-debug-open')) return;
    const button = doc.createElement('button'); button.id = 'navigation-2d-debug-open'; button.type = 'button';
    button.textContent = '2D Debug';
    button.style.cssText = 'position:fixed;right:10px;top:calc(env(safe-area-inset-top,0px) + 100px);z-index:2147483000;padding:9px;border-radius:8px;font:13px system-ui;background:#182530;color:white;border:1px solid #91b2cb';
    const panel = doc.createElement('dialog'); panel.setAttribute('aria-label', '2D Navigation Debug');
    panel.style.cssText = 'box-sizing:border-box;width:calc(100vw - 24px);max-width:520px;max-height:82vh;inset:0;margin:auto;overflow:auto;border-radius:12px;padding:14px;font:13px system-ui;background:#fff;color:#17212b';
    panel.innerHTML = '<h2 style="margin:0 0 8px">2D Navigation Debug</h2><p>Development · shared AR/2D recorder · local memory. Full reports include precise locations. Closing this panel keeps recording.</p><p role="status" aria-live="polite"></p><div data-actions style="display:flex;flex-wrap:wrap;gap:6px"></div><h3>Live Status</h3><pre data-live style="white-space:pre-wrap;overflow-wrap:anywhere"></pre><div data-sections></div><details><summary>Event Timeline</summary><div data-timeline></div></details><details><summary>Error and Warning History</summary><pre data-errors style="white-space:pre-wrap;overflow-wrap:anywhere"></pre></details><details><summary>Copyable Full Report</summary><textarea aria-label="2D full diagnostic report" readonly spellcheck="false" style="box-sizing:border-box;width:100%;height:180px;font:11px monospace"></textarea></details>';
    const status = panel.querySelector('[role=status]'), actions = panel.querySelector('[data-actions]'), text = panel.querySelector('textarea');
    const sections = new Map();
    for (const name of ['GPS Diagnostics','Blue-Dot Diagnostics','Compass Diagnostics','Simulation Diagnostics','Navigation Diagnostics']) {
      const details = doc.createElement('details'), summary = doc.createElement('summary'), pre = doc.createElement('pre');
      summary.textContent = name; pre.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;font:11px monospace';
      details.append(summary, pre); panel.querySelector('[data-sections]').append(details); sections.set(name, pre);
    }
    const json = value => JSON.stringify(value ?? null, null, 2);
    const read = () => { try { return options.readState?.() ?? {}; } catch (error) { return { diagnosticReadError: String(error) }; } };
    let timelineSequence = -1;
    function refresh() {
      const current = read(), stats = recorder.statistics(), evidence = recorder.snapshot();
      // Available before venue entry so initialization can be recorded too.
      button.textContent = '2D Debug' + (stats.recording ? ' · REC' : '');
      if (!panel.open) return;
      status.textContent = `${stats.recording ? 'Recording' : 'Stopped'} · ${(stats.durationMs/1000).toFixed(1)}s · ${stats.retained}/${stats.capacity} events · ${stats.dropped} older events dropped`;
      const compass = current.blueDot?.compass, gps = evidence['gps-fix-quality'], movement = evidence['provider-filter'] ?? evidence['mappedin-filter'];
      const events = recorder.timeline(300), errors = events.filter(event => ['error','warning'].includes(event.severity));
      panel.querySelector('[data-live]').textContent = json({ GPS: gps?.displayEligible ? 'display eligible' : current.provider?.signalStatus ?? 'waiting',
        accuracyM: gps?.accuracy ?? current.blueDot?.reportedAccuracyMeters ?? null,
        fixAgeMs: current.blueDot?.lastPositionFixAgeMs ?? null, positioning: current.positioningStatus,
        movement: movement?.classification ?? 'uncertain', movementReason: movement?.reason ?? 'no movement evidence yet',
        rawToRenderedM: evidence['renderer-submission']?.rawToRenderedM ?? evidence['blue-dot-submission']?.renderer?.differenceFromExpectedMeters ?? null,
        simulation: current.simulation?.active, blueDot: current.blueDot?.positionAvailability ?? 'unavailable',
        markerFloor: current.blueDot?.markerFloorId, viewedFloor: current.blueDot?.currentFloorId,
        compassPermission: evidence['compass-permission']?.permission ?? compass?.permission ?? 'unknown',
        compassSensor: compass?.enabled ? 'enabled' : compass?.startupError ?? 'waiting',
        deviceHeading: compass?.deviceHeading, displayedHeading: compass?.displayedHeading,
        cameraBearing: current.camera?.bearing ?? null, navigation: current.navigation?.arrived ? 'arrived' : current.navigation?.active ? `active: ${current.navigation.traveledM}m traveled, ${current.navigation.remainingM}m remaining` : current.navigation?.routePresent ? 'route planned' : 'no route',
        latestError: errors.at(-1)?.reason ?? errors.at(-1)?.data?.error ?? null });
      sections.get('GPS Diagnostics').textContent = json({ environment: evidence['gps-environment'], permission: current.permission, provider: current.provider,
        fix: gps, raw: evidence['raw-gps'], lastAccepted: evidence['display-position'], lastNavigationQuality: evidence['navigation-quality-position'], retention: current.blueDot?.positionAvailability });
      sections.get('Blue-Dot Diagnostics').textContent = json({ ...current.blueDot, camera: current.camera, submission: evidence['renderer-submission'], callback: evidence['renderer-callback'] });
      sections.get('Compass Diagnostics').textContent = json({ ...compass, raw: evidence['compass-raw'], filtered: evidence['compass-filter'], published: evidence['compass-publish'], listener: evidence['compass-listener'], permission: evidence['compass-permission'] });
      sections.get('Simulation Diagnostics').textContent = json({ selectedVenue: current.selectedVenue, ...current.simulation, transformation: evidence['simulation-transform'] });
      sections.get('Navigation Diagnostics').textContent = json({ ...current.navigation, projection: evidence['route-snap'], progress: evidence.progress, arrival: evidence.arrival });
      panel.querySelector('[data-errors]').textContent = json(errors.slice(-30));
      const lastSequence = events.at(-1)?.sequence ?? 0;
      if (lastSequence !== timelineSequence) {
        timelineSequence = lastSequence;
        const target = panel.querySelector('[data-timeline]');
        const expanded = new Set([...target.querySelectorAll('details[open]')].map(item => item.dataset.sequence));
        target.replaceChildren();
        for (const event of events.slice(-80)) {
          const item = doc.createElement('details'), title = doc.createElement('summary'), pre = doc.createElement('pre');
          item.dataset.sequence = String(event.sequence); item.open = expanded.has(item.dataset.sequence);
          title.textContent = `#${event.sequence} +${Math.round(event.elapsedMs)}ms ${event.severity} · ${event.source} · ${event.name}`;
          pre.textContent = json(event); pre.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;font:11px monospace';
          item.append(title, pre); target.append(item);
        }
      }
    }
    function action(label, callback) { const b = doc.createElement('button'); b.type = 'button'; b.textContent = label; b.style.cssText = 'min-height:38px;padding:6px 9px'; b.onclick = callback; actions.append(b); }
    action('Start Recording', () => { recorder.start(); recorder.capture(); refresh(); });
    action('Stop Recording', () => { recorder.stop(); refresh(); });
    action('Clear Recording', () => { if (options.clearReport) options.clearReport(); else recorder.clear(); timelineSequence = -1; text.value = ''; refresh(); });
    // Called directly in the click stack, before any await: iOS transient activation.
    action('Enable Compass', () => { const pending = options.enableCompass?.(); Promise.resolve(pending).then(refresh, error => { status.textContent = String(error); }); });
    const report = () => { text.value = options.exportReport(); return text.value; };
    action('Copy Full Report', async () => {
      report(); text.closest('details').open = true; text.focus(); text.select(); text.setSelectionRange(0, text.value.length);
      try { await navigator.clipboard.writeText(text.value); status.textContent = 'Full report copied.'; }
      catch (_) { let copied = false; try { copied = doc.execCommand('copy'); } catch (_) {} status.textContent = copied ? 'Full report copied.' : 'Touch and hold the selected report, then choose Copy.'; }
    });
    action('Download JSON Report', () => {
      const url = URL.createObjectURL(new Blob([report()], { type: 'application/json' }));
      const a = doc.createElement('a'); a.href = url; a.download = 'fplaces-2d-navigation-diagnostics.json'; doc.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    action('Close', () => panel.close());
    button.onclick = () => { panel.showModal(); refresh(); };
    doc.body.append(button, panel);
    // UI reads only. Recording/sensors are owned by the existing recorder/app.
    setInterval(refresh, 1000); refresh();
  }
})(typeof window !== 'undefined' ? window : globalThis);
