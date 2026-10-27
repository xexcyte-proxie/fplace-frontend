/**
 * Google Live View–style floor-locked 3D arrows.
 * Straight chevrons along the approach; a prominent L-turn at the junction
 * (emphasized ~2–5 m before). Visualization only - no nav/routing changes.
 */
(function () {
  const GROUP_NAME = "ar_navigation_floor_arrows";
  const LEADING_GROUP_NAME = "ar_navigation_leading_arrow";
  /** Google Maps Live View–style saturated blue */
  const GOOGLE_BLUE = 0x1a73e8;
  const GOOGLE_BLUE_BRIGHT = 0x4285f4;
  const GOOGLE_BLUE_EDGE = 0x1557b0;
  /** Current-position marker red (distinct from blue path chevrons) */
  const MARKER_RED = 0xea4335;
  const MARKER_RED_DARK = 0xc5221f;
  const CYAN_BRIGHT = GOOGLE_BLUE_BRIGHT;
  const CYAN_CORE = GOOGLE_BLUE;
  const CYAN_EDGE = GOOGLE_BLUE_EDGE;
  const WHITE = 0xffffff;
  const TEAL = 0x14b8a6;
  const TEAL_EDGE = 0x0d9488;
  const TURN_DETECT_DEG = 35;
  const TURN_LOOKAHEAD_M = 40;
  const PAST_TURN_CLEAR_M = 0.6;
  /** Start emphasizing the junction L-arrow when within this distance. */
  const TURN_EMPHASIS_NEAR_M = 5;
  const TURN_EMPHASIS_CLOSE_M = 2;

  const EXTRUDE = {
    depth: 0.055,
    bevelEnabled: true,
    bevelThickness: 0.018,
    bevelSize: 0.014,
    bevelSegments: 3,
    curveSegments: 10,
  };

  function buildChevronShape(THREE) {
    const shape = new THREE.Shape();
    const base = 0.92;
    const tip = 1.55;

    shape.moveTo(-base, 0);
    shape.lineTo(0, tip);
    shape.lineTo(base, 0);
    shape.lineTo(base - 0.3, 0);
    shape.lineTo(0, tip * 0.56);
    shape.lineTo(-(base - 0.3), 0);
    shape.closePath();
    return shape;
  }

  function buildStripeShape(THREE) {
    const shape = new THREE.Shape();
    const base = 0.58;
    const tip = 0.95;

    shape.moveTo(-base, 0);
    shape.lineTo(0, tip);
    shape.lineTo(base, 0);
    shape.lineTo(base - 0.22, 0);
    shape.lineTo(0, tip * 0.52);
    shape.lineTo(-(base - 0.22), 0);
    shape.closePath();
    return shape;
  }

  /**
   * Clean L glyph (no self-intersections).
   * Local 2D before extrude: +Y = forward, +X = right.
   * After rotateX(-PI/2): tip goes to -Z (forward on floor).
   */
  function buildTurnShape(THREE, side) {
    const shape = new THREE.Shape();
    const s = side === "left" ? -1 : 1;
    // Stem width? half-width along X; arm thicknesses along the bend
    const t = 0.38; // channel thickness
    const stemLen = 1.15;
    const armLen = 1.05;
    const tipLen = 0.48;

    // Outer outline walking around the L (CW for right-turn)
    shape.moveTo(-t * 0.5, 0);
    shape.lineTo(-t * 0.5, stemLen);
    shape.lineTo(s * (armLen - tipLen), stemLen);
    shape.lineTo(s * (armLen - tipLen), stemLen + t * 0.5);
    // Arrow tip of the turn arm
    shape.lineTo(s * armLen, stemLen - t * 0.15);
    shape.lineTo(s * (armLen - tipLen), stemLen - t * 0.8);
    shape.lineTo(s * (armLen - tipLen), stemLen - t);
    shape.lineTo(t * 0.5, stemLen - t);
    shape.lineTo(t * 0.5, 0);
    shape.closePath();
    return shape;
  }

  function extrudeShape(THREE, shape, depth) {
    const geom = new THREE.ExtrudeGeometry(shape, {
      ...EXTRUDE,
      depth: depth ?? EXTRUDE.depth,
    });
    geom.rotateX(-Math.PI / 2);
    geom.computeVertexNormals();
    return geom;
  }

  function mat(THREE, color, opts) {
    const options = opts || {};
    // Unlit material - stays vivid in any real-world lighting (Google AR spec).
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: options.opacity ?? 0.98,
      depthTest: true,
      depthWrite: true,
      side: THREE.DoubleSide,
    });
  }

  let sharedGeoms = null;
  let sharedMats = null;

  /** Single dynamic leading guidance arrow - position & quaternion updated every frame. */
  let leadingArrowMesh = null;
  let leadingQuatCurrent = null;
  let leadingQuatTarget = null;
  let leadingWaypointIndex = 0;
  let leadingLastPathKey = null;

  function ensureSharedAssets(THREE) {
    if (sharedGeoms) return;

    const bodyShape = buildChevronShape(THREE);
    const stripeShape = buildStripeShape(THREE);

    sharedGeoms = {
      outline: extrudeShape(THREE, bodyShape, 0.062),
      body: extrudeShape(THREE, bodyShape, 0.055),
      rim: extrudeShape(THREE, bodyShape, 0.012),
      stripe: extrudeShape(THREE, stripeShape, 0.018),
    };

    // Build turn glyphs defensively - never block straight arrows if one fails.
    try {
      const turnRight = buildTurnShape(THREE, "right");
      const turnLeft = buildTurnShape(THREE, "left");
      sharedGeoms.turnRightOutline = extrudeShape(THREE, turnRight, 0.07);
      sharedGeoms.turnRightBody = extrudeShape(THREE, turnRight, 0.06);
      sharedGeoms.turnLeftOutline = extrudeShape(THREE, turnLeft, 0.07);
      sharedGeoms.turnLeftBody = extrudeShape(THREE, turnLeft, 0.06);
    } catch (error) {
      window.FplacesArDebug?.warn?.(
        "FloorArrows",
        "Turn glyph build failed - straight arrows only",
        { error: String(error) },
      );
    }

    // Flat teal chevron - no backing disc (user-requested clean look).
    sharedMats = {
      outline: mat(THREE, TEAL_EDGE, { opacity: 1 }),
      body: mat(THREE, TEAL, { opacity: 0.96 }),
      rim: mat(THREE, TEAL_EDGE, { opacity: 0.92 }),
      stripe: mat(THREE, TEAL, { opacity: 0.95 }),
    };
  }

  // Shared for the document lifetime, like the legacy geometry cache. Each
  // instance owns one material because spawn/near-camera fades are independent.
  let trailGeometry = null;

  function ensureTrailGeometry(THREE) {
    if (trailGeometry) return trailGeometry;
    const c = window.FPLACES_AR_CONFIG || {};
    const halfWidth = (c.trailArrowWidthM ?? 0.75) / 2;
    const length = c.trailArrowLengthM ?? 0.6;
    const shape = new THREE.Shape();
    shape.moveTo(-halfWidth, 0);
    shape.lineTo(0, length);
    shape.lineTo(halfWidth, 0);
    shape.lineTo(halfWidth * 0.52, 0);
    shape.lineTo(0, length * 0.5);
    shape.lineTo(-halfWidth * 0.52, 0);
    shape.closePath();
    trailGeometry = new THREE.ExtrudeGeometry(shape, {
      depth: c.trailArrowDepthM ?? 0.018,
      bevelEnabled: false,
      steps: 1,
      curveSegments: 1,
    });
    trailGeometry.rotateX(-Math.PI / 2);
    // Color the side walls without a second mesh or material submission.
    const normals = trailGeometry.getAttribute("normal");
    const primary = new THREE.Color(c.trailArrowColor ?? TEAL);
    const edge = new THREE.Color(c.trailArrowEdgeColor ?? TEAL_EDGE);
    const colors = new Float32Array(normals.count * 3);
    for (let i = 0; i < normals.count; i++) {
      const color = Math.abs(normals.getY(i)) > 0.9 ? primary : edge;
      color.toArray(colors, i * 3);
    }
    trailGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    trailGeometry.clearGroups();
    return trailGeometry;
  }

  function createArrowInstance(THREE, opacity, scale) {
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity,
      depthTest: true,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    const body = new THREE.Mesh(ensureTrailGeometry(THREE), material);
    body.renderOrder = 512;
    group.add(body);
    group.scale.set(scale, (window.FPLACES_AR_CONFIG || {}).trailArrowThicknessScale ?? scale, scale);
    group.userData.kind = "straight";
    return group;
  }

  function leadingArrowScale() {
    const cfg = window.FPLACES_AR_CONFIG || {};
    return cfg.leadingArrowScale ?? 1.22;
  }

  /**
   * Red map-pin marker for the user's current position - visually distinct
   * from the blue navigation chevrons. Rotationally symmetric, so the shared
   * LookRotation/Slerp orientation pipeline stays harmless.
   */
  function createLocationMarkerInstance(THREE, scale) {
    const group = new THREE.Group();

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.34, 24),
      new THREE.MeshBasicMaterial({
        color: MARKER_RED_DARK,
        transparent: true,
        opacity: 0.25,
        depthTest: true,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.002;
    shadow.renderOrder = 598;

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.4, 32),
      new THREE.MeshBasicMaterial({
        color: MARKER_RED,
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.015;
    ring.renderOrder = 599;

    // Pin stem: cone apex touching the floor.
    const stem = new THREE.Mesh(
      new THREE.ConeGeometry(0.13, 0.42, 20),
      new THREE.MeshBasicMaterial({
        color: MARKER_RED,
        transparent: true,
        opacity: 0.96,
      }),
    );
    stem.rotation.x = Math.PI;
    stem.position.y = 0.21;
    stem.renderOrder = 600;

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.19, 22, 22),
      new THREE.MeshBasicMaterial({
        color: MARKER_RED,
        transparent: true,
        opacity: 0.98,
      }),
    );
    head.position.y = 0.47;
    head.renderOrder = 601;

    const headHighlight = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 14, 14),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      }),
    );
    headHighlight.position.y = 0.55;
    headHighlight.renderOrder = 602;

    group.add(shadow, ring, stem, head, headHighlight);
    group.scale.setScalar(scale);
    group.userData.kind = "location-marker";
    group.userData.pulseRing = ring;
    group.userData.bobParts = [stem, head, headHighlight];
    return group;
  }

  function createTurnArrowInstance(THREE, side, opacity, scale) {
    ensureSharedAssets(THREE);
    const outlineGeom =
      side === "left" ? sharedGeoms.turnLeftOutline : sharedGeoms.turnRightOutline;
    const bodyGeom =
      side === "left" ? sharedGeoms.turnLeftBody : sharedGeoms.turnRightBody;

    // Fallback: oversized chevron rotated ≈90° hint if L glyph unavailable
    if (!outlineGeom || !bodyGeom) {
      const fallback = createArrowInstance(THREE, opacity, scale * 1.4);
      fallback.userData.kind = "turn";
      fallback.userData.side = side;
      return fallback;
    }

    const group = new THREE.Group();

    const outline = new THREE.Mesh(outlineGeom, sharedMats.outline.clone());
    outline.material.opacity = opacity;
    outline.scale.set(1.1, 1.08, 1.1);
    outline.position.y = -0.004;
    outline.renderOrder = 514;

    const body = new THREE.Mesh(bodyGeom, sharedMats.body.clone());
    body.material.opacity = opacity;
    body.renderOrder = 515;

    group.add(outline, body);
    group.scale.setScalar(scale);
    group.userData.kind = "turn";
    group.userData.side = side;
    return group;
  }

  function segmentYawRad(dx, dz) {
    const align = window.FplacesQuaternionAlignment;
    if (align?.pathHeadingYawRad) {
      return align.pathHeadingYawRad(dx, dz);
    }
    return Math.atan2(dx, dz) + Math.PI;
  }

  function pathTangentYawAt(points, alongM) {
    const { segments } = buildSegmentTable(points);
    const seg = segments.find(
      (s) => alongM >= s.startAlong - 0.01 && alongM <= s.endAlong + 0.01,
    );
    if (seg) return seg.yaw;
    if (segments.length) return segments[segments.length - 1].yaw;
    return 0;
  }

  function signedBearingDeltaDeg(inRad, outRad) {
    let delta = ((outRad - inRad) * 180) / Math.PI;
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;
    return delta;
  }

  function findAlongPathM(points, x, z) {
    if (x == null || z == null || points.length < 2) return 0;

    let accum = 0;
    let bestAlong = 0;
    let bestDistSq = Infinity;

    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const segLenSq = abx * abx + abz * abz;
      const segLen = Math.sqrt(segLenSq);
      if (segLen < 0.001) continue;

      const apx = x - a.x;
      const apz = z - a.z;
      let t = (apx * abx + apz * abz) / segLenSq;
      t = Math.max(0, Math.min(1, t));

      const px = a.x + abx * t;
      const pz = a.z + abz * t;
      const dSq = (x - px) * (x - px) + (z - pz) * (z - pz);
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestAlong = accum + t * segLen;
      }
      accum += segLen;
    }

    return bestAlong;
  }

  let segmentTableCache = { points: null, table: null };

  function buildSegmentTable(points) {
    if (segmentTableCache.points === points && segmentTableCache.table) {
      return segmentTableCache.table;
    }
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
        yaw: segmentYawRad(dx, dz),
      });
      accum += segLen;
    }
    const table = { segments, totalLen: accum };
    segmentTableCache = { points, table };
    return table;
  }

  function findNextTurn(points, segments, startAlongM) {
    if (points.length < 3 || segments.length < 2) return null;

    for (let s = 1; s < segments.length; s++) {
      const prev = segments[s - 1];
      const curr = segments[s];
      const cornerAlong = curr.startAlong;
      if (cornerAlong < startAlongM + PAST_TURN_CLEAR_M) continue;
      if (cornerAlong > startAlongM + TURN_LOOKAHEAD_M) break;

      const delta = signedBearingDeltaDeg(prev.yaw, curr.yaw);
      if (Math.abs(delta) < TURN_DETECT_DEG) continue;

      const pt = points[curr.index];
      return {
        alongM: cornerAlong,
        x: pt.x,
        y: pt.y,
        z: pt.z,
        approachYaw: prev.yaw,
        exitYaw: curr.yaw,
        side: delta > 0 ? "right" : "left",
        deltaDeg: delta,
        distAheadM: cornerAlong - startAlongM,
      };
    }
    return null;
  }

  /**
   * Place straight chevrons along remaining path (same cadence as original),
   * optionally truncating just before a turn, then add the junction L-arrow.
   */
  function walkPathPlacements(points, options) {
    let spacing = options.spacingM ?? 2.15;
    const leadIn = options.leadInM ?? 1.35;
    let maxArrows = options.maxArrows ?? 7;
    const floorY = options.floorY ?? 0.03;
    const placements = [];

    if (points.length < 2) return placements;

    const { segments, totalLen } = buildSegmentTable(points);
    if (!segments.length) return placements;

    let startAlong =
      options.startAlongM != null && Number.isFinite(options.startAlongM)
        ? options.startAlongM
        : findAlongPathM(points, options.cameraX, options.cameraZ);

    startAlong = Math.max(0, Math.min(startAlong, Math.max(0, totalLen - 0.5)));

    const cfg = window.FPLACES_AR_CONFIG || {};
    const remaining = Math.max(0, totalLen - startAlong);
    const nearFieldM = cfg.nearFieldStartM ?? 6;
    const shortThreshold = cfg.shortRemainingThresholdM ?? 12;
    const arrivalClearM = cfg.arrivalClearRemainingM ?? 1.8;

    // Arrival-imminent: no trail chevrons.
    if (remaining < arrivalClearM) return placements;

    if (startAlong < nearFieldM || remaining <= shortThreshold) {
      spacing = Math.max(spacing, cfg.nearFieldSpacingM ?? 4);
      maxArrows = Math.min(maxArrows, cfg.nearFieldMaxArrows ?? 2);
    }

    const leadGap = options.trailOnly
      ? (cfg.leadingArrowDistanceM ?? 2.5) + (cfg.floorArrowSpacingM ?? 1.85) * 0.35
      : 0;
    // Opening stretch: push first breadcrumb farther from the camera.
    const openingBoost =
      options.trailOnly && startAlong < nearFieldM
        ? Math.max(0, spacing * 0.35)
        : 0;
    const trailStartAlong = startAlong + leadGap + openingBoost;

    const nextTurn = findNextTurn(points, segments, trailStartAlong);
    const straightHorizon = nextTurn
      ? Math.max(trailStartAlong + 0.5, nextTurn.alongM - 0.5)
      : totalLen;

    // Static breadcrumb grid - leading arrow is a separate single dynamic object.
    let nextMark = leadIn;
    while (nextMark <= trailStartAlong + 0.05) nextMark += spacing;

    let placed = 0;
    for (const seg of segments) {
      if (seg.endAlong < nextMark) continue;
      if (seg.startAlong > straightHorizon) break;

      while (
        nextMark <= Math.min(seg.endAlong, straightHorizon) &&
        placed < maxArrows
      ) {
        const t = (nextMark - seg.startAlong) / seg.segLen;
        if (t >= -0.001 && t <= 1.001) {
          placements.push({
            kind: "straight",
            x: seg.a.x + seg.dx * Math.max(0, Math.min(1, t)),
            y: floorY,
            z: seg.a.z + seg.dz * Math.max(0, Math.min(1, t)),
            rotationY: seg.yaw,
            alongM: nextMark,
            nearField: startAlong < nearFieldM,
          });
          placed++;
        }
        nextMark += spacing;
      }
    }

    if (!placements.length) {
      let mark = leadIn;
      while (mark < trailStartAlong) mark += spacing;
      for (const seg of segments) {
        if (seg.endAlong < mark) continue;
        while (mark <= seg.endAlong && placements.length < Math.min(2, maxArrows)) {
          const t = (mark - seg.startAlong) / seg.segLen;
          if (t >= 0 && t <= 1) {
            placements.push({
              kind: "straight",
              x: seg.a.x + seg.dx * t,
              y: floorY,
              z: seg.a.z + seg.dz * t,
              rotationY: seg.yaw,
              alongM: mark,
              nearField: startAlong < nearFieldM,
            });
          }
          mark += spacing;
        }
        if (placements.length) break;
      }
    }

    if (nextTurn && nextTurn.alongM >= trailStartAlong - PAST_TURN_CLEAR_M) {
      const dist = nextTurn.distAheadM;
      let emphasize = 1.15;
      if (dist <= TURN_EMPHASIS_CLOSE_M) emphasize = 1.55;
      else if (dist <= TURN_EMPHASIS_NEAR_M) emphasize = 1.35;

      placements.push({
        kind: "turn",
        side: nextTurn.side,
        x: nextTurn.x,
        y: floorY,
        z: nextTurn.z,
        rotationY: nextTurn.approachYaw,
        alongM: nextTurn.alongM,
        emphasize,
        distAheadM: dist,
      });
    }

    return placements;
  }

  function disposeLeadingArrow(scene) {
    if (!scene) return;
    const group = scene.getObjectByName(LEADING_GROUP_NAME);
    if (!group) return;

    group.traverse((obj) => {
      if (!obj.isMesh) return;
      if (
        obj.material &&
        !Object.values(sharedMats || {}).includes(obj.material)
      ) {
        obj.material.dispose?.();
      }
      // Marker geometries are per-instance (unlike shared chevron geoms).
      if (
        obj.geometry &&
        !Object.values(sharedGeoms || {}).includes(obj.geometry)
      ) {
        obj.geometry.dispose?.();
      }
    });
    scene.remove(group);
    leadingArrowMesh = null;
    leadingQuatCurrent = null;
    leadingQuatTarget = null;
    leadingWaypointIndex = 0;
    leadingLastPathKey = null;
  }

  function disposePathTrail(scene) {
    if (!scene) return;
    const group = scene.getObjectByName(GROUP_NAME);
    if (!group) return;

    group.traverse((obj) => {
      if (
        obj.isMesh &&
        obj.material &&
        !Object.values(sharedMats || {}).includes(obj.material)
      ) {
        obj.material.dispose?.();
      }
    });
    scene.remove(group);
  }

  function disposeFloorArrows(scene) {
    disposeLeadingArrow(scene);
    disposePathTrail(scene);
  }

  function pathKey(points) {
    if (!points?.length) return "empty";
    const a = points[0];
    const b = points[points.length - 1];
    return `${points.length}:${a.x.toFixed(2)},${a.z.toFixed(2)}:${b.x.toFixed(2)},${b.z.toFixed(2)}`;
  }

  function ensureLeadingArrow(THREE, scene, floorY) {
    if (leadingArrowMesh && scene.getObjectByName(LEADING_GROUP_NAME)) {
      return leadingArrowMesh;
    }

    disposeLeadingArrow(scene);

    const group = new THREE.Group();
    group.name = LEADING_GROUP_NAME;
    const marker = createLocationMarkerInstance(THREE, leadingArrowScale());
    marker.position.set(0, 0, 0);
    group.add(marker);
    group.userData.markerInstance = marker;

    leadingQuatCurrent = new THREE.Quaternion();
    leadingQuatTarget = new THREE.Quaternion();
    leadingArrowMesh = group;
    scene.add(group);

    window.FplacesArDebug?.log("FloorArrows", "Red current-position marker created");
    return group;
  }

  /**
   * Per-frame update: one dynamic arrow anchored ahead on the path, rotated via
   * LookRotation + Slerp toward the active waypoint node (Google AR hybrid model).
   */
  function updateLeadingArrow(THREE, scene, points, options) {
    const DBG = window.FplacesArDebug;
    const cfgEarly = window.FPLACES_AR_CONFIG || {};
    if (cfgEarly.showLeadingLocationMarker === false) {
      disposeLeadingArrow(scene);
      return null;
    }

    if (!THREE || !scene || !points?.length || points.length < 2) {
      DBG?.logThrottled?.(
        'Align',
        'Leading arrow skipped - insufficient path',
        { pointCount: points?.length ?? 0 },
        2000,
        'align:leading:short-path',
      );
      return null;
    }

    const align = window.FplacesQuaternionAlignment;
    if (!align?.lookRotation || !align?.slerp) {
      DBG?.warn?.('Align', 'Leading arrow skipped - quaternion module missing');
      return null;
    }

    const cfg = window.FPLACES_AR_CONFIG || {};
    const floorY = options?.floorY ?? 0.03;
    const userX = options?.cameraX;
    const userZ = options?.cameraZ;
    if (userX == null || userZ == null) {
      DBG?.logThrottled?.(
        'Align',
        'Leading arrow skipped - no camera position',
        { userX, userZ },
        2000,
        'align:leading:no-camera',
      );
      return null;
    }

    const thresholdM = cfg.waypointAdvanceThresholdM ?? 3;
    const leadM = cfg.leadingArrowDistanceM ?? 2.5;
    const slerpT = cfg.arrowRotationSlerpT ?? 0.15;

    const key = pathKey(points);
    if (key !== leadingLastPathKey) {
      DBG?.log?.('Align', 'Leading arrow path changed - reset waypoint index', {
        previousKey: leadingLastPathKey,
        pathKey: key,
        pointCount: points.length,
      });
      leadingWaypointIndex = 0;
      leadingLastPathKey = key;
      leadingQuatCurrent = null;
    }

    const prevWaypointIndex = leadingWaypointIndex;
    leadingWaypointIndex = align.advanceWaypointIndex(
      points,
      userX,
      userZ,
      leadingWaypointIndex,
      thresholdM,
    );
    const waypointAdvanced = leadingWaypointIndex !== prevWaypointIndex;

    const userAlong =
      typeof options?.alongPathM === "number" && Number.isFinite(options.alongPathM)
        ? options.alongPathM
        : findAlongPathM(points, userX, userZ);
    const { totalLen } = buildSegmentTable(points);
    const remaining = Math.max(0, totalLen - userAlong);
    const arrivalClearM = cfg.arrivalClearRemainingM ?? 1.8;
    if (remaining < arrivalClearM) {
      disposeLeadingArrow(scene);
      return null;
    }

    const posAlong = Math.min(totalLen - 0.1, userAlong + leadM);
    const pos = align.pointAtAlongM(points, posAlong);
    if (!pos) {
      DBG?.logThrottled?.(
        'Align',
        'Leading arrow skipped - no position on path',
        { userAlong: round3(userAlong), posAlong: round3(posAlong) },
        1500,
        'align:leading:no-pos',
      );
      return null;
    }

    const targetWp = points[leadingWaypointIndex];
    const arrowPos = { x: pos.x, y: floorY, z: pos.z };
    const lookAheadM = Math.min(totalLen, posAlong + Math.max(leadM, 4));
    const aheadPt = align.pointAtAlongM(points, lookAheadM);
    const distToWaypoint = Math.hypot(userX - targetWp.x, userZ - targetWp.z);

    let dir = null;
    let directionSource = "path-tangent-ahead";
    if (aheadPt) {
      dir = align.directionVector3(THREE, arrowPos, {
        x: aheadPt.x,
        y: aheadPt.y ?? floorY,
        z: aheadPt.z,
      });
    }
    if (!dir) {
      const seg = buildSegmentTable(points).segments.find(
        (s) => posAlong >= s.startAlong && posAlong <= s.endAlong,
      );
      if (seg) {
        dir = new THREE.Vector3(seg.dx / seg.segLen, 0, seg.dz / seg.segLen);
        directionSource = "segment-tangent";
      } else {
        const tangentYaw = pathTangentYawAt(points, posAlong);
        dir = new THREE.Vector3(
          Math.sin(tangentYaw - Math.PI),
          0,
          Math.cos(tangentYaw - Math.PI),
        );
        directionSource = "yaw-fallback";
      }
    }

    const group = ensureLeadingArrow(THREE, scene, floorY);
    const isFirstQuat = !leadingQuatCurrent;
    if (!leadingQuatCurrent) {
      leadingQuatCurrent = new THREE.Quaternion();
      leadingQuatTarget = new THREE.Quaternion();
      align.lookRotation(THREE, dir, align.UP, leadingQuatCurrent, arrowPos);
      group.quaternion.copy(leadingQuatCurrent);
    } else {
      align.lookRotation(THREE, dir, align.UP, leadingQuatTarget, arrowPos);
      align.slerp(THREE, leadingQuatCurrent, leadingQuatTarget, slerpT, leadingQuatCurrent);
      group.quaternion.copy(leadingQuatCurrent);
    }

    group.position.set(pos.x, floorY + 0.02, pos.z);

    // Marker life: ring pulse + gentle pin bob (per-frame, cheap transforms only).
    const marker = group.userData.markerInstance;
    if (marker) {
      const t = performance.now() / 1000;
      const ring = marker.userData.pulseRing;
      if (ring) {
        const pulse = 1 + Math.sin(t * 2.6) * 0.12;
        ring.scale.setScalar(pulse);
        ring.material.opacity = 0.55 + Math.sin(t * 2.6) * 0.2;
      }
      const bob = Math.sin(t * 2.0) * 0.02;
      const parts = marker.userData.bobParts || [];
      for (const part of parts) {
        if (part.userData.baseY == null) part.userData.baseY = part.position.y;
        part.position.y = part.userData.baseY + bob;
      }
    }

    DBG?.logThrottled?.(
      'Align',
      'Leading arrow frame',
      DBG?.alignmentState?.({
        mode: 'world-leading',
        directionSource,
        user: { x: round3(userX), z: round3(userZ), alongM: round3(userAlong) },
        progressSource:
          typeof options?.alongPathM === "number" ? "navigator" : "camera-project",
        arrow: {
          x: round3(pos.x),
          y: round3(floorY + 0.02),
          z: round3(pos.z),
          posAlongM: round3(posAlong),
          leadM,
        },
        waypoint: {
          index: leadingWaypointIndex,
          total: points.length,
          x: round3(targetWp.x),
          z: round3(targetWp.z),
          distM: round3(distToWaypoint),
          advanced: waypointAdvanced,
        },
        direction: { x: round3(dir.x), y: round3(dir.y), z: round3(dir.z) },
        currentQuat: leadingQuatCurrent,
        targetQuat: leadingQuatTarget,
        slerpT,
        thresholdM,
        firstQuat: isFirstQuat,
      }),
      450,
      'align:leading:frame',
    );

    return group;
  }

  function round3(n) {
    return typeof n === 'number' && Number.isFinite(n)
      ? Math.round(n * 1000) / 1000
      : n;
  }

  function createTrailSegment(THREE, place, fade, scale) {
    if (place.kind === "turn" || place.kind === "curve-turn") {
      const arrow = createTurnArrowInstance(
        THREE,
        place.side || "right",
        Math.min(1, fade + 0.1),
        scale * (place.emphasize || 1.1),
      );
      arrow.position.set(place.x, place.y + 0.01, place.z);
      arrow.rotation.y = place.rotationY ?? 0;
      arrow.renderOrder = 525;
      arrow.userData.kind = place.kind;
      arrow.userData.alongM = place.alongM;
      return arrow;
    }

    const arrow = createArrowInstance(THREE, fade, scale);
    arrow.position.set(place.x, place.y, place.z);
    arrow.rotation.y = place.rotationY ?? 0;
    arrow.renderOrder = 512;
    arrow.userData.kind = place.kind || "straight";
    arrow.userData.alongM = place.alongM;
    return arrow;
  }

  function placementSignature(placements) {
    if (!placements.length) return "empty";
    const first = placements[0];
    const last = placements[placements.length - 1];
    const turn = placements.find((p) => p.kind === "turn");
    return [
      placements.length,
      first.alongM?.toFixed?.(1),
      last.alongM?.toFixed?.(1),
      turn
        ? `${turn.side}@${turn.alongM.toFixed(1)}@${(turn.emphasize || 1).toFixed(2)}`
        : "noturn",
    ].join("|");
  }

  function buildFloorArrows(THREE, scene, points, options) {
    if (!THREE || !scene || !points?.length) return null;

    try {
      const cfg = window.FPLACES_AR_CONFIG || {};
      const placements = walkPathPlacements(points, {
        spacingM: cfg.floorArrowSpacingM ?? 2.15,
        leadInM: cfg.floorArrowLeadInM ?? 1.35,
        maxArrows: cfg.floorArrowCount ?? 7,
        floorY: options?.floorY ?? 0.03,
        cameraX: options?.cameraX,
        cameraZ: options?.cameraZ,
        startAlongM: options?.startAlongM,
        trailOnly: true,
      });

      const signature = placementSignature(placements);
      const existing = scene.getObjectByName(GROUP_NAME);
      if (existing && existing.userData?.signature === signature) {
        window.FplacesArDebug?.logThrottled?.(
          'Align',
          'Path trail unchanged - skip rebuild',
          { signature, placementCount: placements.length },
          2000,
          `align:trail:skip:${signature}`,
        );
        return existing;
      }

      disposePathTrail(scene);
      if (!placements.length) {
        window.FplacesArDebug?.warn?.("FloorArrows", "No placements produced", {
          points: points.length,
          startAlongM: options?.startAlongM,
        });
        return null;
      }

      const group = new THREE.Group();
      group.name = GROUP_NAME;
      group.userData.signature = signature;

      placements.forEach((place, index) => {
        const fade = Math.max(0.55, 1 - index * 0.08);
        const cfgNear = window.FPLACES_AR_CONFIG || {};
        const nearScale = place.nearField
          ? (cfgNear.nearFieldArrowScale ?? 0.72)
          : 1;
        if (place.kind === "turn") {
          const scale = 1.1 * (place.emphasize || 1.15) * nearScale;
          const arrow = createTurnArrowInstance(
            THREE,
            place.side,
            Math.min(1, fade + 0.15),
            scale,
          );
          arrow.position.set(place.x, place.y + 0.01, place.z);
          arrow.rotation.y = place.rotationY;
          arrow.renderOrder = 525;
          group.add(arrow);
        } else {
          const scale = (1.05 - index * 0.06) * nearScale;
          const arrow = createArrowInstance(THREE, fade, scale);
          arrow.position.set(place.x, place.y, place.z);
          arrow.rotation.y = place.rotationY;
          arrow.renderOrder = 512;
          group.add(arrow);
        }
      });

      scene.add(group);

      window.FplacesArDebug?.log("FloorArrows", "Path trail breadcrumbs rebuilt", {
        count: placements.length,
        signature,
        startAlongM: options?.startAlongM,
        straight: placements.filter((p) => p.kind === "straight").length,
        turn: placements.find((p) => p.kind === "turn")
          ? {
              side: placements.find((p) => p.kind === "turn").side,
              distAheadM: placements.find((p) => p.kind === "turn").distAheadM,
              emphasize: placements.find((p) => p.kind === "turn").emphasize,
            }
          : null,
      });

      return group;
    } catch (error) {
      window.FplacesArDebug?.error?.("FloorArrows", "buildFloorArrows failed", {
        error: String(error),
      });
      return null;
    }
  }

  window.FplacesFloorArrows = {
    GROUP_NAME,
    LEADING_GROUP_NAME,
    buildFloorArrows,
    buildPathTrail: buildFloorArrows,
    updateLeadingArrow,
    ensureLeadingArrow,
    createTrailSegment,
    disposeFloorArrows,
    disposePathTrail,
    disposeLeadingArrow,
    walkPathPlacements,
    findAlongPathM,
  };
})();
