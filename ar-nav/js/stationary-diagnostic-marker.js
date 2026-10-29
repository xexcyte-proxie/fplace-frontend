/** Scene-root diagnostic marker. No navigation or anchor transform is ever applied to it. */
(function () {
  let scene = null, camera = null, marker = null, lastAt = -Infinity;
  function dispose() {
    if (!marker) return;
    scene?.remove(marker); marker.geometry.dispose(); marker.material.dispose(); marker = null;
  }
  window.FplacesStationaryMarker = {
    attach(s, c) { if (scene !== s) dispose(); scene = s; camera = c; },
    detach() { dispose(); scene = null; camera = null; },
    update() {
      const d = window.FplacesNavigationDiagnostics;
      if (!d?.markerEnabled || !scene || !camera) { dispose(); return; }
      const T = window.THREE;
      if (!marker) {
        marker = new T.Mesh(new T.SphereGeometry(0.12, 12, 8), new T.MeshBasicMaterial({ color: 0xff00ff }));
        camera.updateMatrixWorld();
        const fixed = camera.localToWorld(new T.Vector3(0, -0.3, -3));
        marker.position.copy(fixed); marker.name = 'fplaces-stationary-diagnostic-marker'; scene.add(marker);
        d.record('marker', 'StationaryMarker.create', { world: { ...fixed }, anchorRevision: window.FplacesAnchorEngine?.instance?.revision ?? null });
      }
      const now = performance.now(); if (now-lastAt < 200) return; lastAt = now;
      const relative = camera.worldToLocal(marker.position.clone());
      d.update('marker', 'StationaryMarker.sample', { world: { x: marker.position.x, y: marker.position.y, z: marker.position.z },
        cameraRelative: { x: relative.x, y: relative.y, z: relative.z }, rotation: { x: 0, y: 0, z: 0 },
        anchorRevision: window.FplacesAnchorEngine?.instance?.revision ?? null });
    },
  };
})();
