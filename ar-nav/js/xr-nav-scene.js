/**
 * 8th Wall camera pipeline + map-anchored world route (demo-grade floor AR).
 */
(function () {
  const SLOG = () => window.FplacesSlamDiagnostics;
  function injectCalibrationUi() {
    if (
      new URLSearchParams(window.location.search).get('preload') === '1' &&
      !window.__fplacesLiveViewRequested
    ) {
      return;
    }

    const existing = document.getElementById('fplaces-calibrate-btn');
    const btn = existing || document.createElement('button');
    btn.id = 'fplaces-calibrate-btn';
    btn.type = 'button';
    btn.className = 'calibrate-ar-btn';
    btn.textContent = 'Align route';
    btn.hidden = !window.FplacesSpatialAlignment?.needsControl;
    if (!btn.__fplacesAlignBound) {
      btn.addEventListener('click', () => {
        window.executeDemoCalibrationFlow?.({ manual: true });
      });
      btn.__fplacesAlignBound = true;
    }
    if (!existing) document.body.appendChild(btn);
    window.FplacesSpatialAlignment?.syncButton?.();
  }

  function resolveCalibrationAnchor(nav) {
    const route = nav?.route || window.fplacesActiveRoute;
    const path = route?.pathCoordinates || [];
    if (!path.length) return null;

    nav?.ensureSnap?.();

    const displaySnap = nav?.getDisplaySnap?.();
    if (displaySnap?.latitude != null && displaySnap?.longitude != null) {
      return {
        latitude: displaySnap.latitude,
        longitude: displaySnap.longitude,
        floorId: displaySnap.floorId,
        distanceAlongPathMeters: displaySnap.distanceAlongPathMeters ?? 0,
      };
    }

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

  /**
   * Yaw alignment between geographic north and the SLAM world frame.
   * Prefers the real magnetometer heading (matches the 2D map glow); falls back
   * to route bearing under the "user faces the path" assumption when no compass.
   * Returns { headingDeg, yawOffsetDeg, headingSource } or null when unusable.
   */
  function resolveWorldAlignment(cam, routeBearingDeg) {
    const rawYaw = window.FplacesSlamHeading?.getRawYawDegrees?.(cam);
    if (rawYaw == null || Number.isNaN(rawYaw)) return null;

    const compass =
      window.FplacesOrientationCompass?.getRawCompassHeading?.() ?? null;
    const headingDeg =
      compass != null ? compass : routeBearingDeg != null ? routeBearingDeg : null;
    if (headingDeg == null || Number.isNaN(headingDeg)) return null;

    return {
      headingDeg: ((headingDeg % 360) + 360) % 360,
      // SLAM yaw of true north: bearing β renders at SLAM yaw β + this offset.
      yawOffsetDeg: rawYaw - headingDeg,
      headingSource: compass != null ? 'compass' : 'route-bearing-assumed',
    };
  }

  let calibrateRetryTimer = null;

  window.__fplacesScheduleFloorCalibration = function scheduleFloorCalibration() {
    if (calibrateRetryTimer != null) return;

    const tick = () => {
      if (window.__fplacesXrScene && window.FplacesCameraStart?.isStarted?.()) {
        calibrateRetryTimer = null;
        window.executeDemoCalibrationFlow?.();
        return;
      }
      if (!window.__fplacesXrRunCalled && !window.__fplacesXrAwaitingOnStart) {
        calibrateRetryTimer = null;
        return;
      }
      calibrateRetryTimer = window.setTimeout(tick, 250);
    };

    calibrateRetryTimer = window.setTimeout(tick, 250);
  };

  function resetXrSessionFlags() {
    window.__fplacesCameraSessionNotified = false;
    window.__fplacesXrSessionActive = false;
    window.__fplacesXrAwaitingOnStart = false;
  }

  let previewFallbackTimer = null;

  function schedulePreviewFallbackIfStillBroken(reason, delayMs) {
    if (previewFallbackTimer != null) return;
    previewFallbackTimer = window.setTimeout(() => {
      previewFallbackTimer = null;
      if (window.__fplacesXrScene && window.__fplacesXrCamera) return;
      fallbackToPreviewCamera(reason);
    }, delayMs ?? 4000);
  }

  async function fallbackToPreviewCamera(reason) {
    if (window.__fplacesPreviewFallbackDone) return;
    const video = document.getElementById('camera');
    if (video?.srcObject && window.FplacesCameraStart?.isStarted?.()) {
      SLOG()?.log?.('cameraFallback', 'Preview already active - skipping fallback', { reason });
      return;
    }
    if (!window.__fplacesXrAttempted && !window.FplacesCameraStart?.isStarted?.()) return;
    window.__fplacesPreviewFallbackDone = true;
    SLOG()?.log?.('cameraFallback', 'Recovering SLAM instead of compass', { reason });
    window.FplacesCameraStart?.resetForXrRetry?.();
    window.__fplacesArMode = 'slam';
    document.body.classList.remove('lv-compass-camera');
    document.body.classList.add('lv-slam-active');
    window.FplacesLiveViewHud?.setTrackingMode?.('slam-loading', 'Resuming AR…');
    window.__fplacesRecoverSlam?.(reason);
  }

  window.__fplacesFallbackToPreviewCamera = fallbackToPreviewCamera;

  function showSlamCameraDomLayers() {
    document.body.classList.remove('lv-compass-camera', 'lv-slam-video-display', 'lv-slam-preview-visible');
    document.body.classList.add('lv-slam-active');
    window.__fplacesArMode = 'slam';
    window.__fplacesSlamVideoDisplay = false;
    window.FplacesXrRendererPatch?.restoreSlamCanvas?.();

    const video = document.getElementById('camera');
    if (video) {
      video.style.display = 'none';
    }

    const feed = document.getElementById('camerafeed');
    if (feed) {
      feed.style.display = 'block';
      feed.style.visibility = 'visible';
      feed.style.opacity = '1';
      feed.style.zIndex = '1';
      feed.style.pointerEvents = 'none';
    }
  }

  function readXrThreeScene() {
    return window.FplacesXrRendererPatch?.readXrScene?.() ?? null;
  }

  function ensureCameraFeedVisible(scene, camera, THREE, renderer) {
    showSlamCameraDomLayers();
    if (renderer?.domElement) {
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.visibility = 'visible';
      renderer.domElement.style.opacity = '1';
      renderer.domElement.style.pointerEvents = 'none';
    }
    window.__fplacesCameraTextureApplied = !!window.__fplacesUseCameraTextureBg;
    const isDesktop = window.FplacesXrRendererPatch?.isDesktopDev?.() ?? false;
    SLOG()?.logCheck?.(
      'camera-feed-layer',
      true,
      isDesktop
        ? 'SLAM canvas visible - desktop cameraTexture background (single XR8 camera)'
        : 'SLAM canvas visible - GlTextureRenderer + clearDepth-only THREE overlay',
      {
        isDesktop,
        customThreePipeline: false,
        useCameraTextureBg: !!window.__fplacesUseCameraTextureBg,
        slamVideoDisplay: !!window.__fplacesSlamVideoDisplay,
        rendererAutoClear: renderer?.autoClear ?? null,
      },
    );
    return true;
  }

  function notifyCameraSessionStarted() {
    if (!window.__fplacesXrScene || !window.__fplacesXrCamera) {
      return false;
    }
    if (window.__fplacesCameraSessionNotified) return true;

    window.__fplacesCameraSessionNotified = true;
    window.__fplacesXrAwaitingOnStart = false;
    window.__fplacesXrSessionActive = true;

    const video = document.getElementById('camera');
    if (video?.srcObject) {
      const stream = video.srcObject;
      stream.getTracks?.().forEach((track) => track.stop());
      video.srcObject = null;
    }
    if (video) video.style.display = 'none';

    const xr = readXrThreeScene();
    ensureCameraFeedVisible(
      window.__fplacesXrScene,
      window.__fplacesXrCamera,
      window.THREE,
      xr?.renderer,
    );

    window.FplacesCameraStart?.markStarted?.();
    window.__fplacesOnCameraStarted?.();
    scheduleCameraFeedHealthCheck();
    const feed = document.getElementById('camerafeed');
    SLOG()?.log?.('camera', 'XR camera feed visible', {
      feedW: feed?.width,
      feedH: feed?.height,
      clientW: feed?.clientWidth,
      clientH: feed?.clientHeight,
      customThreePipeline: false,
      useCameraTextureBg: !!window.__fplacesUseCameraTextureBg,
      slamVideoDisplay: !!window.__fplacesSlamVideoDisplay,
    });
    SLOG()?.logCheck?.(
      'xr-camera-notify',
      true,
      'notifyCameraSessionStarted - SLAM camera feed active',
      SLOG()?.snapshot?.(),
    );
    SLOG()?.runHealthCheck?.('xr-camera-notify');
    return true;
  }

  function sampleCanvasBrightness(canvas) {
    if (!canvas?.width || !canvas?.height) {
      return { brightness: null, pixel: null, error: 'canvas buffer size 0' };
    }
    try {
      const gl =
        canvas.getContext('webgl2', { preserveDrawingBuffer: true }) ||
        canvas.getContext('webgl', { preserveDrawingBuffer: true });
      if (!gl) return { brightness: null, pixel: null, error: 'no gl context' };
      const px = new Uint8Array(4);
      const x = Math.max(0, Math.floor(canvas.width / 2) - 1);
      const y = Math.max(0, Math.floor(canvas.height / 2) - 1);
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const pixel = { r: px[0], g: px[1], b: px[2], a: px[3] };
      const brightness = (px[0] + px[1] + px[2]) / 3;
      return { brightness, pixel };
    } catch (error) {
      return { brightness: null, pixel: null, error: String(error) };
    }
  }

  let feedHealthTimer = null;

  function sampleCanvasHasImage(canvas) {
    const sample = sampleCanvasBrightness(canvas);
    if (sample.brightness == null) return true;
    return sample.brightness > 18;
  }

  async function forcePreviewCamera(reason) {
    window.__fplacesLastCameraFallbackReason = reason;
    SLOG()?.log?.('cameraFallback', 'Recovering SLAM instead of compass', { reason });
    window.__fplacesArMode = 'slam';
    document.body.classList.remove('lv-compass-camera');
    document.body.classList.add('lv-slam-active');
    window.FplacesLiveViewHud?.setTrackingMode?.('slam-loading', 'Resuming AR…');
    window.__fplacesRecoverSlam?.(reason);
  }

  function scheduleCameraFeedHealthCheck() {
    if (feedHealthTimer != null) return;
    // Only validate XR canvas after SLAM session confirmed - early checks false-trigger
    // when canvas has CSS size but internal buffer not ready yet (w/h = 0).
    if (!window.__fplacesCameraSessionNotified) return;
    feedHealthTimer = window.setTimeout(() => {
      feedHealthTimer = null;
      if (document.body.classList.contains('lv-compass-camera')) return;
      const feed = document.getElementById('camerafeed');
      if (!feed || feed.clientWidth === 0 || feed.clientHeight === 0) {
        SLOG()?.logCheck?.('canvas-health', false, 'XR canvas missing or zero layout size', {
          fix: 'Check FullWindowCanvas + XR8.run canvas - SLAM kept running (no compass fallback)',
          canvas: SLOG()?.snapshot?.()?.canvas,
        });
        return;
      }
      if (!feed.width || !feed.height) {
        SLOG()?.logCheck?.(
          'canvas-health',
          true,
          'XR canvas layout ok - buffer size pending (not forcing fallback)',
          {
            size: { w: feed.width, h: feed.height, cw: feed.clientWidth, ch: feed.clientHeight },
          },
        );
        return;
      }
      const hasImage = sampleCanvasHasImage(feed);
      SLOG()?.logCheck?.(
        'canvas-health',
        hasImage,
        hasImage
          ? 'XR canvas has image data'
          : 'XR canvas pixel read inconclusive (not forcing fallback)',
        {
          fix: hasImage
            ? null
            : 'Pixel read often false on XR8 canvas - check camera visually; SLAM kept running',
          size: { w: feed.width, h: feed.height, cw: feed.clientWidth, ch: feed.clientHeight },
        },
      );
      if (hasImage) {
        SLOG()?.runHealthCheck?.('canvas-health-ok');
      }
      // Do NOT forcePreviewCamera on canvas-black - readPixels is unreliable on XR8's
      // WebGL context and was killing SLAM while the feed was actually fine.
    }, 6000);
  }

  window.executeDemoCalibrationFlow = function executeDemoCalibrationFlow(options = {}) {
    if (!window.FplacesSpatialAlignment?.canCalibrate(options.manual)) {
      if (options.manual) window.FplacesLiveViewHud?.setStatus?.('Wait for tracking, then tap Align route.', true);
      return false;
    }
    if (!window.FplacesCameraStart?.isStarted?.()) {
      window.FplacesLiveViewHud?.setStatus?.('Start the camera, then tap Align route.', true);
      return false;
    }

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

    const scene = window.__fplacesXrScene;
    const cam = window.__fplacesXrCamera;
    if (!scene) {
      window.FplacesLiveViewHud?.setStatus?.('Camera is getting ready. Try Align route again shortly.', true);
      return false;
    }

    if (!cam?.position || ![cam.position.x, cam.position.y, cam.position.z].every(Number.isFinite)) {
      window.FplacesLiveViewHud?.setStatus?.('Camera position unavailable. Hold the phone steady and retry alignment.', true);
      return false;
    }
    const floorId = nav?._trackedFloorId ?? snap.floorId;
    const anchor = window.FplacesAnchorEngine?.instance;
    // Reuse a height only while its world frame and floor are still valid.
    // Tracking/floor invalidation clears this reference in Phase 2.
    const ground = anchor?.isCalibrated && anchor.ground?.floorId === floorId ? anchor.ground : null;
    const routeBearing = nav?.getTargetBearingDegrees?.();
    const alignment = resolveWorldAlignment(cam, routeBearing);
    if (!alignment || !Number.isFinite(alignment.yawOffsetDeg)) {
      window.FplacesLiveViewHud?.setStatus?.('Heading unavailable. Wait for tracking, then retry alignment.', true);
      return false;
    }
    window.FplacesWorldRoute?.invalidate?.("calibration");

    const calibrated = window.FplacesAnchorEngine?.calibrate?.(
      {
        latitude: snap.latitude,
        longitude: snap.longitude,
      },
      alignment
        ? {
            yawOffsetDeg: alignment.yawOffsetDeg,
            slamX: cam?.position?.x,
            slamZ: cam?.position?.z,
            groundY: ground?.y,
            groundKind: ground?.kind,
            floorId,
          }
        : undefined,
    );

    if (!calibrated) {
      window.FplacesLiveViewHud?.setStatus?.('Route position unavailable. Wait for the map position, then retry alignment.', true);
      return false;
    }

    window.FplacesArDebug?.log('XR', 'World alignment resolved', {
      yawOffsetDeg: alignment ? Math.round(alignment.yawOffsetDeg * 10) / 10 : 0,
      headingDeg: alignment ? Math.round(alignment.headingDeg * 10) / 10 : null,
      headingSource: alignment?.headingSource ?? 'none',
      routeBearing: routeBearing != null ? Math.round(routeBearing * 10) / 10 : null,
    });

    window.FplacesSpatialAlignment?.calibrated?.();
    window.FplacesWorldRoute?.setRoute?.(nav);
    window.FplacesWorldRoute?.ensureRibbon?.();

    if (cam) {
      // Calibrate HUD heading to the actual facing (compass) - not the route -
      // so "turn left/right/around" matches the 2D map.
      const headingNow = alignment?.headingDeg ?? routeBearing;
      if (headingNow != null) {
        window.FplacesSlamHeading?.calibrate?.(cam, headingNow);
      }
    }
    if (cam && snap) {
      window.FplacesSlamPose?.calibrate?.(
        cam,
        nav,
        snap,
        snap.distanceAlongPathMeters ?? 0,
      );
    }

    window.FplacesLiveViewHud?.setStatus?.('Route realigned using estimated floor height. Tap Align route if it drifts.');
    return true;
  };

  window.FplacesArCalibrationUi = { inject: injectCalibrationUi };
  if (window.document?.body) injectCalibrationUi();

  function slamTrackingLabel() {
    if (!window.FplacesCameraStart?.isStarted?.()) return 'Tap Start for camera';
    return 'AR active';
  }

  function runXrEngine(DBG) {
    if (window.__fplacesXrRunCalled && window.__fplacesXrSessionActive) return;
    if (window.__fplacesXrRunCalled && !window.__fplacesXrSessionActive) {
      try {
        window.XR8?.stop?.();
      } catch (_) {}
      window.__fplacesXrRunCalled = false;
      window.__fplacesXrAwaitingOnStart = false;
    }
    window.__fplacesXrRunCalled = true;
    window.__fplacesXrAttempted = true;

    if (!document.getElementById('camerafeed')) {
      document.body.insertAdjacentHTML(
        'beforeend',
        '<canvas id="camerafeed"></canvas>',
      );
    }

    const feed = document.getElementById('camerafeed');
    showSlamCameraDomLayers();
    if (feed) {
      feed.style.visibility = 'visible';
      feed.style.display = 'block';
      feed.style.zIndex = '1';
    }

    try {
      window.XR8.run({
        canvas: feed,
        allowedDevices: window.XR8.XrConfig.device().ANY,
        glContextConfig: { alpha: false, preserveDrawingBuffer: true },
      });
      DBG?.log('XR', 'XR8.run() called');
      SLOG()?.log?.('xrRun', 'XR8.run() called');
      SLOG()?.logCheck?.('xr8-run', true, 'XR8.run() invoked from user gesture', {
        canvasSize: { w: feed?.width, h: feed?.height, cw: feed?.clientWidth, ch: feed?.clientHeight },
      });
      window.FplacesLiveViewHud?.setStatus?.('Starting AR…');
      window.setTimeout(() => {
        if (document.body.classList.contains('lv-compass-camera')) return;
        if (window.__fplacesCameraSessionNotified) return;
        if (!window.__fplacesXrAttempted) return;
        SLOG()?.logCheck?.(
          'xr-camera-timeout',
          false,
          'XR camera session not confirmed after 18s - SLAM kept running; check onStart logs',
          {},
        );
      }, 18000);
    } catch (error) {
      window.__fplacesXrRunCalled = false;
      window.__fplacesXrAwaitingOnStart = false;
      DBG?.warn('XR', 'XR8.run failed - preview camera remains active', {
        error: String(error),
      });
      SLOG()?.log?.('xrRun', 'XR8.run() threw', { error: String(error) });
      throw error;
    }
  }

  window.__fplacesRunXrEngine = function runXrFromBootstrap() {
    runXrEngine(window.FplacesArDebug);
  };

  let resetNavScene = null;
  window.__fplacesResetXrNavScene = function resetXrNavScene() {
    resetNavScene?.();
  };

  window.FplacesXrNavScene = {
    start({ navigator, hud }) {
      const DBG = window.FplacesArDebug;
      const THREE = window.THREE;
      const cfg = window.FPLACES_AR_CONFIG || {};
      if (!THREE) {
        DBG?.error('XR', 'THREE.js not loaded - cannot start XR scene');
        return;
      }

      DBG?.log('XR', 'FplacesXrNavScene.start()', {
        useWorldRoute: cfg.useWorldRoute !== false,
        demoSim: cfg.demoSimWalk,
      });

      const parentStreamsSimulator =
        navigator?.positionSource === 'simulator' ||
        navigator?.lastPosition?.source === 'simulator';
      if (!parentStreamsSimulator) {
        window.FplacesDemoSim?.start?.();
      }

      injectCalibrationUi();

      let lastHudAt = 0;
      let lastAuxAt = 0;
      let lastDiagnosticPoseAt = -Infinity;
  let lastTrackingReportAt = -Infinity;
      let xrCamera = null;
      let xrScene = null;
      let xrInitialized = false;

      resetNavScene = () => {
        xrInitialized = false;
        xrScene = null;
        xrCamera = null;
      };

      function setupXrScene() {
        if (xrInitialized) return true;
        if (!THREE) return false;

        const xr = readXrThreeScene();
        const scene = xr?.scene;
        const camera = xr?.camera;
        const renderer = xr?.renderer;
        if (!scene || !camera) {
          return false;
        }

        xrScene = scene;
        window.__fplacesXrScene = scene;
        xrCamera = camera;
        window.__fplacesXrCamera = camera;

        ensureCameraFeedVisible(scene, camera, THREE, renderer);
        scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.4));

        if (cfg.useSlamHeading !== false) {
          const headingOk = window.FplacesSlamHeading?.activate?.(xrCamera);
          window.FplacesOrientationCompass?.setWebGlActive?.(true);
          const initialBearing = navigator.getTargetBearingDegrees?.();
          const initialAlign = resolveWorldAlignment(xrCamera, initialBearing);
          const initialHeading = initialAlign?.headingDeg ?? initialBearing;
          let calibOk = false;
          if (initialHeading != null) {
            calibOk = !!window.FplacesSlamHeading?.calibrate?.(xrCamera, initialHeading);
          }
          SLOG()?.log?.('slamHeading', 'SlamHeading activate result', {
            headingOk,
            calibOk,
            initialBearing,
            initialHeading,
            headingSource: initialAlign?.headingSource ?? 'none',
          });
        } else if (cfg.useWebGlArrows !== false) {
          window.FplacesOrientationCompass?.setWebGlActive?.(true);
        }

        if (cfg.useSlamPoseFusion !== false) {
          const poseOk = window.FplacesSlamPose?.activate?.(xrCamera);
          const initialSnap =
            navigator.getDisplaySnap?.() ||
            navigator.snappedOnPath ||
            navigator.route?.pathCoordinates?.[0];
          let poseCalibOk = false;
          if (initialSnap) {
            poseCalibOk = !!window.FplacesSlamPose?.calibrate?.(
              xrCamera,
              navigator,
              initialSnap,
              initialSnap.distanceAlongPathMeters ?? 0,
            );
          }
          SLOG()?.log?.('slamPose', 'SlamPose activate result', {
            poseOk,
            poseCalibOk,
            hasInitialSnap: !!initialSnap,
          });
        }

        if (cfg.useWorldRoute !== false && xrScene && xrCamera) {
          window.FplacesWorldRoute?.attach?.({ THREE, scene: xrScene, camera: xrCamera });
          if (navigator.route) {
            window.FplacesWorldRoute?.setRoute?.(navigator);
          }
        } else if (cfg.useWebGlArrows !== false && xrCamera) {
          window.FplacesPathArrows3d?.attach?.({ THREE, camera: xrCamera });
        }

        if (!notifyCameraSessionStarted()) {
          return false;
        }

        if (cfg.useWorldRoute !== false && xrScene && xrCamera) {
          const embeddedInPwa = window.parent && window.parent !== window;
          if (cfg.autoCalibrate || embeddedInPwa) {
            window.executeDemoCalibrationFlow?.();
          } else {
            window.__fplacesTryAutoCalibrate?.('xr-onStart');
          }
        }

        window.__fplacesPreviewFallbackDone = false;
        window.__fplacesArMode = 'slam';
        window.FplacesLiveViewHud?.setTrackingMode?.('slam', slamTrackingLabel());
        SLOG()?.audit?.('xr-onStart');
        SLOG()?.runHealthCheck?.('xr-onStart');

        navigator.onUpdate = onNavUpdate;

        if (cfg.useGpsProgress !== false && !cfg.preferVenuePositioning) {
          navigator.startGps();
        }
        navigator.notify();

        window.FplacesRouteBridge.sendToFlutter({ event: 'trackingGood' });
        xrInitialized = true;
        return true;
      }

      function updateHudThrottled(state) {
        const now = performance.now();
        if (now - lastHudAt < 200) return;
        lastHudAt = now;
        hud.update(state);
      }

      function onNavUpdate(state) {
        updateHudThrottled(state);
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

        onStart() {
          DBG?.log('XR', 'XR pipeline onStart fired');
          SLOG()?.log?.('onStart', 'XR pipeline onStart fired');
          if (!setupXrScene()) {
            SLOG()?.log?.('onStart', 'xrScene not ready in onStart - will retry in onUpdate');
          }
        },

        listeners: [
          { event: 'reality.trackingstatus', process: (event) => { window.FplacesNavigationDiagnostics?.update('tracking', 'XR8.reality.trackingstatus', { status: event?.status ?? event?.detail?.status ?? null, reason: event?.detail?.reason ?? null }); window.FplacesSpatialAlignment?.observe(event?.status ?? event?.detail?.status); } },
          { event: 'reality.cameraconfigured', process: ({ detail }) => {
            if (detail?.recenter) window.FplacesSpatialAlignment?.invalidate('World frame changed.');
          } },
        ],
        onDetach() { window.FplacesNavigationDiagnostics?.record('tracking', 'XR8.onDetach', { event: 'onDetach' }); window.FplacesSpatialAlignment?.invalidate('Camera detached.'); },
        onPaused() { window.FplacesNavigationDiagnostics?.record('tracking', 'XR8.onPaused', { event: 'onPaused' }); window.FplacesSpatialAlignment?.invalidate('Camera paused.'); },
        onResume() { window.FplacesNavigationDiagnostics?.record('tracking', 'XR8.onResume', { event: 'onResume' }); window.FplacesSpatialAlignment?.invalidate('Camera resumed.'); },
        onUpdate({ processCpuResult } = {}) {
          window.FplacesSpatialAlignment?.observe(processCpuResult?.reality?.trackingStatus);
          if (performance.now() - lastTrackingReportAt >= 1000) {
            lastTrackingReportAt = performance.now();
            const reality = processCpuResult?.reality;
            window.FplacesPhoneDiagnostics?.record('log', 'xr-tracking-frame', JSON.stringify({
              status: reality?.trackingStatus ?? null, reason: reality?.trackingReason ?? null,
              hasPosition: !!reality?.position, hasRotation: !!reality?.rotation,
              alignment: window.FplacesSpatialAlignment?.diagnosticSnapshot?.(),
            }));
          }
          if (!xrInitialized) {
            setupXrScene();
          }
          const diagnostic = window.FplacesNavigationDiagnostics;
          if (diagnostic?.recording && performance.now()-lastDiagnosticPoseAt >= 200) {
            lastDiagnosticPoseAt = performance.now();
            const reality = processCpuResult?.reality;
            diagnostic.update('pose', 'XR8.onUpdate', {
              trackingStatus: reality?.trackingStatus ?? null, trackingReason: reality?.trackingReason ?? null,
              cameraPosition: xrCamera ? { x: xrCamera.position.x, y: xrCamera.position.y, z: xrCamera.position.z } : null,
              cameraQuaternion: xrCamera?.quaternion ? { x: xrCamera.quaternion.x, y: xrCamera.quaternion.y, z: xrCamera.quaternion.z, w: xrCamera.quaternion.w } : null,
              anchorRevision: window.FplacesAnchorEngine?.instance?.revision ?? null,
              ground: window.FplacesAnchorEngine?.instance?.ground ?? null,
              routeWorld: window.FplacesWorldRoute?.getDiagnosticIdentity?.() ?? null,
              alignment: window.FplacesSpatialAlignment?.diagnosticSnapshot?.() ?? null,
              parentAlongM: navigator?._authoritativeAlongPathM ?? null,
              displayAlongM: navigator?._displayAlongPathM ?? null,
              fusedAlongM: window.FplacesSlamPose?.getDiagnosticAlongPathMeters?.() ?? null,
            });
          }
          window.FplacesStationaryMarker?.update();
          const xr = readXrThreeScene();
          if (xr?.scene && xr?.camera) {
            ensureCameraFeedVisible(xr.scene, xr.camera, THREE, xr.renderer);
          }
          if (xrCamera && cfg.useSlamHeading !== false) {
            window.FplacesSlamHeading?.update?.(xrCamera);
          }
          if (xrCamera && cfg.useSlamPoseFusion !== false) {
            window.FplacesSlamPose?.update?.(xrCamera);
          }
          if (
            xrScene &&
            cfg.useWorldRoute !== false &&
            window.FplacesAnchorEngine?.isCalibrated
          ) {
            const floorId =
              navigator._trackedFloorId ||
              navigator.lastPosition?.floorId ||
              null;
            window.FplacesPathGeometry?.updateLeadingArrow?.(
              xrScene,
              xrCamera,
              floorId,
            );
            window.FplacesIncrementalPath?.updateVisuals?.(performance.now());
          }
          const now = performance.now();
          if (now - lastAuxAt >= 120) {
            lastAuxAt = now;
            if (!window.FplacesAnchorEngine?.isCalibrated && window.FplacesSpatialAlignment?.canCalibrate(false)) {
              window.__fplacesTryAutoCalibrate?.('tracking-ready');
            }
            if (
              xrScene &&
              window.FplacesAnchorEngine?.isCalibrated &&
              !window.FplacesPathGeometry?.hasRibbon?.(xrScene)
            ) {
              window.FplacesWorldRoute?.ensureRibbon?.();
            }
            updateWorldRoute();
            const worldRouteActive =
              cfg.useWorldRoute !== false &&
              window.FplacesWorldRoute?.isAttached?.();
            if (!worldRouteActive) {
              window.FplacesPathGeometry?.update?.(xrScene, xrCamera);
            }
            window.FplacesVisualTrackingMonitor?.tick?.();
          }
          const needHud = now - lastHudAt >= 200;
          const needSimTick = navigator.positionSource === 'simulator';
          if (needHud || needSimTick) {
            const state = navigator.getState?.();
            if (state) updateHudThrottled(state);
          }
        },
      });

      const fplacesRuntimeErrorModule = () => ({
        name: 'fplaces-runtime-error',
        onException(error) {
          window.FplacesSpatialAlignment?.invalidate('Tracking error.');
          DBG?.captureRuntimeError?.('XR.onException', error);
        },
      });

      let pipelineRegistered = false;
      const onxrloaded = () => {
        if (pipelineRegistered || !window.XR8?.addCameraPipelineModules) return;
        pipelineRegistered = true;
        const XRExtras = window.XRExtras || {};
        window.__fplacesThreePipeline = null;
        window.__fplacesUseCameraTextureBg = false;

        if (window.XR8?.Threejs?.configure) {
          window.XR8.Threejs.configure({ renderCameraTexture: true });
        }
        if (window.XR8?.XrController?.configure) {
          window.XR8.XrController.configure({ enableLighting: false });
        }

        const rendererPatch = window.FplacesXrRendererPatch?.createModule?.();
        if (!rendererPatch) {
          DBG?.error('XR', 'FplacesXrRendererPatch missing - cannot patch SLAM renderer');
          return;
        }

        const isDesktop = window.FplacesXrRendererPatch?.isDesktopDev?.() ?? false;
        const pipelineModules = isDesktop
          ? [
              XR8.Threejs.pipelineModule(),
              rendererPatch,
              XR8.XrController.pipelineModule(),
              XRExtras.FullWindowCanvas?.pipelineModule?.(),
              fplacesRuntimeErrorModule(),
              navModule(),
            ]
          : [
              XR8.GlTextureRenderer.pipelineModule(),
              XR8.Threejs.pipelineModule(),
              rendererPatch,
              XR8.XrController.pipelineModule(),
              XRExtras.FullWindowCanvas?.pipelineModule?.(),
              fplacesRuntimeErrorModule(),
              navModule(),
            ];

        XR8.addCameraPipelineModules(pipelineModules.filter(Boolean));

        window.__fplacesXrPipelineReady = true;
        window.FplacesArDebug?.log('XR', 'Pipeline ready - waiting for camera start tap');
        SLOG()?.log?.('pipeline', 'XR camera pipeline modules registered');
        SLOG()?.logCheck?.('xr-pipeline', true, 'XR camera pipeline modules registered', {
          isDesktop,
          modules: isDesktop
            ? ['Threejs', 'fplaces-renderer-patch', 'XrController', 'FullWindowCanvas', 'fplaces-navigation']
            : ['GlTextureRenderer', 'Threejs', 'fplaces-renderer-patch', 'XrController', 'FullWindowCanvas', 'fplaces-navigation'],
        });
      };

      window.addEventListener('xrloaded', onxrloaded, { once: true });
      if (window.XR8?.addCameraPipelineModules) {
        onxrloaded();
      }
    },
  };
})();
