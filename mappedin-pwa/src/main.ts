import { registerSW } from 'virtual:pwa-register';
import { AppStore } from './state/app-store';
import { MapApp } from './services/map-app';
import { UiRoot } from './ui/ui-root';
import { DebugOverlayHUD } from './ui/DebugOverlayHUD';
import { installArConsoleHelpers, installArDebugRelay, installArMessageBridge, type ArMessageBridgeHost } from './position/bridge';
import { installArPipShell } from './position/ar-pip-shell';
import { appConfig } from './config';
import './styles.css';
import './styles/social-map-markers.css';
import './styles/profile-screen.css';
import './styles/settings-screen.css';
import './styles/legal-webview-sheet.css';
import './styles/venue-feed.css';
import './styles/notifications-screen.css';
import './styles/ar-navigation-screen.css';

// Check for a new deploy immediately + periodically; autoUpdate reloads when SW changes.
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    const checkForUpdate = () => {
      void registration.update();
    };
    // Re-check when the tab becomes visible again (common after a deploy).
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    });
    window.setInterval(checkForUpdate, 60_000);
  },
});

const mapContainer = document.querySelector('#mappedin-map') as HTMLDivElement;
const uiContainer = document.querySelector('#ui-root') as HTMLDivElement;

installArConsoleHelpers();
installArDebugRelay();

if (import.meta.env.DEV) {
  console.warn(
    '[fplaces] App logs go in the BROWSER DevTools console (Cmd+Option+J in Chrome), not the Cursor terminal.',
  );
}

const store = new AppStore();
const app = new MapApp(store);
installArMessageBridge(app);
installArPipShell({
  maximizeAr: () => app.maximizeAr(),
  closeAr: () => app.closeAr(),
});
const ui = new UiRoot(uiContainer);

/** Stable bound surface for the AR iframe — avoids HMR/`this`/`instanceof` breakage. */
(window as Window & { __fplacesMapApp?: ArMessageBridgeHost }).__fplacesMapApp = {
  isArOpen: () => app.isArOpen(),
  startRouteMovement: (options) => app.startRouteMovement(options),
  closeAr: () => app.closeAr(),
  minimizeAr: () => app.minimizeAr(),
  maximizeAr: () => app.maximizeAr(),
};

if (appConfig.debug.positionHud) {
  const debugHud = new DebugOverlayHUD();
  debugHud.start();
}

store.subscribe((state) => {
  document.getElementById('splash-static')?.remove();
  ui.render(state, app);
});

void app.start(mapContainer);
