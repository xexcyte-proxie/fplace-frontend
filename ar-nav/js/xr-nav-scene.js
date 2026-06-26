/**
 * 8th Wall camera pipeline + map-anchored world route (demo-grade floor AR).
 */
(function () {
  function injectCalibrationUi() {
    if (document.getElementById('fplaces-calibrate-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'fplaces-calibrate-btn';
    btn.type = 'button';
    btn.className = 'calibrate-ar-btn';
    btn.textContent = 'Calibrate & Lock AR Path';
    btn.addEventListener('click', () => {
      window.executeDemoCalibrationFlow?.();
    });
    document.body.appendChild(btn);
  }

  function resolveCalibrationAnchor(nav) {
    const route = nav?.route || window.fplacesActiveRoute;
    const path = route?.pathCoordinates || [];
    if (!path.length) return null;

    nav?.ensureSnap?.();

    const wireFrame = window.__fplacesLastPositionFrame;
    const venueSource =
      wireFrame?.source &&
      window.FplacesIndoorPosition?.isVenueSource?.(wireFrame.source);
    const positionSeed = venueSource
      ? wireFrame
      : nav?.lastPosition || wireFrame;

    if (positionSeed?.latitude != null && positionSeed?.longitude != null) {
      const snapOpts = window.FplacesIndoorPosition?.snapOptions?.(
        positionSeed,
        positionSeed.source || nav?.positionSource,
      ) || { floorId: positionSeed.floorId || null };
      const routeSnap = window.FplacesRouteGeometry?.snapToRoute?.(
        path,
        positionSeed.latitude,
        positionSeed.longitude,
        snapOpts,
      );
      if (routeSnap) {
        return {
          latitude: routeSnap.latitude,
          longitude: routeSnap.longitude,
          floorId: routeSnap.floorId ?? positionSeed.floorId,
          distanceAlongPathMeters: routeSnap.distanceAlongPathMeters ?? 0,
        };
      }
      return {
        ...positionSeed,
        distanceAlongPathMeters: 0,
      };
    }

    const fallback =
      nav?.getDisplaySnap?.() ||
      nav?.snappedOnPath ||
      path[0] ||
      null;
    if (!fallback) return null;
    return {
      latitude: fallback.latitude,
      longitude: fallback.longitude,
      floorId: fallback.floorId,
      distanceAlongPathMeters: fallback.distanceAlongPathMeters ?? 0,
    };
  }

  window.executeDemoCalibrationFlow = function executeDemoCalibrationFlow() {
    const nav = window.__fplacesNavigator;
    const route = nav?.route || window.fplacesActiveRoute;
    const path = route?.pathCoordinates || [];
    const snap = resolveCalibrationAnchor(nav);

    if (!snap || !path.length) {
      window.FplacesLiveViewHud?.setStatus?.(
        'Route not ready. Wait for the map route to sync, then calibrate.',
        true,
      );
      return;
    }

    const calibrated = window.FplacesAnchorEngine?.calibrate?.({
      latitude: snap.latitude,
      longitude: snap.longitude,
    });

    if (!calibrated) {
      window.FplacesArDebug?.error?.('XR', 'Calibration failed — missing anchor');
      return;
    }

    const scene = window.__fplacesXrScene;
    if (scene) {
      window.FplacesPathGeometry?.generateWorldMeshPath?.(
        scene,
        route,
        window.FplacesAnchorEngine.instance,
      );
    }

    window.FplacesWorldRoute?.setRoute?.(nav);
    nav?.resetProgressAtSnap?.(snap);
    // Mirror 2D map "Start": parent PWA simulator is the single source of truth.
    window.FplacesDemoSim?.stop?.();
    window.FplacesRouteBridge?.requestParentMovement?.({
      alongPathMeters: snap.distanceAlongPathMeters ?? 0,
    });
    window.FplacesLiveViewHud?.setStatus?.('AR path locked to floor.');
    window.FplacesArDebug?.log('XR', 'Demo calibration complete', {
      anchor: snap,
      pathPoints: path.length,
      source: window.__fplacesLastPositionFrame?.source || nav?.positionSource,
    });
  };

  window.FplacesArCalibrationUi = { inject: injectCalibrationUi };

  window.FplacesXrNavScene = {
    start({ navigator, hud }) {
      const DBG = window.FplacesArDebug;
      const THREE = window.THREE;
      const cfg = window.FPLACES_AR_CONFIG || {};
      if (!THREE) {
        DBG?.error('XR', 'THREE.js not loaded — cannot start XR scene');
        return;
      }

      DBG?.log('XR', 'FplacesXrNavScene.start()', {
        useWorldRoute: cfg.useWorldRoute !== false,
        demoSim: cfg.demoSimWalk,
      });
      window.FplacesOrientationCompass?.start?.();
      window.FplacesOrientationCompass?.attachNavigator?.(navigator);

      const parentStreamsSimulator =
        navigator?.positionSource === 'simulator' ||
        navigator?.lastPosition?.source === 'simulator';
      if (!parentStreamsSimulator) {
        window.FplacesDemoSim?.start?.();
      }

      injectCalibrationUi();

      let lastHudAt = 0;
      let xrCamera = null;
      let xrScene = null;
      let routeBuilt = false;

      function updateHudThrottled(state) {
        const now = performance.now();
        if (now - lastHudAt < 120) return;
        lastHudAt = now;
        hud.update(state);
      }

      function onNavUpdate(state) {
        updateHudThrottled(state);
        if (cfg.useWorldRoute !== false && !routeBuilt && navigator.route) {
          window.FplacesWorldRoute?.setRoute?.(navigator);
          routeBuilt = true;
        }
      }

      function updateWorldRoute() {
        if (cfg.useWorldRoute === false) {
          window.FplacesPathArrows3d?.update?.({ navigator });
          return;
        }
        window.FplacesWorldRoute?.update?.({ navigator });
      }

      const navModule = () => ({
        name: 'fplaces-navigation',

        onStart({ scene, camera, renderer }) {
          DBG?.log('XR', 'XR pipeline onStart');
          if (renderer?.shadowMap) {
            renderer.shadowMap.enabled = false;
          }
          if (!scene || !THREE) {
            DBG?.warn('XR', 'onStart missing scene or THREE — skipping XR setup');
            return;
          }
          scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.4));

          xrCamera = camera || scene?.children?.find?.((c) => c.isCamera) || null;
          xrScene = scene;
          window.__fplacesXrScene = xrScene;

          if (cfg.useWorldRoute !== false && xrScene && xrCamera) {
            window.FplacesWorldRoute?.attach?.({ THREE, scene: xrScene, camera: xrCamera });
            if (navigator.route) {
              window.FplacesWorldRoute?.setRoute?.(navigator);
              routeBuilt = true;
            }
          } else if (cfg.useWebGlArrows !== false && xrCamera) {
            window.FplacesPathArrows3d?.attach?.({ THREE, camera: xrCamera });
          }

          navigator.onUpdate = onNavUpdate;

          if (cfg.useGpsProgress !== false && !cfg.preferVenuePositioning) {
            navigator.startGps();
          }
          navigator.notify();

          window.FplacesRouteBridge.sendToFlutter({ event: 'trackingGood' });
        },

        onUpdate() {
          const state = navigator.getState?.();
          updateWorldRoute();
          window.FplacesPathGeometry?.update?.();
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

