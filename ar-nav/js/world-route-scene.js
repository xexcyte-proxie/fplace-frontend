/**
 * Map-anchored world route — calibrated floor ribbon (shim over pathGeometry).
 * Route geometry lives in stable world space; only camera pose updates each frame.
 */
(function () {
  let sceneRef = null;
  let cameraRef = null;
  let rootGroup = null;
  let attached = false;
  let ribbonBuilt = false;
  let lastFloorId = null;

  window.FplacesWorldRoute = {
    attach({ THREE, scene, camera }) {
      if (!THREE || !scene || !camera || attached) return false;

      sceneRef = scene;
      cameraRef = camera;
      rootGroup = new THREE.Group();
      rootGroup.name = "fplaces-world-route-root";
      scene.add(rootGroup);

      attached = true;
      ribbonBuilt = false;
      lastFloorId = null;
      window.FplacesPathArrows?.setWebGlActive?.(true);
      window.FplacesOrientationCompass?.setWebGlActive?.(true);
      window.FplacesArDebug?.log(
        "WorldRoute",
        "Calibrated ribbon route attached",
      );
      return true;
    },

    detach() {
      window.FplacesPathGeometry?.disposePathVisuals?.(sceneRef);
      if (rootGroup && sceneRef) sceneRef.remove(rootGroup);
      sceneRef = null;
      cameraRef = null;
      rootGroup = null;
      attached = false;
      ribbonBuilt = false;
      lastFloorId = null;
      window.FplacesPathArrows?.setWebGlActive?.(false);
      window.FplacesOrientationCompass?.setWebGlActive?.(false);
    },

    isAttached() {
      return attached;
    },

    ensureRibbon(floorId) {
      if (!attached || !sceneRef || !window.FplacesAnchorEngine?.isCalibrated) {
        return false;
      }
      const nav = window.__fplacesNavigator;
      const route = nav?.route;
      if (!route?.pathCoordinates?.length) return false;

      const resolvedFloor =
        floorId || nav._trackedFloorId || nav.lastPosition?.floorId || null;

      window.FplacesPathGeometry?.generateWorldMeshPath?.(
        sceneRef,
        route,
        window.FplacesAnchorEngine.instance,
        { camera: cameraRef, floorId: resolvedFloor },
      );
      ribbonBuilt = true;
      lastFloorId = resolvedFloor;
      window.FplacesArDebug?.log("WorldRoute", "Floor ribbon ensured", {
        floorId: resolvedFloor,
      });
      return true;
    },

    setRoute(navigator) {
      const path = navigator?.route?.pathCoordinates || [];
      if (!path.length || !attached) return;

      const floorId =
        navigator._trackedFloorId ||
        navigator.lastPosition?.floorId ||
        path[0]?.floorId ||
        null;

      if (window.FplacesAnchorEngine?.isCalibrated && sceneRef) {
        window.FplacesPathGeometry?.generateWorldMeshPath?.(
          sceneRef,
          navigator.route,
          window.FplacesAnchorEngine.instance,
          { camera: cameraRef, floorId },
        );
        ribbonBuilt = true;
        lastFloorId = floorId;
      }

      window.FplacesArDebug?.log("WorldRoute", "Route prepared", {
        points: path.length,
        ribbonBuilt,
        floorId,
      });
    },

    update({ navigator }) {
      if (!attached || !rootGroup || !navigator) return;

      const state = navigator.getState?.() || {};
      if (state.arrived) {
        rootGroup.visible = false;
        return;
      }

      const path = navigator.route?.pathCoordinates || [];
      if (!path.length) return;

      rootGroup.visible = true;
      rootGroup.position.set(0, 0, 0);

      const floorId =
        navigator._trackedFloorId ||
        navigator.lastPosition?.floorId ||
        path[0]?.floorId ||
        null;

      if (window.FplacesAnchorEngine?.isCalibrated) {
        if (!ribbonBuilt || (floorId && floorId !== lastFloorId)) {
          this.ensureRibbon(floorId);
        }
        // Progress-driven arrow refresh (straight ahead / turn at junction).
        window.FplacesPathGeometry?.update?.(sceneRef, cameraRef, floorId);
      }
    },
  };
})();
