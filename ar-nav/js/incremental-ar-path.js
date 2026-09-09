/**
 * Incremental AR path generation - segments append as the user walks forward,
 * curve at turns, and terminate with a destination marker. World-anchored meshes
 * are never bulk-replaced; only pruned behind the user.
 */
(function () {
  const TRAIL_GROUP_NAME = "ar_navigation_incremental_path";
  const DESTINATION_GROUP_NAME = "ar_navigation_destination";
  const TURN_DETECT_DEG = 35;
  const FADE_IN_MS = 280;

  const GOOGLE_BLUE = 0x1a73e8;
  const GOOGLE_BLUE_BRIGHT = 0x4285f4;
  const GOAL_GOLD = 0xffc107;

  let pathKeyCache = null;
  let trailGroup = null;
  let destinationGroup = null;
  let spawnedKeys = new Set();
  let spawnedTurnKeys = new Set();
  let furthestAlongM = 0;
  let pulsePhase = 0;
  let lastPulseAt = 0;
  let lastVisualsAt = -Infinity;
  let lastSpawnAt = -Infinity;

  function cfg() {
    return window.FPLACES_AR_CONFIG || {};
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  function segmentKey(place) {
    if (place.kind === "curve" || place.kind === "curve-turn") {
      return `curve:${round2(place.alongM)}:${round2(place.t ?? 0)}`;
    }
    if (place.kind === "bend-ribbon") {
      return `ribbon:${round2(place.alongM)}`;
    }
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

  function signedBearingDeltaDeg(inRad, outRad) {
    let delta = ((outRad - inRad) * 180) / Math.PI;
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;
    return delta;
  }

  function findTurns(points, segments) {
    const turns = [];
    for (let s = 1; s < segments.length; s++) {
      const prev = segments[s - 1];
      const curr = segments[s];
      const delta = signedBearingDeltaDeg(prev.yaw, curr.yaw);
      if (Math.abs(delta) < TURN_DETECT_DEG) continue;
      const pt = points[curr.index];
      turns.push({
        alongM: curr.startAlong,
        x: pt.x,
        y: pt.y,
        z: pt.z,
        approachYaw: prev.yaw,
        exitYaw: curr.yaw,
        side: delta > 0 ? "right" : "left",
        deltaDeg: delta,
        prevSeg: prev,
        currSeg: curr,
      });
    }
    return turns;
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

  /**
   * Quadratic-bezier arrows + optional bent ribbon through a corner.
   */
  function curvePlacementsAtTurn(turn, floorY, bendM, spacing) {
    const prev = turn.prevSeg;
    const curr = turn.currSeg;
    const bend = Math.min(
      bendM,
      prev.segLen * 0.48,
      curr.segLen * 0.48,
    );
    if (bend < 0.35) return [];

    const t0 = (turn.alongM - bend - prev.startAlong) / prev.segLen;
    const t2 = bend / curr.segLen;
    const p0 = {
      x: prev.a.x + prev.dx * Math.max(0, t0),
      z: prev.a.z + prev.dz * Math.max(0, t0),
    };
    const p1 = { x: turn.x, z: turn.z };
    const p2 = {
      x: curr.a.x + curr.dx * Math.min(1, t2),
      z: curr.a.z + curr.dz * Math.min(1, t2),
    };

    // Fewer curve arrows - wide spacing keeps corners readable without crowding.
    const steps = Math.max(3, Math.ceil((bend * 2.2) / spacing));
    const placements = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      const x = u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x;
      const z = u * u * p0.z + 2 * u * t * p1.z + t * t * p2.z;
      const tx = 2 * u * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
      const tz = 2 * u * (p1.z - p0.z) + 2 * t * (p2.z - p1.z);
      placements.push({
        kind: i === Math.floor(steps / 2) ? "curve-turn" : "curve",
        side: turn.side,
        x,
        y: floorY,
        z,
        rotationY:
          (window.FplacesQuaternionAlignment?.pathHeadingYawRad?.(tx, tz) ??
            Math.atan2(tx, tz) + Math.PI),
        alongM: turn.alongM + (t - 0.5) * bend * 0.15,
        turnAlongM: turn.alongM,
        t,
        bezier: { p0, p1, p2 },
      });
    }

    placements.push({
      kind: "bend-ribbon",
      alongM: turn.alongM,
      turnAlongM: turn.alongM,
      floorY,
      bezier: { p0, p1, p2 },
    });

    return placements;
  }

  function resolveTrailDensity(alongM, totalLen) {
    const spawn = window.FplacesIncrementalPathSpawn?.resolveTrailSpawnWindow?.(
      alongM,
      totalLen,
      cfg(),
    );
    if (spawn) return spawn;
    return {
      spacing: 3.2,
      revealAheadM: 8,
      maxVisible: 3,
      nearScale: 0.88,
      remaining: Math.max(0, totalLen - alongM),
      clearTrail: false,
      spawnFrom: alongM + 2.7,
      spawnTo: alongM + 8,
      canSpawn: true,
    };
  }

  function collectPlacementsInRange(points, fromAlongM, toAlongM, floorY, spacingOverride) {
    const c = cfg();
    const spacing =
      spacingOverride ??
      c.incrementalPathSpacingM ??
      c.floorArrowSpacingM ??
      1.85;
    const bendM = c.turnCurveBendM ?? 2.2;
    const curveSpacing =
      c.turnCurveArrowSpacingM ?? Math.max(0.9, spacing * 0.55);

    const { segments, totalLen } = buildSegmentTable(points);
    if (!segments.length) return [];

    const from = Math.max(0, fromAlongM);
    const to = Math.min(totalLen, toAlongM);
    const turns = findTurns(points, segments);
    const placements = [];
    const curveZones = turns.map((t) => ({
      turn: t,
      start: t.alongM - bendM * 1.1,
      end: t.alongM + bendM * 1.1,
    }));

    for (const zone of curveZones) {
      if (zone.end < from || zone.start > to) continue;
      // Skip dense curve fans when the reveal window is already tiny.
      if (to - from < spacing * 1.25) continue;
      placements.push(
        ...curvePlacementsAtTurn(zone.turn, floorY, bendM, curveSpacing),
      );
    }

    let mark = Math.ceil(from / spacing) * spacing;
    if (mark < from) mark += spacing;

    while (mark <= to) {
      const inCurve = curveZones.some(
        (z) => mark >= z.start && mark <= z.end,
      );
      if (!inCurve) {
        const seg = segments.find(
          (s) => mark >= s.startAlong && mark <= s.endAlong + 0.001,
        );
        if (seg) {
          placements.push(pointOnSegmentAt(seg, mark, floorY));
        }
      }
      mark += spacing;
    }

    // Path order - required for one-at-a-time progressive spawning.
    placements.sort(
      (a, b) => (a.alongM - b.alongM) || ((a.t ?? 0.5) - (b.t ?? 0.5)),
    );
    return placements;
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

  function createBendRibbon(THREE, bezier, floorY) {
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(bezier.p0.x, floorY + 0.008, bezier.p0.z),
      new THREE.Vector3(bezier.p1.x, floorY + 0.012, bezier.p1.z),
      new THREE.Vector3(bezier.p2.x, floorY + 0.008, bezier.p2.z),
    );
    const geom = new THREE.TubeGeometry(curve, 12, 0.12, 5, false);
    const mat = new THREE.MeshBasicMaterial({
      color: GOOGLE_BLUE_BRIGHT,
      transparent: true,
      opacity: 0.55,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.renderOrder = 505;
    mesh.userData.kind = "bend-ribbon";
    return mesh;
  }

  function spawnPlacement(THREE, group, place, segmentIndex, density) {
    const factory = window.FplacesFloorArrows?.createTrailSegment;
    if (!factory) return null;

    if (place.kind === "bend-ribbon") {
      const ribbon = createBendRibbon(THREE, place.bezier, place.floorY);
      ribbon.userData.alongM = place.alongM;
      ribbon.userData.spawnAt = performance.now();
      ribbon.userData.targetOpacity = 0.55;
      ribbon.userData.segmentKey = segmentKey(place);
      group.add(ribbon);
      return ribbon;
    }

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
    group.add(mesh);
    return mesh;
  }

  /**
   * Trail chevrons share ExtrudeGeometry; only bend-ribbon TubeGeometry is owned.
   * Disposing shared geoms leaves remaining meshes as broken polygons.
   */
  function disposeTrailChild(child) {
    if (!child) return;
    const ownsGeometry = child.userData?.kind === "bend-ribbon";
    child.traverse((obj) => {
      if (!obj.isMesh) return;
      if (ownsGeometry) {
        obj.geometry?.dispose?.();
      }
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

  function pruneExcessAhead(maxVisible) {
    if (!trailGroup || maxVisible == null || maxVisible < 0) return;
    const arrows = trailGroup.children
      .filter((child) => typeof child.userData?.alongM === "number")
      .sort((a, b) => a.userData.alongM - b.userData.alongM);
    while (arrows.length > maxVisible) {
      const child = arrows.pop();
      if (!child) break;
      if (child.userData?.segmentKey) {
        spawnedKeys.delete(child.userData.segmentKey);
      }
      trailGroup.remove(child);
      disposeTrailChild(child);
    }
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
    spawnedTurnKeys = new Set();
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

  function pruneBehind(alongM) {
    if (!trailGroup) return;
    const c = cfg();
    const behindM = c.incrementalPathPruneBehindM ?? 14;
    const cutoff = alongM - behindM;
      const toRemove = [];

    trailGroup.children.forEach((child) => {
      const a = child.userData?.alongM;
      if (typeof a === "number" && a < cutoff) {
        toRemove.push(child);
      }
    });

    toRemove.forEach((child) => {
      if (child.userData?.segmentKey) {
        spawnedKeys.delete(child.userData.segmentKey);
      }
      trailGroup.remove(child);
      disposeTrailChild(child);
    });
  }

  function reset(scene) {
    pathKeyCache = null;
    spawnedKeys = new Set();
    spawnedTurnKeys = new Set();
    furthestAlongM = 0;
    pulsePhase = 0;
    lastPulseAt = 0;
    lastVisualsAt = -Infinity;
    lastSpawnAt = -Infinity;

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

    const findAlong =
      typeof options?.alongPathM === "number" && Number.isFinite(options.alongPathM)
        ? options.alongPathM
        : (window.FplacesFloorArrows?.findAlongPathM?.(points, userX, userZ) ?? 0);
    const c = cfg();
    const spawnIntervalMs = c.incrementalPathSpawnIntervalMs ?? 320;

    const { totalLen } = buildSegmentTable(points);
    const density = resolveTrailDensity(findAlong, totalLen);
    const { spacing, maxVisible, clearTrail, canSpawn } = density;
    const remaining = Math.max(0, totalLen - findAlong);
    const destRevealM = c.destinationRevealRemainingM ?? 8;

    const group = ensureTrailGroup(THREE, scene);

    if (remaining <= destRevealM) {
      const dest = points[points.length - 1];
      ensureDestinationMarker(THREE, scene, dest, floorY);
    } else {
      hideDestinationMarker();
    }

    if (clearTrail) {
      clearTrailMeshes();
      updateVisuals(performance.now());
      return group;
    }

    const spawnFrom = Math.max(furthestAlongM, density.spawnFrom);
    const spawnTo = Math.min(totalLen - 0.2, density.spawnTo);

    if (canSpawn && spawnTo > spawnFrom + 0.3 && maxVisible > 0) {
      const placements = collectPlacementsInRange(
        points,
        spawnFrom,
        spawnTo,
        floorY,
        spacing,
      );
      let added = 0;
      const now = performance.now();

      for (const place of placements) {
        if (group.children.length >= maxVisible) break;

        if (place.kind === "bend-ribbon" && place.turnAlongM != null) {
          const tk = `turn:${round2(place.turnAlongM)}`;
          if (spawnedTurnKeys.has(tk)) continue;
        }

        const sk = segmentKey(place);
        if (spawnedKeys.has(sk)) continue;

        // One-at-a-time build-up: at most one new arrow per spawn interval.
        if (added > 0 || now - lastSpawnAt < spawnIntervalMs) break;

        spawnedKeys.add(sk);
        spawnPlacement(THREE, group, place, group.children.length, density);
        lastSpawnAt = now;
        if (typeof place.alongM === "number") {
          furthestAlongM = Math.max(furthestAlongM, place.alongM);
        }
        if (place.kind === "bend-ribbon" && place.turnAlongM != null) {
          spawnedTurnKeys.add(`turn:${round2(place.turnAlongM)}`);
        }
        added++;
      }

      if (added > 0) {
        DBG?.logThrottled?.(
          "IncrementalPath",
          "Segment appended",
          {
            added,
            totalChildren: group.children.length,
            userAlongM: round2(findAlong),
            spawnFrom: round2(spawnFrom),
            spawnTo: round2(spawnTo),
            furthestAlongM: round2(furthestAlongM),
            spacing: round2(spacing),
            maxVisible,
            remaining: round2(density.remaining),
          },
          600,
          "incremental:append",
        );
      }
    }

    pruneBehind(findAlong);
    pruneExcessAhead(maxVisible);

    // Drop segments spawned at wrong along (e.g. before navigator progress was wired).
    if (findAlong > furthestAlongM + 6) {
      furthestAlongM = Math.max(furthestAlongM, findAlong);
    }

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
