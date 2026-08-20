/**
 * Fallback: camera + orientation compass + minimap.
 */
(function () {
  function isMobileHandset() {
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '');
  }

  function videoConstraints() {
    if (isMobileHandset()) {
      return { video: { facingMode: { ideal: 'environment' } }, audio: false };
    }
    return {
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    };
  }

  function releaseVideoStream(video) {
    if (!video?.srcObject) return;
    const stream = video.srcObject;
    if (stream && typeof stream.getTracks === 'function') {
      stream.getTracks().forEach((track) => track.stop());
    }
    video.srcObject = null;
  }

  function hideXrFeed() {
    if (window.__fplacesXrSessionActive) return;
    const feed = document.getElementById('camerafeed');
    if (!feed) return;
    feed.width = 0;
    feed.height = 0;
    feed.style.display = 'none';
    feed.style.visibility = 'hidden';
    feed.style.opacity = '0';
    feed.style.pointerEvents = 'none';
    feed.style.zIndex = '0';
  }

  function showPreviewVideo() {
    hideXrFeed();
    document.body.classList.remove('lv-slam-active');
    document.body.classList.add('lv-compass-camera');

    const video = document.getElementById('camera');
    if (!video) return;

    video.style.display = 'block';
    video.style.visibility = 'visible';
    video.style.opacity = '1';
    video.style.zIndex = '1';
    video.style.pointerEvents = 'none';
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');

    video.play().catch((playError) => {
      window.FplacesArDebug?.warn('Fallback', 'video.play() rejected in showPreviewVideo', {
        error: String(playError),
      });
    });
  }

  function waitForVideoFrames(video, timeoutMs) {
    const limit = timeoutMs ?? 3000;
    return new Promise((resolve) => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        resolve(true);
        return;
      }
      let settled = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        video.removeEventListener('loadedmetadata', onReady);
        video.removeEventListener('loadeddata', onReady);
        video.removeEventListener('playing', onReady);
        resolve(!!ok);
      };
      const onReady = () => finish(video.videoWidth > 0 && video.videoHeight > 0);
      video.addEventListener('loadedmetadata', onReady);
      video.addEventListener('loadeddata', onReady);
      video.addEventListener('playing', onReady);
      window.setTimeout(() => finish(video.videoWidth > 0 && video.videoHeight > 0), limit);
    });
  }

  async function attachCamera(options) {
    const preserveSlamCanvas = !!(options && options.preserveSlamCanvas);
    const video = document.getElementById('camera');
    if (!video) throw new Error('Camera element missing');

    if (!window.navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera API unavailable - use HTTPS on a phone browser');
    }

    releaseVideoStream(video);
    if (!preserveSlamCanvas) {
      hideXrFeed();
    }

    const stream = await window.navigator.mediaDevices.getUserMedia(videoConstraints());

    video.srcObject = stream;
    if (!preserveSlamCanvas) {
      showPreviewVideo();
    } else {
      document.body.classList.add('lv-slam-preview-visible');
      video.style.display = 'block';
      video.style.visibility = 'visible';
      video.style.opacity = '1';
      video.style.zIndex = '1';
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
    }
    await waitForVideoFrames(video);

    try {
      await video.play();
    } catch (playError) {
      window.FplacesArDebug?.warn('Fallback', 'video.play() rejected', {
        error: String(playError),
      });
    }

    window.FplacesArDebug?.log('Fallback', 'Camera stream attached', {
      tracks: stream.getVideoTracks().length,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      paused: video.paused,
      preserveSlamCanvas,
    });
    return stream;
  }

  async function attachCameraLegacy() {
    return attachCamera();
  }

  window.FplacesFallbackNav = {
    attachCamera: attachCameraLegacy,
    attachCameraWithOptions: attachCamera,
    isMobileHandset,
    showPreviewVideo,
    hideXrFeed,

    start({ navigator }) {
      window.FplacesArDebug?.log('Fallback', 'Starting fallback navigation mode');

      window.FplacesOrientationCompass?.start?.();
      window.FplacesOrientationCompass?.attachNavigator?.(navigator);

      const hud = {
        update(state) {
          window.FplacesLiveViewHud?.update(state, navigator);
        },
      };

      navigator.onUpdate = (s) => hud.update(s);

      const cfg = window.FPLACES_AR_CONFIG || {};
      if (cfg.useGpsProgress !== false && !cfg.preferVenuePositioning) {
        navigator.startGps();
      }
      navigator.notify();

      window.FplacesRouteBridge.sendToFlutter({ event: 'trackingGood' });
      return hud;
    },
  };
})();
