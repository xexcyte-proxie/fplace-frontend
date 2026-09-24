/**
 * Back, map, end-navigation, and bottom-sheet chrome (postMessage → parent PWA).
 */
(function () {
  function parentOrigin() {
    const cfg = window.FPLACES_AR_CONFIG || {};
    return cfg.pwaOrigin || window.location.origin;
  }

  function postToParent(type) {
    try {
      window.parent?.postMessage?.({ type }, parentOrigin());
    } catch {
      /* ignore */
    }
  }

  function setChromeVisible(visible) {
    const chrome = document.getElementById('lv-chrome');
    if (!chrome) return;
    chrome.classList.toggle('hidden', !visible);
  }

  function applyPresentation(mode) {
    const minimized = mode === 'minimized';
    document.body.classList.toggle('lv-minimized', minimized);
    setChromeVisible(mode === 'fullscreen');
  }

  function tripFooter() {
    return document.getElementById('trip-footer');
  }

  function sheetToggle() {
    return document.getElementById('lv-sheet-toggle');
  }

  function isSheetCollapsed() {
    return tripFooter()?.classList.contains('lv-bottom--collapsed') ?? false;
  }

  function setSheetCollapsed(collapsed) {
    const footer = tripFooter();
    const toggle = sheetToggle();
    if (!footer) return;

    footer.classList.toggle('lv-bottom--collapsed', collapsed);
    if (toggle) {
      toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      toggle.setAttribute('aria-label', collapsed ? 'Expand trip details' : 'Collapse trip details');
    }
  }

  function toggleSheet() {
    setSheetCollapsed(!isSheetCollapsed());
  }

  function bindBottomSheet() {
    const footer = tripFooter();
    const toggle = sheetToggle();
    const destRow = footer?.querySelector('.lv-dest-row');
    const sheet = footer?.querySelector('.lv-bottom-sheet');
    if (!footer || !toggle || toggle.dataset.bound) return;
    toggle.dataset.bound = '1';

    toggle.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleSheet();
    });

    destRow?.addEventListener('click', () => {
      if (isSheetCollapsed()) toggleSheet();
    });

    if (!sheet) return;

    let touchStartY = null;
    sheet.addEventListener(
      'touchstart',
      (event) => {
        touchStartY = event.touches[0]?.clientY ?? null;
      },
      { passive: true },
    );

    sheet.addEventListener(
      'touchend',
      (event) => {
        if (touchStartY == null) return;
        const endY = event.changedTouches[0]?.clientY;
        if (endY == null) return;
        const delta = endY - touchStartY;
        touchStartY = null;
        if (delta > 48) setSheetCollapsed(true);
        else if (delta < -48) setSheetCollapsed(false);
      },
      { passive: true },
    );
  }

  document.getElementById('lv-back-btn')?.addEventListener('click', () => {
    postToParent('fplaces_ar_back');
  });

  document.getElementById('lv-map-btn')?.addEventListener('click', () => {
    postToParent('fplaces_ar_minimize');
  });

  document.getElementById('lv-end-nav-btn')?.addEventListener('click', () => {
    postToParent('fplaces_ar_back');
  });

  document.getElementById('arrival-ok-btn')?.addEventListener('click', () => {
    postToParent('fplaces_ar_arrived_done');
  });

  window.addEventListener('message', (event) => {
    if (event.origin !== parentOrigin()) return;
    const data = event.data;
    if (!data || data.type !== 'fplaces_presentation') return;
    applyPresentation(data.mode);
  });

  bindBottomSheet();
  applyPresentation('fullscreen');
  postToParent('fplaces_ar_ready');

  window.FplacesLvChrome = {
    setSheetCollapsed,
    toggleSheet,
    isSheetCollapsed,
  };
})();
