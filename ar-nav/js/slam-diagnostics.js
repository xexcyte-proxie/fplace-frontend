/**
 * Always-on SLAM + AR health diagnostics (console, not gated by arDebug).
 *
 * Console helpers:
 *   logSlamStatus()  — SLAM snapshot audit
 *   logArHealth()    — full pass/fail health report with fix hints
 */
(function () {
  const PREFIX = '[fplaces SLAM]';
  const HEALTH_PREFIX = '[fplaces AR HEALTH]';

  function videoState() {
    const video = document.getElementById('camera');
    if (!video) {
      return { present: false, live: false, display: null, trackCount: 0 };
    }
    const stream = video.srcObject;
    const tracks =
      stream && typeof stream.getVideoTracks === 'function'
        ? stream.getVideoTracks()
        : [];
    const style = window.getComputedStyle(video);
    return {
      present: true,
      live: tracks.some((t) => t.readyState === 'live'),
      display: style.display,
      visibility: style.visibility,
      zIndex: style.zIndex,
      trackCount: tracks.length,
      trackStates: tracks.map((t) => t.readyState),
    };
  }

  function canvasState() {
    const canvas = document.getElementById('camerafeed');
    if (!canvas) {
      return { present: false, visible: false, size: null };
    }
    const style = window.getComputedStyle(canvas);
    return {
      present: true,
      visible:
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        canvas.clientWidth > 0 &&
        canvas.clientHeight > 0,
      display: style.display,
      visibility: style.visibility,
      zIndex: style.zIndex,
      size: {
        w: canvas.width,
        h: canvas.height,
        cw: canvas.clientWidth,
        ch: canvas.clientHeight,
      },
    };
  }

  function overlayState() {
    const layer = document.getElementById('camera-start-layer');
    const style = layer ? window.getComputedStyle(layer) : null;
    return {
      startLayerHidden: layer?.classList.contains('hidden') ?? true,
      startLayerDisplay: style?.display ?? null,
      awaitingStart: !!window.FplacesCameraStart?.isAwaiting?.(),
      bodyClasses: Array.from(document.body.classList),
    };
  }

  function rendererState() {
    const meta = window.__fplacesXrRendererMeta || null;
    let xrRenderer = null;
    try {
      xrRenderer = window.XR8?.Threejs?.xrScene?.()?.renderer ?? null;
    } catch (_) {}
    return {
      meta,
      hasRenderer: !!xrRenderer,
      autoClear: xrRenderer?.autoClear ?? meta?.autoClear ?? null,
      clearAlpha:
        typeof xrRenderer?.getClearAlpha === 'function'
          ? xrRenderer.getClearAlpha()
          : meta?.clearAlpha ?? null,
    };
  }

  function routeState() {
    const route = window.fplacesActiveRoute || window.__fplacesNavigator?.route;
    const path = route?.pathCoordinates || [];
    const scene = window.__fplacesXrScene;
    return {
      hasRoute: path.length > 0,
      pathPoints: path.length,
      anchorCalibrated: !!window.FplacesAnchorEngine?.isCalibrated,
      worldRouteAttached: !!window.FplacesWorldRoute?.isAttached?.(),
      ribbonOnScene: scene
        ? !!window.FplacesPathGeometry?.hasRibbon?.(scene)
        : false,
    };
  }

  function wantsSlam() {
    const cfg = window.FPLACES_AR_CONFIG || {};
    if (cfg.xrMode === 'fallback') return false;
    if (window.__fplacesSlamRequested) return true;
    return cfg.xrMode !== 'fallback' && !!window.isSecureContext;
  }

  function slamActiveFromFlags(flags) {
    return (
      !flags.fallbackTriggered &&
      flags.xrSessionActive &&
      flags.xrScene &&
      !!window.__fplacesXrCamera &&
      flags.cameraStarted &&
      (flags.slamHeadingActive || flags.slamPoseActive)
    );
  }

  function snapshot() {
    const cfg = window.FPLACES_AR_CONFIG || {};
    const video = videoState();
    const canvas = canvasState();
    const slamRequested = wantsSlam();
    const flags = {
      fallbackTriggered: !!window.__fplacesFallbackTriggered,
      xrSessionActive: !!window.__fplacesXrSessionActive,
      xrScene: !!window.__fplacesXrScene,
      cameraStarted: !!window.FplacesCameraStart?.isStarted?.(),
      slamHeadingActive: !!window.FplacesSlamHeading?.isActive?.(),
      slamPoseActive: !!window.FplacesSlamPose?.isActive?.(),
    };
    const slamActive = slamActiveFromFlags(flags);
    return {
      buildId: cfg.buildId || 'unknown',
      xrModeConfig: cfg.xrMode,
      expectSlam: !!window.__fplacesExpectSlam,
      slamRequested,
      slamDegraded:
        slamRequested &&
        !slamActive &&
        (!!window.__fplacesXrAttempted || window.__fplacesArMode === 'compass'),
      lastCameraFallbackReason: window.__fplacesLastCameraFallbackReason || null,
      arMode: window.__fplacesArMode || null,
      fallbackTriggered: flags.fallbackTriggered,
      fallbackReason: window.__fplacesFallbackReason || null,
      embeddedInPwa: window.parent !== window,
      isSecureContext: window.isSecureContext,
      locationProtocol: window.location.protocol,
      hasTHREE: !!window.THREE,
      hasXR8: !!window.XR8,
      hasXRExtras: !!window.XRExtras,
      xrPipelineReady: !!window.__fplacesXrPipelineReady,
      xrRunCalled: !!window.__fplacesXrRunCalled,
      xrAttempted: !!window.__fplacesXrAttempted,
      xrAwaitingOnStart: !!window.__fplacesXrAwaitingOnStart,
      xrSessionActive: !!window.__fplacesXrSessionActive,
      xrScene: !!window.__fplacesXrScene,
      xrCamera: !!window.__fplacesXrCamera,
      cameraStarted: !!window.FplacesCameraStart?.isStarted?.(),
      cameraAwaiting: !!window.FplacesCameraStart?.isAwaiting?.(),
      previewCameraLive: video.live,
      camerafeedVisible: canvas.visible,
      cameraTextureApplied: !!window.__fplacesCameraTextureApplied,
      video,
      canvas,
      overlay: overlayState(),
      renderer: rendererState(),
      route: routeState(),
      slamHeadingActive: flags.slamHeadingActive,
      slamHeadingCalibrated: !!window.FplacesSlamHeading?.isCalibrated?.(),
      slamPoseActive: flags.slamPoseActive,
      useSlamHeading: cfg.useSlamHeading !== false,
      useSlamPoseFusion: cfg.useSlamPoseFusion !== false,
      autoCalibrate: !!cfg.autoCalibrate,
    };
  }

  function isSlamActive() {
    const s = snapshot();
    return slamActiveFromFlags({
      fallbackTriggered: s.fallbackTriggered,
      xrSessionActive: s.xrSessionActive,
      xrScene: s.xrScene,
      cameraStarted: s.cameraStarted,
      slamHeadingActive: s.slamHeadingActive,
      slamPoseActive: s.slamPoseActive,
    });
  }

  function isSlamDegraded() {
    const s = snapshot();
    return !!s.slamDegraded;
  }

  function isCameraVisible() {
    const s = snapshot();
    if (
      s.camerafeedVisible &&
      s.xrSessionActive &&
      (window.__fplacesCameraTextureApplied || s.renderer.hasRenderer)
    ) {
      return true;
    }
    if (s.previewCameraLive && s.video.display !== 'none') return true;
    return false;
  }

  function log(phase, message, detail) {
    const payload = {
      phase,
      message,
      ...(detail && typeof detail === 'object' ? detail : {}),
      status: snapshot(),
    };
    const lower = String(message).toLowerCase();
    if (
      lower.includes('fail') ||
      lower.includes('error') ||
      lower.includes('skip') ||
      lower.includes('fallback') ||
      lower.includes('blocked')
    ) {
      console.warn(PREFIX, message, payload);
      return;
    }
    console.log(PREFIX, message, payload);
  }

  function logCheck(id, pass, message, detail) {
    const row = {
      check: id,
      pass: !!pass,
      message,
      ...(detail && typeof detail === 'object' ? detail : {}),
    };
    if (pass) {
      console.log(HEALTH_PREFIX, `✓ ${id}`, row);
    } else {
      console.warn(HEALTH_PREFIX, `✗ ${id}`, row);
    }
    return row;
  }

  function runHealthCheck(reason) {
    const s = snapshot();
    const wantSlam = wantsSlam();
    const checks = [];
    const cameraChecks = [];
    const slamChecks = [];

    const addCheck = (group, row) => {
      checks.push(row);
      group.push(row);
    };

    addCheck(
      cameraChecks,
      logCheck('secure-context', s.isSecureContext, 'HTTPS / secure context', {
        fix: 'Open via https:// (not http://)',
        protocol: s.locationProtocol,
      }),
    );

    addCheck(
      cameraChecks,
      logCheck(
        'camera-feed-visible',
        isCameraVisible(),
        'User-visible camera feed (preview video or XR canvas)',
        {
          fix:
            'Black screen: check renderer autoClear, canvas z-index, or preview fallback',
          previewLive: s.previewCameraLive,
          camerafeedVisible: s.camerafeedVisible,
          video: s.video,
          canvas: s.canvas,
        },
      ),
    );

    addCheck(
      cameraChecks,
      logCheck(
        'start-overlay',
        s.overlay.startLayerHidden || s.cameraStarted,
        'Start overlay hidden after camera boot',
        {
          fix: 'Tap Start — overlay should hide when camera session starts',
          overlay: s.overlay,
        },
      ),
    );

    addCheck(
      cameraChecks,
      logCheck(
        'route-loaded',
        s.route.hasRoute,
        'Navigation route available',
        {
          fix: 'Generate a route on the map before opening Live View',
          pathPoints: s.route.pathPoints,
        },
      ),
    );

    if (wantSlam) {
      addCheck(
        slamChecks,
        logCheck(
          'xr-scripts',
          s.hasTHREE && s.hasXR8,
          'THREE.js + XR8 loaded',
          {
            fix: 'Check CDN / network — XR8 or THREE failed to load',
            hasTHREE: s.hasTHREE,
            hasXR8: s.hasXR8,
          },
        ),
      );

      addCheck(
        slamChecks,
        logCheck(
          'xr-pipeline',
          s.xrPipelineReady,
          'XR camera pipeline registered',
          {
            fix: 'Wait for pipeline or check XR8.addCameraPipelineModules',
            xrPipelineReady: s.xrPipelineReady,
          },
        ),
      );

      addCheck(
        slamChecks,
        logCheck(
          'xr-session',
          s.xrSessionActive && s.xrScene,
          'XR8 session + scene active',
          {
            fix: 'XR8.run() may not have reached onStart — check force-preview logs',
            xrRunCalled: s.xrRunCalled,
            xrAttempted: s.xrAttempted,
            xrSessionActive: s.xrSessionActive,
            xrScene: s.xrScene,
            lastFallback: s.lastCameraFallbackReason,
          },
        ),
      );

      addCheck(
        slamChecks,
        logCheck(
          'camera-texture',
          !!window.__fplacesCameraTextureApplied || s.previewCameraLive,
          'Live camera texture on THREE scene (or preview video)',
          {
            fix: 'XR canvas black — cameraTexture not bound; check GlTextureRenderer + THREE background',
            cameraTextureApplied: !!window.__fplacesCameraTextureApplied,
            previewLive: s.previewCameraLive,
          },
        ),
      );

      addCheck(
        slamChecks,
        logCheck(
          'xr-renderer-config',
          !!window.__fplacesCameraTextureApplied || s.renderer.autoClear === false,
          window.__fplacesXrSessionActive
            ? 'THREE renderer preserving GlTextureRenderer feed (autoClear=false)'
            : 'THREE renderer not configured yet',
          {
            fix: 'XR canvas black: GlTextureRenderer must draw first; THREE autoClearColor must be false',
            renderer: s.renderer,
          },
        ),
      );

      addCheck(
        slamChecks,
        logCheck('slam-modules', isSlamActive(), 'SLAM modules active', {
          fix: 'SlamHeading/Pose not attached — check xr-onStart path',
          slamHeadingActive: s.slamHeadingActive,
          slamPoseActive: s.slamPoseActive,
          slamActive: isSlamActive(),
        }),
      );

      addCheck(
        slamChecks,
        logCheck(
          'floor-calibrated',
          s.route.anchorCalibrated,
          'Floor anchor calibrated',
          {
            fix: 'Point camera at floor or wait for autoCalibrate',
            anchorCalibrated: s.route.anchorCalibrated,
            ribbonOnScene: s.route.ribbonOnScene,
          },
        ),
      );

      addCheck(
        slamChecks,
        logCheck(
          'floor-ribbon',
          s.route.ribbonOnScene,
          'Teal path ribbon on XR scene',
          {
            fix: 'Calibration ran but ribbon missing — check PathGeometry / WorldRoute',
            worldRouteAttached: s.route.worldRouteAttached,
          },
        ),
      );
    }

    const cameraPassed = cameraChecks.filter((c) => c.pass).length;
    const slamPassed = slamChecks.filter((c) => c.pass).length;
    const failed = checks.filter((c) => !c.pass);
    const summary = {
      reason: reason || 'manual',
      cameraOk: cameraPassed === cameraChecks.length,
      slamOk: !wantSlam || slamPassed === slamChecks.length,
      cameraPassed,
      cameraTotal: cameraChecks.length,
      slamPassed,
      slamTotal: slamChecks.length,
      passed: checks.filter((c) => c.pass).length,
      total: checks.length,
      slamActive: isSlamActive(),
      slamDegraded: isSlamDegraded(),
      cameraVisible: isCameraVisible(),
      wantSlam,
      lastCameraFallbackReason: s.lastCameraFallbackReason,
      failedChecks: failed.map((c) => c.check),
      status: s,
    };

    if (summary.cameraOk && summary.slamOk) {
      console.log(
        HEALTH_PREFIX,
        `SUMMARY — CAMERA OK + SLAM OK (${summary.passed}/${summary.total})`,
        summary,
      );
    } else if (summary.cameraOk && wantSlam && !summary.slamOk) {
      console.warn(
        HEALTH_PREFIX,
        `SUMMARY — CAMERA OK but SLAM DEGRADED (${slamPassed}/${slamChecks.length} slam checks)`,
        summary,
      );
    } else if (summary.cameraOk) {
      console.log(
        HEALTH_PREFIX,
        `SUMMARY — CAMERA OK compass mode (${summary.passed}/${summary.total})`,
        summary,
      );
    } else {
      console.warn(
        HEALTH_PREFIX,
        `SUMMARY — ${summary.passed}/${summary.total} passed; needs fix:`,
        failed.map((c) => c.check).join(', '),
        summary,
      );
    }

    return summary;
  }

  function audit(reason) {
    const active = isSlamActive();
    const body = {
      reason: reason || 'manual',
      slamActive: active,
      cameraVisible: isCameraVisible(),
      ...snapshot(),
    };
    if (active && isCameraVisible()) {
      console.log(PREFIX, 'AUDIT — AR ready (SLAM + camera)', body);
    } else if (active) {
      console.warn(PREFIX, 'AUDIT — SLAM active but camera NOT visible', body);
    } else {
      console.warn(PREFIX, 'AUDIT — SLAM is NOT active', body);
    }
    return body;
  }

  function scheduleAudits() {
    [3000, 8000, 15000, 25000].forEach((ms) => {
      window.setTimeout(() => {
        runHealthCheck(`scheduled-t+${ms}ms`);
      }, ms);
    });
  }

  function sampleVideoBrightness(video) {
    if (!video) {
      return { brightness: null, error: 'no video element' };
    }
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      return {
        brightness: null,
        error: 'video frame size is 0',
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        paused: video.paused,
        readyState: video.readyState,
      };
    }
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 8;
      canvas.height = 8;
      const ctx = canvas.getContext('2d');
      if (!ctx) return { brightness: null, error: 'no 2d context' };
      ctx.drawImage(video, 0, 0, 8, 8);
      const data = ctx.getImageData(4, 4, 1, 1).data;
      const pixel = { r: data[0], g: data[1], b: data[2], a: data[3] };
      const brightness = (data[0] + data[1] + data[2]) / 3;
      return {
        brightness,
        pixel,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        paused: video.paused,
      };
    } catch (error) {
      return { brightness: null, error: String(error) };
    }
  }

  function debugArCamera() {
    const DBG = '[fplaces CAMERA DEBUG]';
    const issues = [];
    const tips = [];

    function styleOf(el) {
      if (!el) return null;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        className: el.className || null,
        display: cs.display,
        visibility: cs.visibility,
        opacity: cs.opacity,
        zIndex: cs.zIndex,
        pointerEvents: cs.pointerEvents,
        hiddenClass: el.classList.contains('hidden'),
        rect: { w: Math.round(r.width), h: Math.round(r.height) },
        canvasSize:
          el.tagName === 'CANVAS'
            ? { w: el.width, h: el.height, cw: el.clientWidth, ch: el.clientHeight }
            : undefined,
        videoTracks:
          el.tagName === 'VIDEO' && el.srcObject?.getVideoTracks
            ? el.srcObject.getVideoTracks().map((t) => ({
                readyState: t.readyState,
                label: t.label,
              }))
            : undefined,
        videoWidth: el.tagName === 'VIDEO' ? el.videoWidth : undefined,
        videoHeight: el.tagName === 'VIDEO' ? el.videoHeight : undefined,
        paused: el.tagName === 'VIDEO' ? el.paused : undefined,
        readyState: el.tagName === 'VIDEO' ? el.readyState : undefined,
      };
    }

    const video = document.getElementById('camera');
    const feed = document.getElementById('camerafeed');
    const startLayer = document.getElementById('camera-start-layer');
    const scanOverlay = document.getElementById('scan-overlay');
    const hud = document.getElementById('hud');

    const cx = Math.floor(window.innerWidth / 2);
    const cy = Math.floor(window.innerHeight / 2);
    const topAtCenter = document.elementFromPoint(cx, cy);

    let pixelSample = null;
    let pixelBrightness = null;
    if (feed) {
      try {
        const xr = window.XR8?.Threejs?.xrScene?.();
        const gl =
          xr?.renderer?.getContext?.() ||
          feed.getContext('webgl2', { preserveDrawingBuffer: true }) ||
          feed.getContext('webgl', { preserveDrawingBuffer: true });
        if (gl && feed.width > 0 && feed.height > 0) {
          const px = new Uint8Array(4);
          gl.readPixels(
            Math.floor(feed.width / 2),
            Math.floor(feed.height / 2),
            1,
            1,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            px,
          );
          pixelSample = { r: px[0], g: px[1], b: px[2], a: px[3] };
          pixelBrightness = (px[0] + px[1] + px[2]) / 3;
        } else if (feed.width === 0 || feed.height === 0) {
          pixelSample = { error: 'canvas buffer size is 0', clientW: feed.clientWidth, clientH: feed.clientHeight };
        } else {
          pixelSample = { error: 'cannot get WebGL context (XR8 owns it)' };
        }
      } catch (error) {
        pixelSample = { error: String(error) };
      }
    }

    let xrInfo = null;
    try {
      const xr = window.XR8?.Threejs?.xrScene?.();
      xrInfo = {
        hasScene: !!xr?.scene,
        hasCamera: !!xr?.camera,
        hasRenderer: !!xr?.renderer,
        hasCameraTexture: !!xr?.cameraTexture,
        rendererCanvasId: xr?.renderer?.domElement?.id || null,
        rendererSameAsFeed: xr?.renderer?.domElement === feed,
        rendererAutoClear: xr?.renderer?.autoClear ?? null,
        rendererAutoClearColor: xr?.renderer?.autoClearColor ?? null,
        customThreePipeline: !!window.__fplacesThreePipeline,
        useCameraTextureBg: !!window.__fplacesUseCameraTextureBg,
        slamVideoDisplay: !!window.__fplacesSlamVideoDisplay,
        keepPreviewDuringSlam: !!window.__fplacesKeepPreviewDuringSlam,
        desktopDevMode: !!window.__fplacesDesktopDevMode,
        desktopSlamMode: !!window.__fplacesDesktopSlamMode,
      };
    } catch (error) {
      xrInfo = { error: String(error) };
    }

    const previewLive =
      !!video?.srcObject?.getVideoTracks?.().some((t) => t.readyState === 'live');
    const compassMode =
      document.body.classList.contains('lv-compass-camera') ||
      window.__fplacesArMode === 'compass';
    const videoSample = previewLive && video ? sampleVideoBrightness(video) : null;
    const videoBrightness = videoSample?.brightness ?? null;
    const startBlocking =
      startLayer &&
      !startLayer.classList.contains('hidden') &&
      getComputedStyle(startLayer).display !== 'none';
    const scanBlocking =
      scanOverlay &&
      !scanOverlay.classList.contains('hidden') &&
      getComputedStyle(scanOverlay).display !== 'none';

    if (startBlocking) {
      issues.push('Start overlay is still visible — tap Start Live View');
      tips.push('Tap the Start button to grant camera access');
    }
    if (scanBlocking) {
      issues.push('Scan overlay is covering the screen');
    }
    if (!previewLive && !window.__fplacesXrSessionActive) {
      issues.push('No camera session — neither preview video nor XR session active');
      tips.push('Tap Start and allow camera permission in the browser');
    }
    if (window.__fplacesXrSessionActive && video && getComputedStyle(video).display === 'none' && !previewLive) {
      if (!window.__fplacesCameraTextureApplied && !xrInfo?.hasCameraTexture) {
        issues.push('XR is running but cameraTexture is NOT bound — canvas likely black');
        tips.push('SLAM works internally but feed not drawn; v8+ should bind cameraTexture');
      }
    }
    if (!compassMode && feed && getComputedStyle(feed).visibility === 'hidden') {
      issues.push('#camerafeed is visibility:hidden');
    }
    if (!compassMode && feed && getComputedStyle(feed).display === 'none') {
      issues.push('#camerafeed is display:none');
    }
    if (pixelBrightness != null && pixelBrightness < 25) {
      issues.push(`Canvas center is BLACK (brightness ${Math.round(pixelBrightness)}/255) — SLAM feed may not be rendering`);
      if (window.__fplacesDesktopSlamMode) {
        tips.push('v18 desktop: single XR8 camera + cameraTexture bg — Mac canvas often dark; test on iPhone');
      } else {
        tips.push('v18 mobile: GlTexture + clearDepth patch; never open second camera during SLAM');
      }
    }
    if (topAtCenter && !['canvas', 'video'].includes(topAtCenter.tagName.toLowerCase())) {
      const topId = topAtCenter.id || topAtCenter.className?.slice?.(0, 40);
      if (startBlocking || scanBlocking || topAtCenter.closest('#hud')) {
        issues.push(`Center of screen shows "${topAtCenter.tagName}#${topId}" not camera canvas`);
      }
    }
    if (previewLive && video && getComputedStyle(video).display === 'none') {
      issues.push('Preview camera is LIVE but video element is hidden');
      tips.push('Bug: video has stream but display:none');
    }
    if (previewLive && video && video.paused) {
      issues.push('Preview stream attached but #camera is paused');
      tips.push('Call video.play() after attachCamera');
    }
    if (previewLive && video && video.videoWidth === 0) {
      issues.push('Preview stream live but video has no frame dimensions yet');
    }
    if (
      previewLive &&
      videoBrightness != null &&
      videoBrightness < 25 &&
      window.__fplacesXrSessionActive
    ) {
      issues.push(
        `Preview video frames are BLACK (brightness ${Math.round(videoBrightness)}/255) — ghost stream while XR8 owns the camera`,
      );
      tips.push(
        'v18: preview stream should be stopped before XR8.run — hard refresh Live View and retry',
      );
    } else if (previewLive && videoBrightness != null && videoBrightness < 25) {
      issues.push(
        `Preview video frames are BLACK (brightness ${Math.round(videoBrightness)}/255)`,
      );
      tips.push('Camera track is live but not rendering — try hard refresh or re-tap Start');
    }
    if (!previewLive && !window.__fplacesXrSessionActive && !startBlocking) {
      issues.push('Camera not started after overlay hidden');
    }

    let verdict;
    if (
      window.__fplacesKeepPreviewDuringSlam &&
      previewLive &&
      video &&
      getComputedStyle(video).display !== 'none' &&
      videoBrightness != null &&
      videoBrightness >= 25
    ) {
      verdict =
        'OK — desktop dev mode: webcam preview visible (SLAM tracks on XR canvas underneath)';
    } else if (previewLive && video && getComputedStyle(video).display !== 'none') {
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        verdict = 'PROBLEM — preview stream live but video has no frame size yet';
      } else if (video.paused) {
        verdict = 'PROBLEM — preview stream attached but #camera is paused';
      } else if (videoBrightness != null && videoBrightness < 25) {
        verdict = 'PROBLEM — preview stream live but video frames are BLACK (this is why you see a dark screen)';
      } else if (videoBrightness != null) {
        verdict = 'OK — preview camera has live frame data';
      } else {
        verdict = 'MAYBE — preview stream live; could not sample video pixels (check layers.video)';
      }
    } else if (
      window.__fplacesDesktopSlamMode &&
      window.__fplacesXrSessionActive &&
      isSlamActive() &&
      pixelBrightness != null &&
      pixelBrightness < 25
    ) {
      verdict =
        'DESKTOP DEV — SLAM tracking works but XR canvas feed is dark; use an iPhone for real camera QA';
    } else if (pixelBrightness != null && pixelBrightness < 25 && window.__fplacesXrSessionActive) {
      verdict = 'PROBLEM — XR/SLAM running but canvas is BLACK (this is why you see a dark screen)';
    } else if (window.__fplacesXrSessionActive && pixelBrightness != null && pixelBrightness >= 25) {
      verdict = 'OK — XR canvas has live image data';
    } else if (window.__fplacesXrSessionActive) {
      verdict = 'PROBLEM — XR/SLAM running but camera feed not rendering (black canvas)';
    } else if (startBlocking) {
      verdict = 'WAITING — tap Start to open camera';
    } else if (previewLive) {
      verdict = 'PROBLEM — camera stream live but video hidden; check CSS';
    } else {
      verdict = 'PROBLEM — no active camera feed';
    }

    const report = {
      verdict,
      issues,
      tips,
      buildId: window.FPLACES_AR_CONFIG?.buildId || 'unknown',
      centerElement: topAtCenter
        ? { tag: topAtCenter.tagName, id: topAtCenter.id, class: topAtCenter.className }
        : null,
      layers: {
        video: styleOf(video),
        camerafeed: styleOf(feed),
        startLayer: styleOf(startLayer),
        scanOverlay: styleOf(scanOverlay),
        hud: styleOf(hud),
      },
      streams: {
        previewLive,
        xrSessionActive: !!window.__fplacesXrSessionActive,
        cameraTextureApplied: !!window.__fplacesCameraTextureApplied,
        arMode: window.__fplacesArMode || null,
        slamVideoDisplay: !!window.__fplacesSlamVideoDisplay,
        lastFallback: window.__fplacesLastCameraFallbackReason || null,
        useCameraTextureBg: !!window.__fplacesUseCameraTextureBg,
      },
      xr: xrInfo,
      pixelSample,
      pixelBrightness,
      videoSample,
      videoBrightness,
      snapshot: snapshot(),
    };

    console.group(DBG);
    console.warn('VERDICT:', verdict);
    if (issues.length) console.warn('ISSUES:', issues);
    if (tips.length) console.log('TIPS:', tips);
    console.log('Full report (copy this):', report);
    console.groupEnd();

    return report;
  }

  window.FplacesSlamDiagnostics = {
    log,
    audit,
    snapshot,
    isSlamActive,
    isCameraVisible,
    wantsSlam,
    isSlamDegraded,
    logCheck,
    runHealthCheck,
    scheduleAudits,
    debugArCamera,
  };

  const cfg = window.FPLACES_AR_CONFIG || {};
  log('config', 'AR config resolved', {
    buildId: cfg.buildId || 'unknown',
    xrMode: cfg.xrMode,
    isSecureContext: window.isSecureContext,
    href: window.location.href,
    autoCalibrate: cfg.autoCalibrate,
  });

  window.logSlamStatus = () => audit('manual-console');
  window.logArHealth = () => runHealthCheck('manual-console');
  window.debugArCamera = debugArCamera;
})();
