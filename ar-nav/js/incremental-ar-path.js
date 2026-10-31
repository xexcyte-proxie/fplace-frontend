/**
 * Incremental AR path — a sliding window of at most N world-anchored chevrons.
 * Meshes are reconciled to the domain slot set; extras are removed. There is
 * no curve fan, ribbon, or append-only frontier, so arrows cannot pile.
 */
(function () {
  const TRAIL_GROUP_NAME = "ar_navigation_incremental_path";
  const DESTINATION_GROUP_NAME = "ar_navigation_destination";
  const FADE_IN_MS = 280;

  const GOOGLE_BLUE = 0x1a73e8;
  const GOOGLE_BLUE_BRIGHT = 0x4285f4;
  const GOAL_GOLD = 0xffc107;

  let pathKeyCache = null;
  let nextInstanceId = 1;
  const membershipGate = window.FplacesIncrementalPathSpawn.createMembershipGate();
  let cameraRef = null;
  let cameraPoint = null;
  let trailGroup = null;
  let destinationGroup = null;
  let spawnedKeys = new Set();
  let pulsePhase = 0;
  let lastPulseAt = 0;
  let lastVisualsAt = -Infinity;

  function cfg() {
    return window.FPLACES_AR_CONFIG || {};
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  function segmentKey(place) {
    return `seg:${round2(place.alongM)}`;
  }

  function buildSegmentTable(points) {
    const segments = [];
    let accum = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const segLen = Math.hypot(dx, dz);
      if (segLen < 0.001) continue;
      segments.push({
        index: i,
        a,
        b,
        dx,
        dz,
        segLen,
        startAlong: accum,
        endAlong: accum + segLen,
        yaw:
          window.FplacesQuaternionAlignment?.pathHeadingYawRad?.(dx, dz) ??
          Math.atan2(dx, dz) + Math.PI,
      });
      accum += segLen;
    }
    return { segments, totalLen: accum };
  }

  function pointOnSegmentAt(seg, alongM, floorY) {
    const t = (alongM - seg.startAlong) / seg.segLen;
    const clamped = Math.max(0, Math.min(1, t));
    return {
      x: seg.a.x + seg.dx * clamped,
      y: floorY,
      z: seg.a.z + seg.dz * clamped,
      rotationY: seg.yaw,
      alongM,
      kind: "straight",
    };
  }

  function placementsAtMarks(points, marks, floorY) {
    const { segments, totalLen } = buildSegmentTable(points);
    if (!segments.length || !marks?.length) return [];
    const sampleM = Math.max(0, cfg().trailTangentSampleM ?? 0.75);
    const maxTurn = (cfg().trailTangentMaxTurnDeg ?? 35) * Math.PI / 180;
    const pointAt = (along) => {
      const segment = segments.find((s) => along < s.endAlong) || segments[segments.length - 1];
      return pointOnSegmentAt(segment, along, floorY);
    };
    const out = [];
    for (const mark of marks) {
      if (mark < 0 || mark > totalLen) continue;
      // At a junction use the outgoing segment, never point back into the approach.
      const seg = segments.find((s) => mark < s.endAlong) || segments[segments.length - 1];
      const place = pointOnSegmentAt(seg, mark, floorY);
      const before = Math.max(0, mark - sampleM);
      const after = Math.min(totalLen, mark + sampleM);
      let bend = 0;
      for (let i = 1; i < segments.length; i++) {
        const joint = segments[i].startAlong;
        if (joint <= before || joint >= after) continue;
        const delta = segments[i].yaw - segments[i - 1].yaw;
        bend += Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta)));
      }
      // Limit TOTAL curvature too: several short segments must not hide a hairpin.
      if (sampleM > 0 && bend <= maxTurn) {
        const a = pointAt(before);
        const b = pointAt(after);
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        if (Math.hypot(dx, dz) > 0.001) {
          place.rotationY = window.FplacesQuaternionAlignment?.pathHeadingYawRad?.(dx, dz)
            ?? Math.atan2(dx, dz) + Math.PI;
        }
      }
      out.push(place);
    }
    return out;
  }

  function resolveTrailDensity(alongM, totalLen) {
    const spawn = window.FplacesIncrementalPathSpawn?.resolveTrailMarks?.(
      alongM,
      totalLen,
      cfg(),
    );
    if (spawn) return spawn;
    return {
      spacing: 2,
      revealAheadM: 16,
      maxVisible: 8,
      nearScale: 1,
      remaining: Math.max(0, totalLen - alongM),
      clearTrail: false,
      spawnFrom: alongM + 2,
      spawnTo: alongM + 16,
      canSpawn: true,
      minSeparationM: 1,
      marks: [],
      candidates: [],
    };
  }

  function ensureTrailGroup(THREE, scene) {
    if (trailGroup && scene.getObjectByName(TRAIL_GROUP_NAME)) {
      return trailGroup;
    }
    trailGroup = new THREE.Group();
    trailGroup.name = TRAIL_GROUP_NAME;
    scene.add(trailGroup);
    return trailGroup;
  }

  function spawnPlacement(THREE, group, place, density) {
    const factory = window.FplacesFloorArrows?.createTrailSegment;
    if (!factory) return null;

    const fade = cfg().trailArrowOpacity ?? 0.95;
    const scale = density?.nearScale ?? 1;
    const mesh = factory(THREE, place, fade, scale);
    mesh.userData.spawnAt = performance.now();
    mesh.userData.targetOpacity = fade;
    mesh.userData.segmentKey = segmentKey(place);
    mesh.userData.alongM = place.alongM;
    mesh.userData.trailInstanceId = nextInstanceId++;
    group.add(mesh);
    if (window.FplacesTrailDiagnostics?.enabled) window.FplacesTrailDiagnostics.record('create', {
      id: mesh.userData.trailInstanceId, slot: mesh.userData.segmentKey, alongM: place.alongM,
    });
    return mesh;
  }

  function disposeTrailChild(child, reason = "slot-window-change") {
    if (!child) return;
    window.FplacesTrailDiagnostics?.removed(child, reason);
    child.traverse((obj) => {
      if (!obj.isMesh) return;
      if (obj.material && !Array.isArray(obj.material)) {
        obj.material.dispose?.();
      }
    });
  }

  function disposeOwnedMeshes(root) {
    if (!root) return;
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.geometry?.dispose?.();
      if (obj.material && !Array.isArray(obj.material)) {
        obj.material.dispose?.();
      } else if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => m?.dispose?.());
      }
    });
  }

  function clearTrailMeshes() {
    membershipGate.reset();
    if (!trailGroup) return;
    const toRemove = [...trailGroup.children];
    toRemove.forEach((child) => {
      if (child.userData?.segmentKey) {
        spawnedKeys.delete(child.userData.segmentKey);
      }
      trailGroup.remove(child);
      disposeTrailChild(child, "arrival-window");
    });
  }

  /**
   * Commit stable desired membership, then add missing slots and remove obsolete ones.
   */
  function reconcileTrail(THREE, group, desired, density) {
    const desiredKeys = new Set(desired.map((place) => segmentKey(place)));
    const configured = cfg().trailMembershipStableMs;
    const delay = Number.isFinite(configured) ? Math.max(0, Math.min(500, configured)) : 180;
    const accepted = membershipGate.accept([...desiredKeys].join('|'), performance.now(), delay);
    if (!accepted) {
      // Keep existing membership while still refreshing unchanged transforms.
      desired.forEach(place => {
        const retained = group.children.find(child => child.userData.segmentKey === segmentKey(place));
        if (retained) { retained.position.set(place.x, place.y, place.z); retained.rotation.y = place.rotationY ?? 0; }
      });
      return;
    }

    [...group.children].forEach((child) => {
      const key = child.userData?.segmentKey;
      if (key && desiredKeys.has(key)) return;
      if (key) spawnedKeys.delete(key);
      group.remove(child);
      disposeTrailChild(child);
    });

    const have = new Set(
      group.children
        .map((child) => child.userData?.segmentKey)
        .filter(Boolean),
    );

    desired.forEach((place) => {
      const key = segmentKey(place);
      if (have.has(key)) {
        const retained = group.children.find(child => child.userData?.segmentKey === key);
        retained.position.set(place.x, place.y, place.z);
        retained.rotation.y = place.rotationY ?? 0;
        return;
      }
      spawnedKeys.add(key);
      spawnPlacement(THREE, group, place, density);
    });
  }

  function ensureDestinationMarker(THREE, scene, destPoint, floorY) {
    if (!destPoint) return null;
    if (destinationGroup && scene.getObjectByName(DESTINATION_GROUP_NAME)) {
      destinationGroup.position.set(destPoint.x, floorY, destPoint.z);
      destinationGroup.visible = true;
      return destinationGroup;
    }

    destinationGroup = new THREE.Group();
    destinationGroup.name = DESTINATION_GROUP_NAME;

    const coreGeom = new THREE.SphereGeometry(0.22, 20, 20);
    const coreMat = new THREE.MeshBasicMaterial({
      color: GOAL_GOLD,
      transparent: true,
      opacity: 0.95,
      depthTest: true,
    });
    const core = new THREE.Mesh(coreGeom, coreMat);
    core.position.y = 0.55;
    core.renderOrder = 620;

    const glowGeom = new THREE.SphereGeometry(0.38, 16, 16);
    const glowMat = new THREE.MeshBasicMaterial({
      color: GOOGLE_BLUE_BRIGHT,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    const glow = new THREE.Mesh(glowGeom, glowMat);
    glow.position.y = 0.55;
    glow.renderOrder = 619;

    const pinGeom = new THREE.CylinderGeometry(0.06, 0.09, 0.5, 12);
    const pinMat = new THREE.MeshBasicMaterial({
      color: GOOGLE_BLUE,
      transparent: true,
      opacity: 0.88,
    });
    const pin = new THREE.Mesh(pinGeom, pinMat);
    pin.position.y = 0.25;
    pin.renderOrder = 618;

    const ringGeom = new THREE.RingGeometry(0.42, 0.52, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: GOAL_GOLD,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    ring.renderOrder = 617;

    destinationGroup.add(ring, pin, glow, core);
    destinationGroup.position.set(destPoint.x, floorY, destPoint.z);
    destinationGroup.userData.isDestination = true;
    destinationGroup.visible = true;
    scene.add(destinationGroup);

    window.FplacesArDebug?.log?.("IncrementalPath", "Destination marker placed", {
      x: round2(destPoint.x),
      z: round2(destPoint.z),
    });

    return destinationGroup;
  }

  function hideDestinationMarker() {
    if (!destinationGroup) return;
    destinationGroup.visible = false;
  }

  function applyFadeIn(mesh, now) {
    const spawnAt = mesh.userData.spawnAt ?? now;
    const target = mesh.userData.targetOpacity ?? 1;
    const t = Math.min(1, (now - spawnAt) / FADE_IN_MS);
    let proximity = 1;
    if (cameraRef && cameraPoint) {
      cameraPoint.copy(mesh.position);
      cameraRef.worldToLocal(cameraPoint);
      const minDepth = cfg().trailMinCameraDepthM ?? 0.8;
      const fadeM = Math.max(0.001, cfg().trailCameraFadeM ?? 0.6);
      proximity = Math.max(0, Math.min(1, (-cameraPoint.z - minDepth) / fadeM));
    }
    mesh.visible = proximity > 0;
    if (window.FplacesTrailDiagnostics?.enabled) window.FplacesTrailDiagnostics.depthChanged(mesh, now);
    const opacity = target * (0.25 + 0.75 * t) * proximity;
    mesh.traverse((obj) => {
      if (obj.isMesh && obj.material) {
        obj.material.opacity = opacity;
      }
    });
  }

  function updateVisuals(now) {
    if (!trailGroup) return;
    if (now - lastVisualsAt < 2) return;
    lastVisualsAt = now;
    trailGroup.children.forEach((child) => applyFadeIn(child, now));
    window.FplacesSpatialAlignment?.sampleArrowVisibility?.(cameraRef, trailGroup, now);

    if (window.FplacesTrailDiagnostics?.enabled) window.FplacesTrailDiagnostics.sample(cameraRef, trailGroup, now);
    if (!destinationGroup) return;
    const dt = lastPulseAt ? (now - lastPulseAt) / 1000 : 0;
    lastPulseAt = now;
    pulsePhase += dt * 2.4;

    const pulse = 0.85 + Math.sin(pulsePhase) * 0.15;
    destinationGroup.children.forEach((child, i) => {
      if (!child.isMesh) return;
      if (i === 2) child.scale.setScalar(pulse);
      if (i === 3) child.position.y = 0.55 + Math.sin(pulsePhase * 1.3) * 0.04;
    });
  }

  function reset(scene, reason = "geometry-change") {
    membershipGate.reset();
    pathKeyCache = null;
    cameraRef = null;
    cameraPoint = null;
    spawnedKeys = new Set();
    pulsePhase = 0;
    lastPulseAt = 0;
    lastVisualsAt = -Infinity;

    if (scene) {
      const trail = scene.getObjectByName(TRAIL_GROUP_NAME);
      if (trail) {
        [...trail.children].forEach((child) => disposeTrailChild(child, reason));
        scene.remove(trail);
      }
      const dest = scene.getObjectByName(DESTINATION_GROUP_NAME);
      if (dest) {
        disposeOwnedMeshes(dest);
        scene.remove(dest);
      }
    }
    trailGroup = null;
    destinationGroup = null;
  }

  function extend(THREE, scene, points, options) {
    const DBG = window.FplacesArDebug;
    if (!THREE || !scene) return null;
    if (!points?.length || points.length < 2) { reset(scene); return null; }

    const floorY = options?.floorY ?? 0.04;
    const userX = options?.cameraX;
    const userZ = options?.cameraZ;
    if (userX == null || userZ == null) return null;

    const key = options?.geometryIdentity ?? points;
    if (key !== pathKeyCache) {
      DBG?.log?.("IncrementalPath", "Route changed - reset incremental path", {
        previousKey: pathKeyCache,
        pathKey: key,
      });
      reset(scene);
      pathKeyCache = key;
    }

    cameraRef = options?.camera || null;
    if (cameraRef && !cameraPoint) cameraPoint = new THREE.Vector3();

    const navAlong =
      typeof options?.alongPathM === "number" && Number.isFinite(options.alongPathM)
        ? options.alongPathM
        : null;
    const camAlong =
      window.FplacesFloorArrows?.findAlongPathM?.(points, userX, userZ) ?? null;
    // Caller already reconciled authoritative navigation with visual progress.
    const findAlong = navAlong ?? (Number.isFinite(camAlong) ? camAlong : 0);
    if (window.FplacesTrailDiagnostics?.enabled) window.FplacesTrailDiagnostics.progress({
      cameraAlongM: camAlong, selectedAlongM: findAlong, selectedSource: navAlong != null ? 'navigation' : 'camera',
    });

    const { totalLen } = buildSegmentTable(points);
    const density = resolveTrailDensity(findAlong, totalLen);
    const remaining = Math.max(0, totalLen - findAlong);
    const destRevealM = cfg().destinationRevealRemainingM ?? 8;
    const group = ensureTrailGroup(THREE, scene);

    if (options?.isFinalSection !== false && remaining <= destRevealM) {
      const dest = points[points.length - 1];
      ensureDestinationMarker(THREE, scene, dest, floorY);
    } else {
      hideDestinationMarker();
    }

    if (density.clearTrail) {
      clearTrailMeshes();
      updateVisuals(performance.now());
      return group;
    }

    const occupy = window.FplacesIncrementalPathSpawn?.occupyTrailSlots;
    const raw = placementsAtMarks(
      points,
      density.candidates?.length ? density.candidates : density.marks,
      floorY,
    );
    const minSep = density.minSeparationM ?? 1;
    const desired = occupy
      ? occupy(raw, density.maxVisible, minSep)
      : raw.slice(0, density.maxVisible);

    reconcileTrail(THREE, group, desired, density);

    DBG?.logThrottled?.(
      "IncrementalPath",
      "Trail slots reconciled",
      {
        alongM: round2(findAlong),
        marks: (density.marks || []).map(round2),
        visible: group.children.length,
        maxVisible: density.maxVisible,
        remaining: round2(density.remaining),
      },
      800,
      "incremental:reconcile",
    );

    updateVisuals(performance.now());
    return group;
  }

  function dispose(scene, reason = "dispose") {
    reset(scene, reason);
  }

  window.FplacesIncrementalPath = {
    TRAIL_GROUP_NAME,
    DESTINATION_GROUP_NAME,
    extend,
    reset,
    dispose,
    updateVisuals,
    placementsAtMarks,
  };
})();
