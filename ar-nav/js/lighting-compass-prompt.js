/**
 * Presentation: ask to switch from SLAM to compass when lighting is too weak.
 */
(function () {
  const TITLE = 'Poor lighting here';
  const BODY =
    'This spot is too dark for camera tracking. Compass mode can keep guiding you along the route.';

  function layer() {
    return document.getElementById('lv-lighting-dialog');
  }

  function isOpen() {
    const el = layer();
    return !!el && !el.classList.contains('hidden');
  }

  function setOpen(open) {
    const el = layer();
    if (!el) return;
    el.classList.toggle('hidden', !open);
    el.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  function reasonCopy(reason) {
    if (reason === 'feature-poor') {
      return 'Camera tracking is too weak in this area (low light or little texture). Compass mode can keep guiding you along the route.';
    }
    return BODY;
  }

  function show(reason) {
    const copy = document.getElementById('lv-lighting-dialog-body');
    if (copy) copy.textContent = reasonCopy(reason);
    setOpen(true);
    window.FplacesArDebug?.log('LightingPrompt', 'Showing compass switch dialog', {
      reason,
    });
  }

  function hide() {
    setOpen(false);
  }

  async function switchToCompass(reason) {
    hide();
    const granted =
      (await window.FplacesOrientationCompass?.requestHeadingPermission?.()) !==
      false;
    if (granted) {
      window.FplacesOrientationCompass?.bindHeading?.();
    }
    window.FplacesVisualTrackingMonitor?.markSwitched?.();
    window.__fplacesStartFallback?.(
      reason === 'feature-poor'
        ? 'Weak camera tracking — compass mode'
        : 'Poor lighting — compass mode',
    );
  }

  function bind() {
    const useBtn = document.getElementById('lv-lighting-use-compass');
    const keepBtn = document.getElementById('lv-lighting-keep-ar');
    if (useBtn && !useBtn.dataset.bound) {
      useBtn.dataset.bound = '1';
      useBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        switchToCompass(window.__fplacesLightingPromptReason || 'dark').catch(
          () => {},
        );
      });
    }
    if (keepBtn && !keepBtn.dataset.bound) {
      keepBtn.dataset.bound = '1';
      keepBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        hide();
        window.FplacesVisualTrackingMonitor?.dismiss?.();
      });
    }
  }

  window.FplacesLightingCompassPrompt = {
    show(reason) {
      bind();
      window.__fplacesLightingPromptReason = reason || 'dark';
      show(reason);
    },
    hide,
    isOpen,
    bind,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
