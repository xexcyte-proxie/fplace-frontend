/**
 * Procedural floor ribbon path for calibrated AR navigation.
 */
(function () {
  const RIBBON_NAME = 'ar_navigation_ribbon';
  const TURN_GROUP_NAME = 'ar_navigation_turn_markers';
  const FLOOR_Y = 0.04;
  const TURN_MARKER_Y = 1.2;
  const RIBBON_COLOR = 0x00ffcc;
  const TURN_BEARING_THRESHOLD_DEG = 45;
  const TEXTURE_SCROLL_SPEED = 0.01;

  let ribbonTexture = null;

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

  function disposePathVisuals(scene) {
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

    disposeTurnMarkers(scene);
  }

  /** @deprecated Use disposePathVisuals */
  function disposeRibbon(scene) {
    disposePathVisuals(scene);
  }

  function createChevronFlowTexture(THREE) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const chevronCount = 4;
    const slotW = canvas.width / chevronCount;
    for (let i = 0; i < chevronCount; i++) {
      const cx = slotW * i + slotW * 0.5;
      const cy = canvas.height * 0.5;
      const w = slotW * 0.42;
      const h = canvas.height * 0.55;

      ctx.fillStyle = 'rgba(0, 255, 204, 0.95)';
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
    return Math.atan2(to.x - from.x, to.z - from.z);
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

  function toVector3List(coordinatesList, anchorEngine) {
    const engine = anchorEngine || window.FplacesAnchorEngine?.instance;
    if (!engine?.isCalibrated) return [];

    return coordinatesList
      .map((coord) => {
        const lat = coord.latitude ?? coord.lat;
        const lng = coord.longitude ?? coord.lng;
        if (lat == null || lng == null) return null;
        const local = engine.convertToSLAMSpace({ latitude: lat, longitude: lng });
        return new window.THREE.Vector3(local.x, FLOOR_Y, local.z);
      })
      .filter(Boolean);
  }

  function updateRibbonAnimation() {
    if (!ribbonTexture) return;
    ribbonTexture.offset.x -= TEXTURE_SCROLL_SPEED;
    if (ribbonTexture.offset.x <= -1) {
      ribbonTexture.offset.x += 1;
    }
    ribbonTexture.needsUpdate = true;
  }

  function generateWorldMeshPath(threeScene, routeInput, anchorEngine) {
    const THREE = window.THREE;
    const route = normalizeRouteInput(routeInput);
    const coordinatesList = route.pathCoordinates;

    if (!THREE || !threeScene || !coordinatesList?.length) return null;

    disposePathVisuals(threeScene);

    const points = toVector3List(coordinatesList, anchorEngine);
    if (points.length < 2) return null;

    ribbonTexture = createChevronFlowTexture(THREE);

    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    const geometry = new THREE.TubeGeometry(curve, 64, 0.2, 4, false);
    const material = new THREE.MeshBasicMaterial({
      color: RIBBON_COLOR,
      map: ribbonTexture || undefined,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = RIBBON_NAME;
    mesh.renderOrder = 520;
    threeScene.add(mesh);

    const turnIndices = detectTurnIndices(points);
    buildTurnMarkers(THREE, threeScene, points, turnIndices);

    window.FplacesArDebug?.log('PathGeometry', 'Ribbon built', {
      points: points.length,
      turns: turnIndices.length,
    });

    return mesh;
  }

  window.FplacesPathGeometry = {
    generateWorldMeshPath,
    disposePathVisuals,
    disposeRibbon,
    disposeTurnMarkers,
    update: updateRibbonAnimation,
    RIBBON_NAME,
    TURN_GROUP_NAME,
    FLOOR_Y,
    TURN_MARKER_Y,
  };
})();
