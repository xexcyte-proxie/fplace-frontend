/**
 * 8th Wall + Three.js navigation scene (official Camera Pipeline pattern).
 *
 * Arrow is parented to the XR camera and rotated each frame using:
 *   route bearing (from Mappedin path) − device compass heading
 *
 * This matches standard WebAR walking-nav behavior and avoids mixing GPS
 * lat/lng with SLAM world coordinates (which do not share the same origin).
 */
(function () {
  function createArrowMesh(THREE, color) {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.45,
      transparent: true,
      opacity: 0.95,
    });
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.7), mat);
    shaft.position.z = -0.35;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 12), mat);
    head.rotation.x = Math.PI / 2;
    head.position.z = -0.75;
    group.add(shaft, head);
    return group;
  }

  function normalizeDeltaDegrees(delta) {
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;
    return delta;
  }

  function readCompassHeading(event) {
    if (typeof event.webkitCompassHeading === 'number') {
      return event.webkitCompassHeading;
    }
    if (typeof event.alpha !== 'number') return null;
    if (event.absolute) {
      return (360 - event.alpha) % 360;
    }
    return (360 - event.alpha) % 360;
  }

  function requestCompassPermission() {
    if (
      typeof DeviceOrientationEvent === 'undefined' ||
      typeof DeviceOrientationEvent.requestPermission !== 'function'
    ) {
      return Promise.resolve(true);
    }
    return DeviceOrientationEvent.requestPermission()
      .then((state) => state === 'granted')
      .catch(() => false);
  }

  window.FplacesXrNavScene = {
    start({ navigator, hud }) {
      const cfg = window.FPLACES_AR_CONFIG || {};
      const THREE = window.THREE;
      if (!THREE) {
        console.error('[fplaces] THREE.js not loaded');
        return;
      }

      let arrow;
      let cameraRef;
      let deviceHeadingDeg = null;
      let compassBound = false;
      let lastHudAt = 0;

      function bindCompass() {
        if (compassBound) return;
        compassBound = true;
        const onOrientation = (event) => {
          const heading = readCompassHeading(event);
          if (heading != null) deviceHeadingDeg = heading;
        };
        window.addEventListener('deviceorientationabsolute', onOrientation, true);
        window.addEventListener('deviceorientation', onOrientation, true);
      }

      function updateHudThrottled(state) {
        const now = performance.now();
        if (now - lastHudAt < 250) return;
        lastHudAt = now;
        hud.update(state);
      }

      function updateArrow() {
        if (!arrow || !cameraRef) return;

        const targetBearing = navigator.getTargetBearingDegrees?.();
        if (targetBearing == null) {
          arrow.visible = false;
          return;
        }

        arrow.visible = true;

        if (deviceHeadingDeg != null) {
          const deltaDeg = normalizeDeltaDegrees(targetBearing - deviceHeadingDeg);
          arrow.rotation.set(0, (deltaDeg * Math.PI) / 180, 0);
          return;
        }

        // No compass yet: keep arrow centered (walk forward) until heading arrives.
        arrow.rotation.set(0, 0, 0);
      }

      const navModule = () => ({
        name: 'fplaces-navigation',

        onStart({ scene, camera, renderer }) {
          cameraRef = camera;

          renderer.shadowMap.enabled = false;

          const light = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
          scene.add(light);

          arrow = createArrowMesh(THREE, 0x22c55e);
          arrow.visible = false;
          arrow.frustumCulled = false;
          camera.add(arrow);
          arrow.position.set(0, -0.32, -2.4);

          navigator.onUpdate = (state) => {
            updateHudThrottled(state);
            updateArrow();
          };

          requestCompassPermission().then((granted) => {
            if (granted) bindCompass();
          });
          bindCompass();

          if (cfg.useGpsProgress !== false) {
            navigator.startGps();
          }
          navigator.notify();

          window.FplacesRouteBridge.sendToFlutter({ event: 'trackingGood' });
        },

        onUpdate() {
          updateArrow();
          const state = navigator.getState?.();
          if (state) updateHudThrottled(state);
        },
      });

      const onxrloaded = () => {
        const XRExtras = window.XRExtras || {};
        XR8.addCameraPipelineModules([
          XR8.GlTextureRenderer.pipelineModule(),
          XR8.Threejs.pipelineModule(),
          XR8.XrController.pipelineModule(),
          XRExtras.AlmostThere?.pipelineModule?.(),
          XRExtras.FullWindowCanvas?.pipelineModule?.(),
          XRExtras.Loading?.pipelineModule?.(),
          XRExtras.RuntimeError?.pipelineModule?.(),
          navModule(),
        ].filter(Boolean));

        if (!document.getElementById('camerafeed')) {
          document.body.insertAdjacentHTML(
            'beforeend',
            '<canvas id="camerafeed"></canvas>',
          );
        }

        XR8.run({
          canvas: document.getElementById('camerafeed'),
          allowedDevices: XR8.XrConfig.device().ANY,
        });
      };

      if (window.XR8) {
        onxrloaded();
      } else {
        window.addEventListener('xrloaded', onxrloaded, { once: true });
      }
    },
  };
})();
