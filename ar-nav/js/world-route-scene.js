/** Event-built route snapshots rendered in a stable, calibrated XR world. */
(function () {
  let sceneRef = null, cameraRef = null, routeRef = null, snapshot = null;
  let activeSection = null, builtRevision = null, lastFloorId = null;
  let visualRouteRevision = 0;
  const state = () => window.FplacesVisualRouteState;
  function invalidate(reason = "route-section-anchor-change") {
    window.FplacesPathGeometry?.disposePathVisuals?.(sceneRef, reason);
    activeSection = null;
    builtRevision = null;
  }
  function accept(nav) {
    const next = state().prepare(nav?.route);
    routeRef = nav?.route;
    if (snapshot?.signature === next.signature) return;
    snapshot = next;
    visualRouteRevision++;
    invalidate("route-replaced");
  }
  window.FplacesWorldRoute = {
    attach({ THREE, scene, camera }) {
      if (!THREE || !scene || !camera || sceneRef) return false;
      sceneRef = scene; cameraRef = camera;
      window.FplacesPathArrows?.setWebGlActive?.(true);
      window.FplacesOrientationCompass?.setWebGlActive?.(true);
      return true;
    },
    detach() {
      invalidate("detach"); sceneRef = null; cameraRef = null;
      routeRef = null; snapshot = null; lastFloorId = null;
      window.FplacesPathArrows?.setWebGlActive?.(false);
      window.FplacesOrientationCompass?.setWebGlActive?.(false);
    },
    invalidate,
    getDiagnosticIdentity() {
      return { routeId: routeRef?.routeId ?? null, routeVersion: routeRef?.routeVersion ?? routeRef?.version ?? null,
        visualRouteRevision, sectionId: activeSection?.id ?? null, anchorRevision: builtRevision };
    },
    isAttached() { return !!sceneRef; },
    // Explicit acceptance also supports a caller mutating a route object in place.
    setRoute(nav) { accept(nav); this.ensureRibbon(undefined, nav); },
    ensureRibbon(floorId, nav = window.__fplacesNavigator) {
      if (!sceneRef || !nav) return false;
      if (nav.route !== routeRef || !snapshot) accept(nav);
      const floor = floorId ?? nav._trackedFloorId ?? nav.lastPosition?.floorId ?? nav.route?.pathCoordinates?.[0]?.floorId;
      if (lastFloorId != null && floor != null && lastFloorId !== floor) {
        window.FplacesSpatialAlignment?.invalidate?.('Floor changed. Realign on this floor.');
      }
      lastFloorId = floor;
      const anchor = window.FplacesAnchorEngine?.instance;
      if (!anchor?.isCalibrated || nav.arrived) { if (activeSection) invalidate(); return false; }
      const section = state().select(snapshot, floor, state().along(nav));
      if (!section) { if (activeSection) invalidate(); return false; }
      if (activeSection === section && builtRevision === anchor.revision) return true;
      invalidate(builtRevision !== anchor.revision ? "anchor-revision" : "section-changed");
      window.FplacesPathGeometry?.generateWorldMeshPath?.(sceneRef, section, anchor, { camera: cameraRef, floorId: floor });
      activeSection = section; builtRevision = anchor.revision;
      return true;
    },
    update({ navigator }) {
      if (!sceneRef || !navigator) return;
      if (navigator.getState?.().arrived) { if (activeSection) invalidate("navigation-arrived"); return; }
      if (this.ensureRibbon(undefined, navigator)) {
        window.FplacesPathGeometry?.update?.(sceneRef, cameraRef, lastFloorId);
      }
    },
  };
})();
