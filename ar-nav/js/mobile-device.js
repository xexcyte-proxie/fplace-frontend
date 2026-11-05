/** Keep direct desktop visits out of camera and motion initialization. */
(function () {
  var device = window.navigator;
  var mobile = (device.userAgentData && device.userAgentData.mobile === true) ||
    /Android|iPhone|iPad|iPod/i.test(device.userAgent) ||
    (/Macintosh/i.test(device.userAgent) && device.maxTouchPoints > 1);
  window.__fplacesArDesktopBlocked = !mobile;
  if (mobile) return;
  document.addEventListener('DOMContentLoaded', function () {
    var screen = document.createElement('main');
    screen.id = 'ar-mobile-required';
    screen.innerHTML = '<span class="ar-mobile-wordmark">fplaces</span><div class="ar-mobile-required-card"><span class="ar-mobile-required-icon" aria-hidden="true">↗</span><h1>Take AR with you.</h1><p>AR navigation is available on mobile. Open fplaces on your phone to explore with your camera.</p><p>You can still use the 2D map on your desktop.</p><a href="/">Back to fplaces</a></div>';
    document.body.appendChild(screen);
    var style = document.createElement('style');
    style.textContent = 'body > :not(#ar-mobile-required){display:none!important}#ar-mobile-required{position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;padding:40px;background:#f7f5ee;color:#234c3f;font-family:system-ui,sans-serif}.ar-mobile-wordmark{font-size:28px;font-weight:700;letter-spacing:-1px}.ar-mobile-required-card{max-width:440px;margin:auto;text-align:center}.ar-mobile-required-icon{display:block;font-size:40px;margin-bottom:24px}#ar-mobile-required h1{font-family:Georgia,serif;font-size:42px;line-height:1.15;margin:0 0 20px}#ar-mobile-required p{font-size:15px;line-height:1.8;color:#647264}#ar-mobile-required a{display:inline-block;margin-top:20px;padding:14px 24px;border-radius:12px;background:#205b50;color:white;text-decoration:none;font-weight:600}#ar-mobile-required a:focus-visible{outline:3px solid #e07a33;outline-offset:4px}';
    document.head.appendChild(style);
  });
})();
