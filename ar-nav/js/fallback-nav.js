/**
 * Fallback: camera + orientation compass + minimap.
 */
(function () {
  window.FplacesFallbackNav = {
    start({ navigator }) {
      window.FplacesArDebug?.log('Fallback', 'Starting fallback navigation mode');
      const video = document.getElementById('camera');

      window.FplacesOrientationCompass?.start?.();
      window.FplacesOrientationCompass?.attachNavigator?.(navigator);

      const hud = {
        update(state) {
          window.FplacesLiveViewHud?.update(state, navigator);
        },
      };

      navigator.onUpdate = (s) => hud.update(s);

      if (video && window.navigator.mediaDevices?.getUserMedia) {
        window.navigator.mediaDevices
          .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
          .then((stream) => {
            video.srcObject = stream;
            video.style.display = 'block';
            window.FplacesArDebug?.log('Fallback', 'Camera stream attached');
            navigator.notify();
          })
          .catch((err) => {
            window.FplacesArDebug?.warn('Fallback', 'Camera blocked', { error: String(err) });
            window.FplacesLiveViewHud?.setStatus(
              'Camera blocked. Allow camera for Live View.',
              true,
            );
          });
      }

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
