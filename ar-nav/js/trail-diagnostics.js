/** Explicit opt-in development capture. No console/network output; bounded memory. */
(function () {
  let enabled = new URLSearchParams(window.location?.search || '').get('arTrailDebug') === '1';
  const records = [];
  const capacity = 512;
  let lastSample = -Infinity;
  let progress = null;
  let frustum, matrix, position, rotation, quaternion;
  const visibility = new Map();
  const depthVisibility = new Map();
  function record(type, data) {
    if (!enabled) return;
    if (records.length === capacity) records.shift();
    records.push({ timeMs: performance.now(), type, ...data });
  }
  function sample(camera, group, now) {
    if (!enabled || now - lastSample < 200) return;
    lastSample = now;
    const T = window.THREE;
    if (!frustum && T?.Frustum) {
      frustum = new T.Frustum(); matrix = new T.Matrix4(); position = new T.Vector3();
      rotation = new T.Euler(0, 0, 0, 'YXZ'); quaternion = new T.Quaternion();
    }
    const canProject = !!(frustum && camera?.projectionMatrix && camera?.matrixWorldInverse);
    if (canProject) {
      camera.updateMatrixWorld();
      frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      camera.getWorldPosition(position); camera.getWorldQuaternion(quaternion);
      rotation.setFromQuaternion(quaternion, 'YXZ');
    }
    const arrows = (group?.children || []).map(child => {
      let insideFrustum = null;
      if (canProject) {
        child.updateWorldMatrix(true, true);
        insideFrustum = false;
        child.traverse(obj => { if (obj.isMesh && frustum.intersectsObject(obj)) insideFrustum = true; });
      }
      const id = child.userData.trailInstanceId;
      const state = `${child.visible}:${insideFrustum}`;
      const previous = visibility.get(id);
      if (!previous || state !== previous.state) {
        record('visibility', { id, visible: child.visible, insideFrustum,
          reason: !child.visible ? 'camera-depth-fade' : insideFrustum === false ? 'outside-frustum' : 'in-view',
          intervalMs: previous ? now - previous.at : null });
        visibility.set(id, { state, at: now });
      }
      return { id, slot: child.userData.segmentKey, alongM: child.userData.alongM,
        position: { x: child.position.x, y: child.position.y, z: child.position.z },
        visible: child.visible, insideFrustum, opacity: child.children[0]?.material?.opacity ?? null };
    });
    const nav = window.__fplacesNavigator;
    record('sample', {
      camera: camera ? { position: canProject ? { x: position.x, y: position.y, z: position.z } : { ...camera.position },
        yaw: canProject ? rotation.y : null, pitch: canProject ? rotation.x : null, roll: canProject ? rotation.z : null } : null,
      progress, parentAlongM: nav?._authoritativeAlongPathM ?? window.__fplacesNavigationProgress?.alongPathMeters ?? null,
      displayAlongM: nav?._displayAlongPathM ?? null,
      fusedAlongM: window.FplacesSlamPose?.getDiagnosticAlongPathMeters?.() ?? null,
      route: window.FplacesWorldRoute?.getDiagnosticIdentity?.() ?? null,
      calibration: { valid: !!window.FplacesAnchorEngine?.isCalibrated, revision: window.FplacesAnchorEngine?.instance?.revision ?? null },
      trackingStatus: window.FplacesSpatialAlignment?.status ?? 'UNKNOWN', arrows,
    });
  }
  window.FplacesTrailDiagnostics = {
    get enabled() { return enabled; },
    setEnabled(value) { enabled = value === true; records.length = 0; visibility.clear(); depthVisibility.clear(); lastSample = -Infinity; progress = null; },
    record, sample,
    depthChanged(child, now) {
      if (!enabled) return;
      const id = child.userData.trailInstanceId;
      const previous = depthVisibility.get(id);
      if (!previous || previous.visible !== child.visible) {
        record('depth-visibility', { id, visible: child.visible, reason: 'camera-depth-fade',
          intervalMs: previous ? now - previous.at : null });
        depthVisibility.set(id, { visible: child.visible, at: now });
      }
    },
    progress(value) { if (enabled) progress = { ...progress, ...value }; },
    removed(child, reason) {
      if (!enabled) return;
      record('remove', { id: child.userData.trailInstanceId, slot: child.userData.segmentKey, alongM: child.userData.alongM, reason });
      visibility.delete(child.userData.trailInstanceId);
      depthVisibility.delete(child.userData.trailInstanceId);
    },
    export() { return JSON.stringify({ schemaVersion: 1, angleUnit: 'radians', records }, null, 2); },
  };
})();
