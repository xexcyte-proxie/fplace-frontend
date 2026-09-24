/** Font-independent Live View icons. Material ligature text must never reach UI. */
(function () {
  const paths = {
    photo_camera: '<path d="M8.5 6 10 4h4l1.5 2H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.5Z"/><circle cx="12" cy="13" r="4"/>',
    arrow_back: '<path d="M20 12H5m6-6-6 6 6 6"/>',
    map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 10 9 5 9-5M3 17l9 5 9-5"/>',
    check_circle: '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16.5 8"/>',
    location_on: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    expand_more: '<path d="m6 9 6 6 6-6"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    arrow_upward: '<path d="M12 20V4m-6 6 6-6 6 6"/>',
    straight: '<path d="M12 20V4m-5 5 5-5 5 5"/>',
    chevron_left: '<path d="m15 18-6-6 6-6"/>',
    chevron_right: '<path d="m9 18 6-6-6-6"/>',
    turn_left: '<path d="M19 19v-6a4 4 0 0 0-4-4H6m5-5L6 9l5 5"/>',
    turn_right: '<path d="M5 19v-6a4 4 0 0 1 4-4h9m-5-5 5 5-5 5"/>',
    turn_slight_left: '<path d="M18 20v-5a5 5 0 0 0-5-5H6m5-5-5 5 5 5"/>',
    turn_slight_right: '<path d="M6 20v-5a5 5 0 0 1 5-5h7m-5-5 5 5-5 5"/>',
    u_turn_right: '<path d="M7 20V9a5 5 0 0 1 10 0v7m-4-4 4 4 4-4"/>',
    u_turn_left: '<path d="M17 20V9A5 5 0 0 0 7 9v7m4-4-4 4-4-4"/>',
    flag: '<path d="M5 21V4m0 1h11l-2 4 2 4H5"/>',
  };

  function normalize(name) {
    return Object.prototype.hasOwnProperty.call(paths, name) ? name : 'arrow_upward';
  }

  function svg(name, className) {
    const icon = normalize(name);
    const css = ['lv-icon-svg', className || ''].filter(Boolean).join(' ');
    return `<svg class="${css}" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[icon]}</svg>`;
  }

  function set(element, name, className) {
    if (!element) return;
    element.dataset.lvIcon = normalize(name);
    element.innerHTML = svg(name, className);
  }

  function hydrate(root) {
    (root || document).querySelectorAll('[data-lv-icon]').forEach((element) => {
      set(element, element.dataset.lvIcon, element.dataset.lvIconClass);
    });
  }

  window.FplacesUiIcons = { svg, set, hydrate };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => hydrate(document), { once: true });
  } else {
    hydrate(document);
  }
})();
