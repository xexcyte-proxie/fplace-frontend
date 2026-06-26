/**
 * Map-anchored world route — calibrated floor ribbon (shim over pathGeometry).
 */
(function () {
  let sceneRef = null;
  let cameraRef = null;
  let rootGroup = null;
  let anchor = null;
  let pathLocal = [];
  let initialCam = null;
  let attached = false;
  let ribbonBuilt = false;

  function geoToLocal(ref, p) {
    const local = window.FplacesRouteGeometry.toLocalMeters(ref, p);
    return { x: local.x, z: -local.y };
  }

  window.FplacesWorldRoute = {
    attach({ THREE, scene, camera }) {
      if (!THREE || !scene || !camera || attached) return false;

      sceneRef = scene;
      cameraRef = camera;
      rootGroup = new THREE.Group();
      rootGroup.name = 'fplaces-world-route-root';
      scene.add(rootGroup);

      attached = true;
      ribbonBuilt = false;
      initialCam = null;
      window.FplacesPathArrows?.setWebGlActive?.(true);
      window.FplacesArDebug?.log('WorldRoute', 'Calibrated ribbon route attached');
      return true;
    },

    detach() {
      window.FplacesPathGeometry?.disposePathVisuals?.(sceneRef);
      if (rootGroup && sceneRef) sceneRef.remove(rootGroup);
      sceneRef = null;
      cameraRef = null;
      rootGroup = null;
      anchor = null;
      pathLocal = [];
      initialCam = null;
      attached = false;
      ribbonBuilt = false;
      window.FplacesPathArrows?.setWebGlActive?.(false);
    },

    isAttached() {
      return attached;
    },

    setRoute(navigator) {
      const path = navigator?.route?.pathCoordinates || [];
      if (!path.length || !attached) return;

      const snap =
        navigator.getDisplaySnap?.() ||
        navigator.snappedOnPath ||
        path[0];
      anchor = { latitude: snap.latitude, longitude: snap.longitude };
      pathLocal = path.map((p) => ({
        ...geoToLocal(anchor, p),
        floorId: p.floorId,
      }));

      if (window.FplacesAnchorEngine?.isCalibrated && sceneRef) {
        window.FplacesPathGeometry?.generateWorldMeshPath?.(
          sceneRef,
          navigator.route,
          window.FplacesAnchorEngine.instance,
        );
        ribbonBuilt = true;
      }

      initialCam = null;
      window.FplacesArDebug?.log('WorldRoute', 'Route prepared', {
        points: path.length,
        ribbonBuilt,
        anchor,
      });
    },

    update({ navigator }) {
      if (!attached || !rootGroup || !cameraRef || !navigator) return;

      const state = navigator.getState?.() || {};
      if (state.arrived) {
        rootGroup.visible = false;
        return;
      }

      const path = navigator.route?.pathCoordinates || [];
      if (!path.length || !anchor) {
        if (navigator.route) this.setRoute(navigator);
        return;
      }

      rootGroup.visible = true;

      if (window.FplacesAnchorEngine?.isCalibrated) {
        if (!ribbonBuilt && sceneRef) {
          window.FplacesPathGeometry?.generateWorldMeshPath?.(
            sceneRef,
            navigator.route,
            window.FplacesAnchorEngine.instance,
          );
          ribbonBuilt = true;
        }
        return;
      }

      const snap = navigator.getDisplaySnap?.();
      if (!snap) return;

      const user = geoToLocal(anchor, snap);

      if (!initialCam) {
        initialCam = {
          x: cameraRef.position.x,
          y: cameraRef.position.y,
          z: cameraRef.position.z,
        };
      }

      const camX = cameraRef.position.x - initialCam.x;
      const camZ = cameraRef.position.z - initialCam.z;
      rootGroup.position.set(camX - user.x, 0, camZ - user.z);
    },
  };
})();
