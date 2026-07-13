/**
 * Single dynamic leading guidance arrow in camera space (Google AR hybrid fallback).
 * One mesh updated per frame via Quaternion LookRotation + Slerp — not a lane of instances.
 */
(function () {
  const CYAN_BRIGHT = 0x3dd6ff;
  const CYAN_CORE = 0x18b8f0;
  const CYAN_EDGE = 0x0a8fd4;
  const WHITE = 0xffffff;
  const ALIGN_THRESHOLD_DEG = 18;

  let laneGroup = null;
  let cameraRef = null;
  let attached = false;
  let lastAligned = true;
  let currentQuat = null;
  let targetQuat = null;
  let upVec = null;

  const EXTRUDE = {
    depth: 0.42,
    bevelEnabled: true,
    bevelThickness: 0.14,
    bevelSize: 0.11,
    bevelSegments: 4,
    curveSegments: 12,
  };

  window.FplacesPathArrows3d = {
    attach({ THREE, camera }) {
      if (!THREE || !camera || attached) return false;

      cameraRef = camera;
      laneGroup = createLeadingArrow(THREE);
      currentQuat = new THREE.Quaternion();
      targetQuat = new THREE.Quaternion();
      upVec = new THREE.Vector3(0, 1, 0);
      camera.add(laneGroup);
      attached = true;
      laneGroup.visible = false;
      window.FplacesPathArrows?.setWebGlActive?.(true);

      window.FplacesArDebug?.log(
        'PathArrows3d',
        'Single dynamic leading arrow attached to camera',
      );
      return true;
    },

    detach() {
      if (laneGroup && cameraRef) {
        cameraRef.remove(laneGroup);
      }
      laneGroup = null;
      cameraRef = null;
      attached = false;
      currentQuat = null;
      targetQuat = null;
      upVec = null;
      window.FplacesPathArrows?.setWebGlActive?.(false);
    },

    isAttached() {
      return attached;
    },

    update({ navigator }) {
      if (!attached || !laneGroup || !navigator) return;
      if (!window.FplacesPathArrows?.shouldUpdateLane?.()) return;

      const THREE = window.THREE;
      const align = window.FplacesQuaternionAlignment;
      if (!THREE || !align) return;

      const state = navigator.getState?.() || {};
      if (state.arrived) {
        laneGroup.visible = false;
        return;
      }

      const target = navigator.getTargetBearingDegrees?.();
      if (target == null) {
        laneGroup.visible = false;
        return;
      }

      const deltaDeg = window.FplacesPathArrows?.computeLaneDelta?.(target, state);
      if (deltaDeg == null) {
        laneGroup.visible = false;
        return;
      }

      const aligned = Math.abs(deltaDeg) < ALIGN_THRESHOLD_DEG;
      lastAligned = aligned;
      laneGroup.visible = aligned;

      if (!aligned) {
        window.FplacesArDebug?.logThrottled?.(
          'Align',
          'Camera leading arrow hidden — misaligned',
          window.FplacesArDebug?.arrowState?.(
            Math.round(target * 10) / 10,
            state.externalHeadingDegrees,
            Math.round(deltaDeg * 10) / 10,
            false,
          ),
          800,
          'align:camera-leading:misaligned',
        );
        return;
      }

      const cfg = window.FPLACES_AR_CONFIG || {};
      const slerpT = cfg.arrowRotationSlerpT ?? 0.15;
      const deltaRad = (deltaDeg * Math.PI) / 180;

      targetQuat.setFromAxisAngle(upVec, deltaRad);
      const wasFirstQuat = currentQuat.lengthSq() < 0.01;
      if (wasFirstQuat) {
        currentQuat.copy(targetQuat);
      } else {
        align.slerp(THREE, currentQuat, targetQuat, slerpT, currentQuat);
      }
      laneGroup.quaternion.copy(currentQuat);

      const deviceHeading =
        window.FplacesRouteLaneHeading?.getInstantHeading?.() ??
        state.externalHeadingDegrees;

      window.FplacesArDebug?.logThrottled?.(
        'Align',
        'Camera leading arrow frame',
        window.FplacesArDebug?.alignmentState?.({
          mode: 'camera-leading',
          targetBearingDegrees: Math.round(target * 10) / 10,
          deviceHeadingDegrees:
            deviceHeading != null ? Math.round(deviceHeading * 10) / 10 : null,
          deltaDegrees: Math.round(deltaDeg * 10) / 10,
          aligned,
          visible: laneGroup.visible,
          slerpT,
          firstQuat: wasFirstQuat,
          currentQuat,
          targetQuat,
          leadM: cfg.leadingArrowDistanceM ?? cfg.arrowDistanceM ?? 2.5,
          distToNextTurnM: state.distanceToNextManeuverMeters,
        }),
        450,
        'align:camera-leading:frame',
      );
    },

    isAligned() {
      return lastAligned;
    },
  };

  function buildChevronShape(THREE) {
    const shape = new THREE.Shape();
    const base = 2.75;
    const tip = 4.5;

    shape.moveTo(-base, 0);
    shape.lineTo(0, tip);
    shape.lineTo(base, 0);
    shape.lineTo(base - 0.88, 0);
    shape.lineTo(0, tip * 0.56);
    shape.lineTo(-(base - 0.88), 0);
    shape.closePath();
    return shape;
  }

  function buildSolidChevronShape(THREE) {
    const shape = new THREE.Shape();
    const base = 2.1;
    const tip = 3.1;

    shape.moveTo(-base, 0);
    shape.lineTo(0, tip);
    shape.lineTo(base, 0);
    shape.lineTo(base - 0.55, 0);
    shape.lineTo(0, tip * 0.55);
    shape.lineTo(-(base - 0.55), 0);
    shape.closePath();
    return shape;
  }

  function extrudeShape(THREE, shape, depth) {
    const geom = new THREE.ExtrudeGeometry(shape, { ...EXTRUDE, depth: depth ?? EXTRUDE.depth });
    geom.rotateX(-Math.PI / 2);
    geom.computeVertexNormals();
    return geom;
  }

  function arrowMaterial(THREE, color, opts) {
    const options = opts || {};
    return new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: options.emissive ?? 0.62,
      metalness: options.metalness ?? 0.12,
      roughness: options.roughness ?? 0.28,
      transparent: true,
      opacity: options.opacity ?? 0.98,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  function createGlowShadow(THREE, scale, opacity) {
    const geom = new THREE.CircleGeometry(scale, 24);
    const mat = new THREE.MeshBasicMaterial({
      color: CYAN_CORE,
      transparent: true,
      opacity: opacity ?? 0.22,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = -0.02;
    mesh.renderOrder = 998;
    return mesh;
  }

  function createBoldArrow(THREE, opacity) {
    const group = new THREE.Group();
    const shape = buildChevronShape(THREE);

    const outlineGeom = extrudeShape(THREE, shape, 0.46);
    const outline = new THREE.Mesh(
      outlineGeom,
      arrowMaterial(THREE, WHITE, { emissive: 0.35, opacity: opacity * 0.95 }),
    );
    outline.scale.set(1.06, 1.04, 1.06);
    outline.position.y = -0.01;
    outline.renderOrder = 999;

    const bodyGeom = extrudeShape(THREE, shape, 0.4);
    const body = new THREE.Mesh(
      bodyGeom,
      arrowMaterial(THREE, CYAN_BRIGHT, { emissive: 0.7, opacity }),
    );
    body.renderOrder = 1000;

    const stripeGeom = extrudeShape(THREE, buildSolidChevronShape(THREE), 0.08);
    const stripe = new THREE.Mesh(
      stripeGeom,
      arrowMaterial(THREE, WHITE, { emissive: 0.85, opacity: Math.min(1, opacity * 0.92) }),
    );
    stripe.position.y = 0.36;
    stripe.renderOrder = 1001;

    const rimGeom = extrudeShape(THREE, shape, 0.05);
    const rim = new THREE.Mesh(
      rimGeom,
      arrowMaterial(THREE, CYAN_EDGE, { emissive: 0.45, opacity: opacity * 0.85 }),
    );
    rim.position.y = 0.02;
    rim.renderOrder = 1000;

    group.add(createGlowShadow(THREE, 2.8, opacity * 0.2));
    group.add(outline);
    group.add(body);
    group.add(rim);
    group.add(stripe);
    return group;
  }

  function createLeadingArrow(THREE) {
    const cfg = window.FPLACES_AR_CONFIG || {};
    const lane = new THREE.Group();
    lane.name = 'fplaces-leading-guidance-arrow';
    lane.renderOrder = 1000;

    const hemi = new THREE.HemisphereLight(0xffffff, 0x3a6a88, 0.85);
    lane.add(hemi);

    const arrow = createBoldArrow(THREE, 1);
    arrow.scale.set(1.08, 1.08, 1.08);
    lane.add(arrow);

    lane.rotation.x = 0.7;
    lane.position.set(0, -0.95, -(cfg.leadingArrowDistanceM ?? cfg.arrowDistanceM ?? 2.5));
    return lane;
  }
})();
