/** Event-built route snapshots; progress here affects visuals only. */
(function () {
  const finite = (n) => typeof n === 'number' && Number.isFinite(n);
  function along(nav) {
    return [nav?._authoritativeAlongPathM, nav?._displayAlongPathM,
      nav?.snappedOnPath?.distanceAlongPathMeters].find(finite) ?? 0;
  }
  function prepare(route) {
    // Entire accepted payload includes version, every interior point and leg metadata.
    // Called on route acceptance, never in the rendering loop.
    const signature = JSON.stringify(route || null);
    const path = (route?.pathCoordinates || []).map(p => ({ ...p }));
    const sections = [];
    let distance = 0;
    let current = null;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      const length = window.FplacesGeoMath.segmentHorizontalMeters(a, b);
      const leg = (route?.legs || []).find(l => i >= l.startIndex && i < l.endIndex);
      const legId = leg?.legId ?? a.legId ?? null;
      if (a.floorId !== b.floorId) { current = null; distance += length; continue; }
      if (!current || current.floorId !== a.floorId || current.legId !== legId) {
        current = { id: sections.length, floorId: a.floorId, legId,
          startAlong: distance, endAlong: distance, pathCoordinates: [a], isFinalSection: false };
        sections.push(current);
      }
      current.pathCoordinates.push(b);
      distance += length;
      current.endAlong = distance;
      current.isFinalSection = i === path.length - 2;
    }
    return { signature, sections };
  }
  function select(snapshot, floorId, progress) {
    const candidates = snapshot.sections.filter(s => !floorId || s.floorId === floorId);
    const gap = s => Math.max(s.startAlong - progress, progress - s.endAlong, 0);
    return candidates.reduce((best, s) => !best || gap(s) < gap(best) ||
      (gap(s) === gap(best) && s.startAlong <= progress && s.startAlong > best.startAlong) ? s : best, null);
  }
  function reconcile(previous, navigation, camera) {
    const next = finite(navigation) ? navigation : finite(camera) ? camera : 0;
    // Symmetric deadband: suppress jitter, but allow deliberate reverse travel.
    return finite(previous) && Math.abs(next - previous) < 0.35 ? previous : next;
  }
  window.FplacesVisualRouteState = { prepare, select, along, reconcile };
})();
