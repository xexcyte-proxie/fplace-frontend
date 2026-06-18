/**
 * Three.js ground chevrons — Google Live View style 3D path arrows in camera space.
 */
(function () {
  let laneGroup = null;
  let cameraRef = null;
  let attached = false;
  let lastAppliedRad = null;

  window.FplacesPathArrows3d = {
    attach({ THREE, camera }) {
      if (!THREE || !camera || attached) return false;

      cameraRef = camera;
      laneGroup = createLane(THREE);
      camera.add(laneGroup);
      attached = true;
      laneGroup.visible = true;
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
      if (!window.FplacesRouteLaneHeading?.shouldUpdateLane?.()) return;

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

      laneGroup.visible = true;

      const deltaDeg = window.FplacesPathArrows?.computeLaneDelta?.(target, state);
      if (deltaDeg == null) {
        laneGroup.visible = false;
        return;
      }

      const deltaRad = (deltaDeg * Math.PI) / 180;
      if (lastAppliedRad == null || Math.abs(deltaRad - lastAppliedRad) > 0.008) {
        laneGroup.rotation.y = deltaRad;
        lastAppliedRad = deltaRad;
      }

      window.FplacesArDebug?.logNavStateThrottled(
        'PathArrows3d',
        'WebGL lane rotated',
        {
          targetBearingDegrees: target,
          deviceHeadingDegrees: window.FplacesPathArrows?.getDeviceHeading?.(),
          laneRotationDeg: deltaDeg,
          distToNextTurnM: state.distanceToNextManeuverMeters,
          visible: laneGroup.visible,
        },
        1200,
      );
    },
  };

  function buildChevronShape(THREE) {
    const shape = new THREE.Shape();
    shape.moveTo(-1.6, 0);
    shape.lineTo(0, 3.2);
    shape.lineTo(1.6, 0);
    shape.lineTo(1.0, 0);
    shape.lineTo(0, 2.1);
    shape.lineTo(-1.0, 0);
    shape.closePath();
    return shape;
  }

  function createChevronMesh(THREE, opacity) {
    const geom = new THREE.ExtrudeGeometry(buildChevronShape(THREE), {
      depth: 0.12,
      bevelEnabled: false,
    });
    geom.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
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
    const lane = new THREE.Group();
    lane.name = 'fplaces-ground-lane';
    lane.renderOrder = 1000;

    const count = 7;
    for (let i = 0; i < count; i++) {
      const chevron = createChevronMesh(THREE, 0.98 - i * 0.08);
      const scale = 0.55 - i * 0.055;
      chevron.scale.set(scale, scale, scale);
      chevron.position.set(0, 0, -i * 1.85 - 1.4);
      lane.add(chevron);
    }

    lane.rotation.x = 0.72;
    lane.position.set(0, -1.15, -0.6);
    return lane;
  }
})();
