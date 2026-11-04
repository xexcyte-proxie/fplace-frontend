/* Guidance is presentation only: opening it never changes navigation or XR. */
(function () {
  'use strict';
  const dialog = document.getElementById('ar-guidance');
  const info = document.getElementById('ar-guidance-info');
  const dismiss = document.getElementById('ar-guidance-dismiss');
  if (!dialog || !info || !dismiss) return;
  let returnFocus = info;
  function open() {
    if (dialog.open) return;
    returnFocus = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement : info;
    dialog.showModal();
    dismiss.focus({ preventScroll: true });
  }
  info.addEventListener('click', open);
  dismiss.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    if (returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
  });
  window.FplacesArGuidance = { open };
  if (new URLSearchParams(window.location.search).get('preload') !== '1') open();
})();
