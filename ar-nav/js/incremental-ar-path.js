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

  function buildPathKey(points) {
    if (!points?.length) return "empty";
    const a = points[0];
    const b = points[points.length - 1];
    return `${points.length}:${a.x.toFixed(2)},${a.z.toFixed(2)}:${b.x.toFixed(2)},${b.z.toFixed(2)}`;
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
    const { segments } = buildSegmentTable(points);
    if (!segments.length || !marks?.length) return [];
    const out = [];
    for (let i = 0; i < marks.length; i++) {
      const mark = marks[i];
      const seg = segments.find(
        (s) => mark >= s.startAlong - 0.001 && mark <= s.endAlong + 0.001,
      );
      if (!seg) continue;
      out.push(pointOnSegmentAt(seg, mark, floorY));
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
      spacing: 4,
      revealAheadM: 8,
      maxVisible: 2,
      nearScale: 0.9,
      remaining: Math.max(0, totalLen - alongM),
      clearTrail: false,
      spawnFrom: alongM + 2.5,
      spawnTo: alongM + 8,
      canSpawn: true,
      minSeparationM: 2.4,
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

  function spawnPlacement(THREE, group, place, segmentIndex, density) {
    const factory = window.FplacesFloorArrows?.createTrailSegment;
    if (!factory) return null;

    const fade = Math.max(0.62, 1 - (segmentIndex % 8) * 0.04);
    let scale = 1.05 - (segmentIndex % 6) * 0.03;
    const nearScale = density?.nearScale ?? 1;
    if (nearScale < 1) {
      scale *= nearScale;
    }
    const mesh = factory(THREE, place, fade, scale);
    mesh.userData.spawnAt = performance.now();
    mesh.userData.targetOpacity = fade;
    mesh.userData.segmentKey = segmentKey(place);
    mesh.userData.alongM = place.alongM;
    group.add(mesh);
    return mesh;
  }

  function disposeTrailChild(child) {
    if (!child) return;
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
    if (!trailGroup) return;
    const toRemove = [...trailGroup.children];
    toRemove.forEach((child) => {
      if (child.userData?.segmentKey) {
        spawnedKeys.delete(child.userData.segmentKey);
      }
      trailGroup.remove(child);
      disposeTrailChild(child);
    });
  }

  /**
   * Desired set is the only set. Add missing, remove anything else.
   */
  function reconcileTrail(THREE, group, desired, density) {
    const desiredKeys = new Set(desired.map((place) => segmentKey(place)));

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

    desired.forEach((place, index) => {
      const key = segmentKey(place);
      if (have.has(key)) return;
      spawnedKeys.add(key);
      spawnPlacement(THREE, group, place, index, density);
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
    const opacity = target * (0.25 + 0.75 * t);
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

  function reset(scene) {
    pathKeyCache = null;
    spawnedKeys = new Set();
    pulsePhase = 0;
    lastPulseAt = 0;
    lastVisualsAt = -Infinity;

    if (scene) {
      const trail = scene.getObjectByName(TRAIL_GROUP_NAME);
      if (trail) {
        [...trail.children].forEach((child) => disposeTrailChild(child));
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
    if (!THREE || !scene || !points?.length || points.length < 2) return null;

    const floorY = options?.floorY ?? 0.04;
    const userX = options?.cameraX;
    const userZ = options?.cameraZ;
    if (userX == null || userZ == null) return null;

    const key = buildPathKey(points);
    if (key !== pathKeyCache) {
      DBG?.log?.("IncrementalPath", "Route changed - reset incremental path", {
        previousKey: pathKeyCache,
        pathKey: key,
      });
      reset(scene);
      pathKeyCache = key;
    }

    const navAlong =
      typeof options?.alongPathM === "number" && Number.isFinite(options.alongPathM)
        ? options.alongPathM
        : null;
    const camAlong =
      window.FplacesFloorArrows?.findAlongPathM?.(points, userX, userZ) ?? null;
    const pick = window.FplacesIncrementalPathSpawn?.resolveTrailAlongM;
    const findAlong = typeof pick === "function"
      ? pick(camAlong, navAlong)
      : (Number.isFinite(camAlong) ? camAlong : (navAlong ?? 0));

    const { totalLen } = buildSegmentTable(points);
    const density = resolveTrailDensity(findAlong, totalLen);
    const remaining = Math.max(0, totalLen - findAlong);
    const destRevealM = cfg().destinationRevealRemainingM ?? 8;
    const group = ensureTrailGroup(THREE, scene);

    if (remaining <= destRevealM) {
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
    const minSep = density.minSeparationM ?? 2.4;
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

  function dispose(scene) {
    reset(scene);
  }

  window.FplacesIncrementalPath = {
    TRAIL_GROUP_NAME,
    DESTINATION_GROUP_NAME,
    extend,
    reset,
    dispose,
    updateVisuals,
  };
})();
