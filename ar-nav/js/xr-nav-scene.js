/**
 * 8th Wall camera pipeline + orientation compass HUD.
 */
(function () {
  window.FplacesXrNavScene = {
    start({ navigator, hud }) {
      const DBG = window.FplacesArDebug;
      const THREE = window.THREE;
      if (!THREE) {
        DBG?.error('XR', 'THREE.js not loaded — cannot start XR scene');
        return;
      }

      DBG?.log('XR', 'FplacesXrNavScene.start()');
      window.FplacesOrientationCompass?.start?.();
      window.FplacesOrientationCompass?.attachNavigator?.(navigator);

      let lastHudAt = 0;

      function updateHudThrottled(state) {
        const now = performance.now();
        if (now - lastHudAt < 200) return;
        lastHudAt = now;
        hud.update(state);
      }

      function onNavUpdate(state) {
        updateHudThrottled(state);
      }

      const navModule = () => ({
        name: 'fplaces-navigation',

        onStart({ scene, renderer }) {
          DBG?.log('XR', 'XR pipeline onStart');
          renderer.shadowMap.enabled = false;
          scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.4));

          navigator.onUpdate = onNavUpdate;

          if ((window.FPLACES_AR_CONFIG || {}).useGpsProgress !== false) {
            navigator.startGps();
          }
          navigator.notify();

          window.FplacesRouteBridge.sendToFlutter({ event: 'trackingGood' });
        },

        onUpdate() {
          const state = navigator.getState?.();
          if (state) updateHudThrottled(state);
        },
      });

      const fplacesRuntimeErrorModule = () => ({
        name: 'fplaces-runtime-error',
        onException(error) {
          DBG?.captureRuntimeError?.('XR.onException', error);
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
          fplacesRuntimeErrorModule(),
          navModule(),
        ].filter(Boolean));

        if (!document.getElementById('camerafeed')) {
          document.body.insertAdjacentHTML(
            'beforeend',
            '<canvas id="camerafeed"></canvas>',
          );
        }

        try {
          XR8.run({
            canvas: document.getElementById('camerafeed'),
            allowedDevices: XR8.XrConfig.device().ANY,
          });
          DBG?.log('XR', 'XR8.run() called');
        } catch (error) {
          DBG?.captureRuntimeError?.('XR8.run', error);
        }
      };

      if (window.XR8) {
        onxrloaded();
      } else {
        window.addEventListener('xrloaded', onxrloaded, { once: true });
      }
    },
  };
})();
