/**
 * Three.js ground chevrons — Google Live View style 3D path arrows in camera space.
 */
(function () {
  const GOOGLE_BLUE = 0x4285f4;
  const ALIGN_THRESHOLD_DEG = 18;

  let laneGroup = null;
  let cameraRef = null;
  let attached = false;
  let lastAppliedRad = null;
  let lastAligned = true;

  window.FplacesPathArrows3d = {
    attach({ THREE, camera }) {
      if (!THREE || !camera || attached) return false;

      cameraRef = camera;
      laneGroup = createLane(THREE);
      camera.add(laneGroup);
      attached = true;
      laneGroup.visible = false;
      lastAppliedRad = null;
      window.FplacesPathArrows?.setWebGlActive?.(true);

      window.FplacesArDebug?.log('PathArrows3d', 'WebGL ground lane attached to camera');
      return true;
    },

    detach() {
      if (laneGroup && cameraRef) {
        cameraRef.remove(laneGroup);
      }
      laneGroup = null;
      cameraRef = null;
      attached = false;
      lastAppliedRad = null;
      window.FplacesPathArrows?.setWebGlActive?.(false);
    },

    isAttached() {
      return attached;
    },

    update({ navigator }) {
      if (!attached || !laneGroup || !navigator) return;
      if (!window.FplacesPathArrows?.shouldUpdateLane?.()) return;

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
        return;
      }

      const deltaRad = (deltaDeg * Math.PI) / 180;
      if (lastAppliedRad == null || Math.abs(deltaRad - lastAppliedRad) > 0.006) {
        laneGroup.rotation.y = deltaRad;
        lastAppliedRad = deltaRad;
      }

      window.FplacesArDebug?.logNavStateThrottled(
        'PathArrows3d',
        'WebGL lane',
        {
          targetBearingDegrees: target,
          laneRotationDeg: deltaDeg,
          distToNextTurnM: state.distanceToNextManeuverMeters,
          visible: laneGroup.visible,
        },
        1200,
      );
    },

    isAligned() {
      return lastAligned;
    },
  };

  function buildChevronShape(THREE) {
    const shape = new THREE.Shape();
    shape.moveTo(-1.7, 0);
    shape.lineTo(0, 3.4);
    shape.lineTo(1.7, 0);
    shape.lineTo(1.05, 0);
    shape.lineTo(0, 2.25);
    shape.lineTo(-1.05, 0);
    shape.closePath();
    return shape;
  }

  function createChevronMesh(THREE, opacity, color) {
    const geom = new THREE.ExtrudeGeometry(buildChevronShape(THREE), {
      depth: 0.14,
      bevelEnabled: false,
    });
    geom.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: color ?? GOOGLE_BLUE,
      transparent: true,
      opacity: opacity ?? 0.95,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.renderOrder = 1000;
    return mesh;
  }

  function createLane(THREE) {
    const cfg = window.FPLACES_AR_CONFIG || {};
    const lane = new THREE.Group();
    lane.name = 'fplaces-ground-lane';
    lane.renderOrder = 1000;

    const count = 8;
    const spacing = 1.65;
    for (let i = 0; i < count; i++) {
      const chevron = createChevronMesh(THREE, 0.98 - i * 0.07, GOOGLE_BLUE);
      const scale = 0.58 - i * 0.05;
      chevron.scale.set(scale, scale, scale);
      chevron.position.set(0, 0, -i * spacing - 1.2);
      lane.add(chevron);
    }

    lane.rotation.x = 0.74;
    lane.position.set(0, -1.05, -(cfg.arrowDistanceM ?? 2.5));
    return lane;
  }
})();
