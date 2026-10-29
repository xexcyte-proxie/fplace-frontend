/**
 * Procedural floor ribbon path for calibrated AR navigation.
 */
(function () {
  const RIBBON_NAME = "ar_navigation_ribbon";
  const TURN_GROUP_NAME = "ar_navigation_turn_markers";
  const FLOOR_Y = 0.04;
  const TURN_MARKER_Y = 1.2;
  const RIBBON_COLOR = 0x00ffcc;
  const TURN_BEARING_THRESHOLD_DEG = 45;
  const TEXTURE_SCROLL_SPEED = 0.01;
  let ribbonTexture = null;
  let lastTextureScrollAt = 0;
  let cachedRouteInput = null;
  let cachedAnchorEngine = null;
  let cachedFloorId = null;
  let slamPointCache = {
    key: "",
    points: null,
  };

  function normalizeRouteInput(routeInput) {
    if (Array.isArray(routeInput)) {
      return { pathCoordinates: routeInput, maneuvers: [] };
    }
    return {
      pathCoordinates: routeInput?.pathCoordinates || [],
      maneuvers: routeInput?.maneuvers || [],
    };
  }

  function disposeMaterial(material) {
    if (!material) return;
    if (Array.isArray(material)) {
      material.forEach(disposeMaterial);
      return;
    }
    if (material.map) {
      material.map.dispose();
      material.map = null;
    }
    material.dispose();
  }

  function disposeTurnMarkers(scene) {
    if (!scene) return;
    const group = scene.getObjectByName(TURN_GROUP_NAME);
    if (!group) return;

    if (group.userData.sharedGeometry) {
      group.userData.sharedGeometry.dispose();
      group.userData.sharedGeometry = null;
    }
    if (group.userData.sharedMaterial) {
      disposeMaterial(group.userData.sharedMaterial);
      group.userData.sharedMaterial = null;
    }

    scene.remove(group);
  }

  function disposePathVisuals(scene, reason = "geometry-rebuild") {
    if (!scene) return;

    const existingRibbon = scene.getObjectByName(RIBBON_NAME);
    if (existingRibbon) {
      scene.remove(existingRibbon);
      if (existingRibbon.geometry) {
        existingRibbon.geometry.dispose();
        existingRibbon.geometry = null;
      }
      disposeMaterial(existingRibbon.material);
      existingRibbon.material = null;
    }

    ribbonTexture = null;
    visualAlong = null;
    cachedRouteInput = null;
    cachedAnchorEngine = null;
    cachedFloorId = null;
    slamPointCache = { key: "", points: null };
    lastArrowRefreshAlongM = -1;
    lastArrowRefreshAt = 0;
    lastArrowEmphasisTier = -1;
    lastLeadingUpdateAt = 0;

    window.FplacesFloorArrows?.disposeFloorArrows?.(scene);
    window.FplacesIncrementalPath?.dispose?.(scene, reason);

    disposeTurnMarkers(scene);
  }

  /** @deprecated Use disposePathVisuals */
  function disposeRibbon(scene) {
    disposePathVisuals(scene);
  }

  function createChevronFlowTexture(THREE) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 32;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const chevronCount = 4;
    const slotW = canvas.width / chevronCount;
    for (let i = 0; i < chevronCount; i++) {
      const cx = slotW * i + slotW * 0.5;
      const cy = canvas.height * 0.5;
      const w = slotW * 0.42;
      const h = canvas.height * 0.55;

      ctx.fillStyle = "rgba(0, 255, 204, 0.95)";
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.45, cy + h * 0.35);
      ctx.lineTo(cx, cy - h * 0.45);
      ctx.lineTo(cx + w * 0.45, cy + h * 0.35);
      ctx.lineTo(cx + w * 0.15, cy + h * 0.35);
      ctx.lineTo(cx, cy - h * 0.05);
      ctx.lineTo(cx - w * 0.15, cy + h * 0.35);
      ctx.closePath();
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(8, 1);
    texture.needsUpdate = true;
    return texture;
  }

  function bearingRadXZ(from, to) {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    if (window.FplacesQuaternionAlignment?.pathHeadingYawRad) {
      return window.FplacesQuaternionAlignment.pathHeadingYawRad(dx, dz);
    }
    return Math.atan2(dx, dz) + Math.PI;
  }

  function bearingDeltaDegrees(aRad, bRad) {
    let delta = ((bRad - aRad) * 180) / Math.PI;
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;
    return Math.abs(delta);
  }

  function detectTurnIndices(points) {
    const turns = [];
    if (points.length < 3) return turns;

    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const next = points[i + 1];

      const bearingIn = bearingRadXZ(prev, curr);
      const bearingOut = bearingRadXZ(curr, next);
      const delta = bearingDeltaDegrees(bearingIn, bearingOut);

      if (delta >= TURN_BEARING_THRESHOLD_DEG) {
        turns.push({ index: i, rotationY: bearingOut });
      }
    }

    return turns;
  }

  function buildTurnMarkers(THREE, scene, points, turnIndices) {
    disposeTurnMarkers(scene);

    if (!turnIndices.length) return null;

    const group = new THREE.Group();
    group.name = TURN_GROUP_NAME;

    const coneGeom = new THREE.ConeGeometry(0.14, 0.42, 8);
    coneGeom.rotateX(Math.PI / 2);

    const coneMat = new THREE.MeshBasicMaterial({
      color: RIBBON_COLOR,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    group.userData.sharedGeometry = coneGeom;
    group.userData.sharedMaterial = coneMat;

    for (const turn of turnIndices) {
      const pt = points[turn.index];
      const mesh = new THREE.Mesh(coneGeom, coneMat);
      mesh.position.set(pt.x, TURN_MARKER_Y, pt.z);
      mesh.rotation.y = turn.rotationY;
      mesh.renderOrder = 540;
      group.add(mesh);
    }

    scene.add(group);
    return group;
  }

  function groundY(engine = cachedAnchorEngine) {
    return engine?.getGroundY?.() ?? FLOOR_Y;
  }

  function toVector3List(coordinatesList, anchorEngine) {
    const engine = anchorEngine || window.FplacesAnchorEngine?.instance;
    if (!engine?.isCalibrated) return [];

    const key = coordinatesList;
    if (slamPointCache.key === key && slamPointCache.engine === engine && slamPointCache.revision === engine.revision && slamPointCache.points) {
      return slamPointCache.points;
    }

    const points = coordinatesList
      .map((coord) => {
        const lat = coord.latitude ?? coord.lat;
        const lng = coord.longitude ?? coord.lng;
        if (lat == null || lng == null) return null;
        const local = engine.convertToSLAMSpace({
          latitude: lat,
          longitude: lng,
        });
        return new window.THREE.Vector3(local.x, groundY(engine), local.z);
      })
      .filter(Boolean);
    slamPointCache = { key, points, engine, revision: engine.revision };
    return points;
  }

  function resolveFloorPath(routeInput, floorId) {
    if (routeInput?.startAlong != null) return routeInput.pathCoordinates;
    const route = normalizeRouteInput(routeInput);
    const path = route.pathCoordinates;
    if (!floorId || !window.FplacesFloorTransitions) return path;
    return window.FplacesFloorTransitions.filterPathForFloor(path, floorId);
  }

  let lastArrowRefreshAlongM = -1;
  let lastArrowRefreshAt = 0;
  let lastArrowEmphasisTier = -1;
  let lastLeadingUpdateAt = 0;

  function turnEmphasisTier(distAheadM) {
    if (distAheadM == null || !Number.isFinite(distAheadM)) return 0;
    if (distAheadM <= 2) return 2;
    if (distAheadM <= 5) return 1;
    return 0;
  }

  function finiteAlong(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  function resolveNavigatorAlongM(points) {
    const nav = window.__fplacesNavigator;
    let along =
      finiteAlong(nav?._authoritativeAlongPathM) ??
      finiteAlong(nav?._displayAlongPathM) ??
      finiteAlong(nav?.snappedOnPath?.distanceAlongPathMeters);

    if (along == null) return null;
    along -= cachedRouteInput?.startAlong ?? 0;

    const geoPath = cachedRouteInput
      ? resolveFloorPath(cachedRouteInput, cachedFloorId)
      : null;
    if (geoPath?.length >= 2 && window.FplacesRouteGeometry) {
      const geoTotal =
        window.FplacesRouteGeometry.totalPathLengthMeters(geoPath) || 1;
      let localTotal = 0;
      for (let i = 0; i < points.length - 1; i++) {
        localTotal += Math.hypot(
          points[i + 1].x - points[i].x,
          points[i + 1].z - points[i].z,
        );
      }
      if (localTotal > 0.01 && geoTotal > 0.01) {
        return Math.max(
          0,
          Math.min(localTotal, (along / geoTotal) * localTotal),
        );
      }
    }
    return Math.max(0, along);
  }

  function resolveCameraAlongM(points, camera) {
    if (!camera?.position) return null;
    const along = window.FplacesFloorArrows?.findAlongPathM?.(
      points,
      camera.position.x,
      camera.position.z,
    );
    return finiteAlong(along);
  }

  let visualAlong = null;
  function resolveStartAlongM(points, camera) {
    const nav = resolveNavigatorAlongM(points);
    const cam = resolveCameraAlongM(points, camera);
    visualAlong = window.FplacesVisualRouteState?.reconcile(visualAlong, nav, cam) ?? nav ?? cam ?? 0;
    if (window.FplacesTrailDiagnostics?.enabled) window.FplacesTrailDiagnostics.progress({
      cameraAlongM: cam, navigationLocalAlongM: nav, visualAlongM: visualAlong, sectionStartAlongM: cachedRouteInput?.startAlong ?? 0,
      source: nav != null ? 'navigation' : 'camera',
    });
    return visualAlong;
  }

  /**
   * Snap progress to the path arrow spacing grid so footprints stay fixed in
   * world space until the user advances a full cell (no crawling).
   */
  function quantizeStartAlongM(alongM) {
    const cfg = window.FPLACES_AR_CONFIG || {};
    const spacing = cfg.floorArrowSpacingM ?? 2.15;
    const leadIn = cfg.floorArrowLeadInM ?? 1.35;
    const raw = Math.max(0, alongM || 0);
    // Grid origins at leadIn, leadIn+spacing, … relative to path start.
    const stepped = Math.floor(raw / spacing) * spacing;
    return Math.max(0, stepped);
  }

  function resolveUserAlongM(points, camera) {
    return resolveStartAlongM(points, camera);
  }

  function useIncrementalPath() {
    const c = window.FPLACES_AR_CONFIG || {};
    return c.useIncrementalPath !== false;
  }

  function refreshIncrementalPath(scene, camera, floorId) {
    const DBG = window.FplacesArDebug;

    if (!scene || !cachedRouteInput || !cachedAnchorEngine?.isCalibrated) {
      DBG?.logThrottled?.(
        "IncrementalPath",
        "Extend skipped - not ready",
        {
          hasScene: !!scene,
          hasRoute: !!cachedRouteInput,
          calibrated: !!cachedAnchorEngine?.isCalibrated,
        },
        3000,
        "incremental:not-ready",
      );
      return;
    }
    if (!window.THREE || !window.FplacesIncrementalPath?.extend) return;

    const now = performance.now();
    const floorChanged = !!(floorId && floorId !== cachedFloorId);
    if (!floorChanged && now - lastArrowRefreshAt < 120) return;

    const floorPath = resolveFloorPath(
      cachedRouteInput,
      floorId || cachedFloorId,
    );
    const points = toVector3List(floorPath, cachedAnchorEngine);
    if (points.length < 2) return;

    const alongPathM = resolveUserAlongM(points, camera);
    if (floorId) cachedFloorId = floorId;
    lastArrowRefreshAt = now;

    window.FplacesIncrementalPath.extend(window.THREE, scene, points, {
      geometryIdentity: cachedRouteInput,
      floorY: groundY(),
      isFinalSection: cachedRouteInput?.isFinalSection !== false,
      camera,
      cameraX: camera?.position?.x,
      cameraZ: camera?.position?.z,
      alongPathM,
    });
  }

  function refreshFloorArrows(scene, camera, floorId) {
    if (useIncrementalPath()) {
      refreshIncrementalPath(scene, camera, floorId);
      return;
    }

    const DBG = window.FplacesArDebug;

    if (!scene || !cachedRouteInput || !cachedAnchorEngine?.isCalibrated) {
      DBG?.logThrottled?.(
        "Align",
        "Trail refresh skipped - not ready",
        {
          hasScene: !!scene,
          hasRoute: !!cachedRouteInput,
          calibrated: !!cachedAnchorEngine?.isCalibrated,
        },
        3000,
        "align:trail:not-ready",
      );
      return;
    }
    if (!window.THREE || !window.FplacesFloorArrows?.buildFloorArrows) return;

    const now = performance.now();
    const floorChanged = !!(floorId && floorId !== cachedFloorId);
    if (!floorChanged && now - lastArrowRefreshAt < 200) return;

    const floorPath = resolveFloorPath(
      cachedRouteInput,
      floorId || cachedFloorId,
    );
    const points = toVector3List(floorPath, cachedAnchorEngine);
    if (points.length < 2) return;

    const rawAlong = resolveStartAlongM(points, camera) ?? 0;
    const startAlongM = quantizeStartAlongM(rawAlong);

    // Peek next-turn distance for emphasize tier (2m / 5m) without moving markers.
    let emphasisTier = 0;
    try {
      const peek = window.FplacesFloorArrows.walkPathPlacements(points, {
        startAlongM,
        floorY: groundY(),
        isFinalSection: cachedRouteInput?.isFinalSection !== false,
        maxArrows: 1,
        leadInM: 0.5,
        spacingM: 99,
      });
      const turn = peek.find((p) => p.kind === "turn");
      emphasisTier = turnEmphasisTier(turn?.distAheadM);
    } catch (_) {
      /* ignore peek errors */
    }

    const hasGroup = !!scene.getObjectByName(
      window.FplacesFloorArrows.GROUP_NAME,
    );
    if (
      !floorChanged &&
      hasGroup &&
      startAlongM === lastArrowRefreshAlongM &&
      emphasisTier === lastArrowEmphasisTier
    ) {
      DBG?.logThrottled?.(
        "Align",
        "Trail refresh skipped - progress unchanged",
        {
          rawAlongM: Math.round(rawAlong * 100) / 100,
          startAlongM,
          emphasisTier,
          floorId: floorId || cachedFloorId,
        },
        2500,
        "align:trail:progress-unchanged",
      );
      return;
    }

    DBG?.log?.("Align", "Trail refresh triggered", {
      floorChanged,
      rawAlongM: Math.round(rawAlong * 100) / 100,
      quantizedAlongM: startAlongM,
      emphasisTier,
      floorId: floorId || cachedFloorId,
      pointCount: points.length,
      camera: {
        x: Math.round((camera?.position?.x ?? 0) * 100) / 100,
        z: Math.round((camera?.position?.z ?? 0) * 100) / 100,
      },
    });

    lastArrowRefreshAt = now;
    lastArrowRefreshAlongM = startAlongM;
    lastArrowEmphasisTier = emphasisTier;
    if (floorId) cachedFloorId = floorId;

    window.FplacesFloorArrows.buildFloorArrows(window.THREE, scene, points, {
      floorY: groundY(),
      isFinalSection: cachedRouteInput?.isFinalSection !== false,
      cameraX: camera?.position?.x,
      cameraZ: camera?.position?.z,
      startAlongM,
    });
  }

  /**
   * Per-frame leading arrow update (LookRotation + Slerp). Called every XR frame.
   */
  function updateLeadingArrow(scene, camera, floorId) {
    const DBG = window.FplacesArDebug;

    if (!scene || !cachedRouteInput || !cachedAnchorEngine?.isCalibrated) {
      DBG?.logThrottled?.(
        "Align",
        "Leading update skipped - pathGeometry not ready",
        {
          hasScene: !!scene,
          hasRoute: !!cachedRouteInput,
          calibrated: !!cachedAnchorEngine?.isCalibrated,
        },
        3000,
        "align:pathgeom-leading:not-ready",
      );
      return;
    }
    if (!window.THREE || !window.FplacesFloorArrows?.updateLeadingArrow) return;

    const now = performance.now();
    if (now - lastLeadingUpdateAt < 2) return;
    lastLeadingUpdateAt = now;

    const floorPath = resolveFloorPath(
      cachedRouteInput,
      floorId || cachedFloorId,
    );
    const points = toVector3List(floorPath, cachedAnchorEngine);
    if (points.length < 2) {
      DBG?.logThrottled?.(
        "Align",
        "Leading update skipped - floor path too short",
        { pointCount: points.length, floorId: floorId || cachedFloorId },
        2000,
        "align:pathgeom-leading:short",
      );
      return;
    }

    const alongPathM = resolveUserAlongM(points, camera);

    window.FplacesFloorArrows.updateLeadingArrow(window.THREE, scene, points, {
      floorY: groundY(),
      isFinalSection: cachedRouteInput?.isFinalSection !== false,
      cameraX: camera?.position?.x,
      cameraZ: camera?.position?.z,
      alongPathM,
    });
  }

  function updateRibbonAnimation() {
    if (!ribbonTexture) return;
    const now = performance.now();
    if (now - lastTextureScrollAt < 50) return;
    lastTextureScrollAt = now;
    ribbonTexture.offset.x -= TEXTURE_SCROLL_SPEED;
    if (ribbonTexture.offset.x <= -1) {
      ribbonTexture.offset.x += 1;
    }
    ribbonTexture.needsUpdate = true;
  }

  function generateWorldMeshPath(
    threeScene,
    routeInput,
    anchorEngine,
    options,
  ) {
    const THREE = window.THREE;
    const route = normalizeRouteInput(routeInput);
    const floorId = options?.floorId || null;
    const coordinatesList = resolveFloorPath(routeInput, floorId);

    if (!THREE || !threeScene) return null;
    if (!coordinatesList?.length) { disposePathVisuals(threeScene); return null; }

    const incremental = useIncrementalPath();
    disposePathVisuals(threeScene);

    let points = toVector3List(coordinatesList, anchorEngine);
    if (points.length < 2) {
      window.FplacesArDebug?.warn(
        "PathGeometry",
        "Path build failed - insufficient points",
        {
          inputPoints: coordinatesList.length,
          calibrated: !!anchorEngine?.isCalibrated,
        },
      );
      return null;
    }

    const camera = options?.camera || window.__fplacesXrCamera;

    cachedRouteInput = routeInput;
    cachedAnchorEngine = anchorEngine;
    cachedFloorId = floorId;

    const cfg = window.FPLACES_AR_CONFIG || {};
    const useRibbon = cfg.usePathRibbon === true;
    let mesh = null;

    if (useRibbon) {
      ribbonTexture = createChevronFlowTexture(THREE);
      const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
      const geometry = new THREE.TubeGeometry(curve, 24, 0.35, 6, false);
      const material = new THREE.MeshBasicMaterial({
        color: RIBBON_COLOR,
        map: ribbonTexture || undefined,
        transparent: true,
        opacity: 0.92,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: true,
      });
      mesh = new THREE.Mesh(geometry, material);
      mesh.name = RIBBON_NAME;
      mesh.renderOrder = 520;
      threeScene.add(mesh);
    }

    lastArrowRefreshAlongM = -1;
    lastArrowRefreshAt = 0;
    lastArrowEmphasisTier = -1;

    if (incremental) {
      const alongPathM = resolveUserAlongM(points, camera) ?? 0;
      window.FplacesIncrementalPath?.extend?.(THREE, threeScene, points, {
        geometryIdentity: cachedRouteInput,
        floorY: groundY(),
        isFinalSection: cachedRouteInput?.isFinalSection !== false,
        camera,
        cameraX: camera?.position?.x,
        cameraZ: camera?.position?.z,
        alongPathM,
      });
      lastArrowRefreshAlongM = alongPathM;
    } else {
      const rawAlong = resolveStartAlongM(points, camera) ?? 0;
      const startAlongM = quantizeStartAlongM(rawAlong);
      window.FplacesFloorArrows?.buildFloorArrows?.(THREE, threeScene, points, {
        floorY: groundY(),
        isFinalSection: cachedRouteInput?.isFinalSection !== false,
        cameraX: camera?.position?.x,
        cameraZ: camera?.position?.z,
        startAlongM,
      });
      lastArrowRefreshAlongM = startAlongM;
    }

    window.FplacesFloorArrows?.updateLeadingArrow?.(THREE, threeScene, points, {
      floorY: groundY(),
      isFinalSection: cachedRouteInput?.isFinalSection !== false,
      cameraX: camera?.position?.x,
      cameraZ: camera?.position?.z,
    });
    lastArrowRefreshAlongM = useIncrementalPath()
      ? resolveStartAlongM(points, camera) ?? 0
      : lastArrowRefreshAlongM;

    // Floating .cone turn markers removed - turn is shown as curved path on the floor.
    disposeTurnMarkers(threeScene);

    window.FplacesArDebug?.log("PathGeometry", "Floor path visuals built", {
      points: points.length,
      incrementalPath: useIncrementalPath(),
      leadingArrow: window.FPLACES_AR_CONFIG?.showLeadingLocationMarker !== false,
      ribbon: useRibbon,
      cameraY: camera?.position?.y ?? null,
      floorId,
    });

    return (
      mesh || threeScene.getObjectByName(window.FplacesIncrementalPath?.TRAIL_GROUP_NAME) || threeScene.getObjectByName(window.FplacesFloorArrows?.GROUP_NAME)
    );
  }

  function hasRibbon(scene) {
    return !!(
      scene &&
      (scene.getObjectByName(RIBBON_NAME) ||
        scene.getObjectByName(window.FplacesFloorArrows?.GROUP_NAME) ||
        scene.getObjectByName(window.FplacesFloorArrows?.LEADING_GROUP_NAME) ||
        scene.getObjectByName(
          window.FplacesIncrementalPath?.TRAIL_GROUP_NAME,
        ) ||
        scene.getObjectByName(
          window.FplacesIncrementalPath?.DESTINATION_GROUP_NAME,
        ))
    );
  }

  window.FplacesPathGeometry = {
    generateWorldMeshPath,
    hasRibbon,
    disposePathVisuals,
    disposeRibbon,
    disposeTurnMarkers,
    update(scene, camera, floorId) {
      updateRibbonAnimation();
      const resolvedFloor =
        floorId ||
        window.__fplacesNavigator?._trackedFloorId ||
        window.__fplacesNavigator?.lastPosition?.floorId ||
        null;
      const cam = camera || window.__fplacesXrCamera;
      updateLeadingArrow(scene, cam, resolvedFloor);
      refreshFloorArrows(scene, cam, resolvedFloor);
      window.FplacesIncrementalPath?.updateVisuals?.(performance.now());
    },
    updateLeadingArrow,
    resolveUserAlongM,
    RIBBON_NAME,
    TURN_GROUP_NAME,
    FLOOR_Y,
    TURN_MARKER_Y,
  };
})();
