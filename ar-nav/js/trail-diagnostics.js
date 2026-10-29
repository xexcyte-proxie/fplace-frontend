/** Explicit opt-in development capture. No console/network output; bounded memory. */
(function () {
  let enabled = false;
  const active = () => enabled || window.FplacesNavigationDiagnostics?.recording === true;
  const records = [];
  const capacity = 512;
  let lastSample = -Infinity;
  let progress = null;
  let frustum, matrix, position, rotation, quaternion;
  const visibility = new Map();
  const depthVisibility = new Map();
  function record(type, data) {
    if (!active()) return;
    const recorder = window.FplacesNavigationDiagnostics;
    if (type === 'sample') recorder?.update('ar-sample', 'TrailDiagnostics.sample', data);
    else recorder?.record(`arrow-${type}`, 'TrailDiagnostics', data);
    if (records.length === capacity) records.shift();
    records.push({ timeMs: performance.now(), type, ...data });
  }
  function sample(camera, group, now) {
    if (!active() || now - lastSample < 200) return;
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
      let world = null, cameraRelative = null;
      if (canProject) {
        const point = child.getWorldPosition(new T.Vector3());
        world = { x: point.x, y: point.y, z: point.z };
        camera.worldToLocal(point); cameraRelative = { x: point.x, y: point.y, z: point.z };
      }
      let effectiveVisible = child.visible; let ancestor = child.parent;
      while (ancestor) { effectiveVisible = effectiveVisible && ancestor.visible; ancestor = ancestor.parent; }
      const opacities = []; child.traverse(obj => { if (obj.isMesh) for (const material of (Array.isArray(obj.material) ? obj.material : [obj.material])) if (material) opacities.push(material.opacity); });
      return { lifecycle: 'retained', effectiveVisible, effectiveOpacity: effectiveVisible ? Math.max(0, ...opacities) : 0, world, cameraRelative, cameraDepth: cameraRelative ? -cameraRelative.z : null,
        yaw: child.rotation?.y ?? null, scale: child.scale ? { x: child.scale.x, y: child.scale.y, z: child.scale.z } : null,
        id, slot: child.userData.segmentKey, alongM: child.userData.alongM,
        position: { x: child.position.x, y: child.position.y, z: child.position.z },
        visible: child.visible, insideFrustum, opacity: child.children[0]?.material?.opacity ?? null };
    });
    const nav = window.__fplacesNavigator;
    record('sample', {
      camera: camera ? { position: canProject ? { x: position.x, y: position.y, z: position.z } : { ...camera.position },
        quaternion: canProject ? { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w } : null, yaw: canProject ? rotation.y : null, pitch: canProject ? rotation.x : null, roll: canProject ? rotation.z : null } : null,
      progress, parentAlongM: nav?._authoritativeAlongPathM ?? window.__fplacesNavigationProgress?.alongPathMeters ?? null,
      displayAlongM: nav?._displayAlongPathM ?? null,
      fusedAlongM: window.FplacesSlamPose?.getDiagnosticAlongPathMeters?.() ?? null,
      route: window.FplacesWorldRoute?.getDiagnosticIdentity?.() ?? null,
      alignment: window.FplacesSpatialAlignment?.diagnosticSnapshot?.() ?? null,
      anchor: window.FplacesAnchorEngine?.instance ? { origin: window.FplacesAnchorEngine.instance.origin, yawOffsetDeg: window.FplacesAnchorEngine.instance.yawOffsetDeg, slamOriginX: window.FplacesAnchorEngine.instance.slamOriginX, slamOriginZ: window.FplacesAnchorEngine.instance.slamOriginZ, ground: window.FplacesAnchorEngine.instance.ground } : null,
      calibration: { valid: !!window.FplacesAnchorEngine?.isCalibrated, revision: window.FplacesAnchorEngine?.instance?.revision ?? null },
      arrowCount: arrows.length, groundHeightM: window.FplacesAnchorEngine?.instance?.ground?.y ?? null,
      trackingStatus: window.FplacesSpatialAlignment?.status ?? 'UNKNOWN', arrows,
    });
  }
  window.FplacesTrailDiagnostics = {
    get enabled() { return active(); },
    setEnabled(value) { enabled = value === true; records.length = 0; visibility.clear(); depthVisibility.clear(); lastSample = -Infinity; progress = null; },
    record, sample,
    depthChanged(child, now) {
      if (!active()) return;
      const id = child.userData.trailInstanceId;
      const previous = depthVisibility.get(id);
      if (!previous || previous.visible !== child.visible) {
        record('depth-visibility', { id, visible: child.visible, reason: 'camera-depth-fade',
          intervalMs: previous ? now - previous.at : null });
        depthVisibility.set(id, { visible: child.visible, at: now });
      }
    },
    progress(value) { if (active()) progress = { ...progress, ...value }; },
    removed(child, reason) {
      if (!active()) return;
      record('remove', { id: child.userData.trailInstanceId, slot: child.userData.segmentKey, alongM: child.userData.alongM, reason });
      visibility.delete(child.userData.trailInstanceId);
      depthVisibility.delete(child.userData.trailInstanceId);
    },
    export() { return JSON.stringify({ schemaVersion: 1, angleUnit: 'radians', records }, null, 2); },
  };
})();
