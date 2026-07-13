/**
 * SLAM camera display: mobile uses GlTexture + clearDepth patch;
 * desktop uses cameraTexture scene.background (single XR8 camera — no dual webcam).
 */
(function () {
  function isDesktopDev() {
    return (
      window.__fplacesDesktopSlamMode === true ||
      !window.FplacesFallbackNav?.isMobileHandset?.()
    );
  }

  function readXrScene() {
    try {
      return window.XR8?.Threejs?.xrScene?.() ?? null;
    } catch (_) {
      return null;
    }
  }

  function restoreSlamCanvas() {
    const feed = document.getElementById('camerafeed');
    if (!feed) return;
    feed.style.display = 'block';
    feed.style.visibility = 'visible';
    feed.style.opacity = '1';
    feed.style.zIndex = '1';
    feed.style.pointerEvents = 'none';
  }

  function prepCameraTexture(texture) {
    if (!texture || !window.THREE) return texture;
    if (window.THREE.SRGBColorSpace) texture.colorSpace = window.THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }

  function applyDesktopCameraBackground(scene, renderer, cameraTexture) {
    if (!scene || !renderer || !cameraTexture) return false;
    prepCameraTexture(cameraTexture);
    scene.background = cameraTexture;
    renderer.autoClear = true;
    if ('autoClearColor' in renderer) renderer.autoClearColor = true;
    window.__fplacesUseCameraTextureBg = true;
    window.__fplacesCameraTextureApplied = true;
    return true;
  }

  function patchMobileRenderer(scene, renderer) {
    if (!renderer || renderer.__fplacesCameraPatch) return !!renderer?.__fplacesCameraPatch;

    if (scene) scene.background = null;

    renderer.autoClear = false;
    if ('autoClearColor' in renderer) renderer.autoClearColor = false;
    if ('autoClearDepth' in renderer) renderer.autoClearDepth = false;
    renderer.setClearColor(0x000000, 0);

    const origRender = renderer.render.bind(renderer);
    renderer.render = function fplacesPatchedRender(renderScene, renderCamera) {
      this.autoClear = false;
      if ('autoClearColor' in this) this.autoClearColor = false;
      this.clearDepth();
      return origRender(renderScene, renderCamera);
    };

    const origClear = renderer.clear.bind(renderer);
    renderer.clear = function fplacesPatchedClear(color, depth, stencil) {
      return origClear(false, depth !== false, stencil === true);
    };

    renderer.__fplacesCameraPatch = true;
    window.FplacesSlamDiagnostics?.logCheck?.(
      'renderer-patch',
      true,
      'Mobile: clearDepth-only THREE render (preserves GlTexture feed)',
      { autoClear: renderer.autoClear },
    );
    return true;
  }

  function sampleFeedBrightness() {
    const feed = document.getElementById('camerafeed');
    if (!feed?.width || !feed?.height) return null;
    try {
      const xr = readXrScene();
      const gl = xr?.renderer?.getContext?.();
      if (!gl) return null;
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
      return (px[0] + px[1] + px[2]) / 3;
    } catch (_) {
      return null;
    }
  }

  function createRendererPatchModule() {
    let desktopLogged = false;

    return {
      name: 'fplaces-renderer-patch',

      onStart() {
        restoreSlamCanvas();
        const xr = readXrScene();
        if (!xr?.renderer) return;
        if (isDesktopDev()) {
          if (xr.cameraTexture) applyDesktopCameraBackground(xr.scene, xr.renderer, xr.cameraTexture);
          if (!desktopLogged) {
            desktopLogged = true;
            window.FplacesSlamDiagnostics?.logCheck?.(
              'desktop-slam-camera',
              true,
              'Desktop: single XR8 camera via scene.background = cameraTexture',
              {},
            );
          }
        } else {
          patchMobileRenderer(xr.scene, xr.renderer);
        }
      },

      onUpdate() {
        restoreSlamCanvas();
        const xr = readXrScene();
        if (!xr?.renderer || !xr?.scene) return;

        if (isDesktopDev()) {
          if (xr.cameraTexture) {
            applyDesktopCameraBackground(xr.scene, xr.renderer, xr.cameraTexture);
          }
          return;
        }

        patchMobileRenderer(xr.scene, xr.renderer);
      },

      onRender() {
        const xr = readXrScene();
        if (!xr?.renderer || isDesktopDev()) return;
        xr.renderer.autoClear = false;
        if ('autoClearColor' in xr.renderer) xr.renderer.autoClearColor = false;
      },
    };
  }

  window.FplacesXrRendererPatch = {
    createModule: createRendererPatchModule,
    readXrScene,
    restoreSlamCanvas,
    sampleFeedBrightness,
    isDesktopDev,
  };
})();
