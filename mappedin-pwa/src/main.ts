import { AppStore } from './state/app-store';
import { MapApp } from './services/map-app';
import { UiRoot } from './ui/ui-root';
import { DebugOverlayHUD } from './ui/DebugOverlayHUD';
import { installArDebugRelay, installArMessageBridge, type ArMessageBridgeHost } from './position/bridge';
import { appConfig } from './config';
import './styles.css';

const mapContainer = document.querySelector('#mappedin-map') as HTMLDivElement;
const uiContainer = document.querySelector('#ui-root') as HTMLDivElement;

installArDebugRelay();

if (import.meta.env.DEV) {
  console.warn(
    '[fplaces] App logs go in the BROWSER DevTools console (Cmd+Option+J in Chrome), not the Cursor terminal.',
  );
}

const store = new AppStore();
const app = new MapApp(store);
installArMessageBridge(app);
const ui = new UiRoot(uiContainer);

/** Stable bound surface for the AR iframe — avoids HMR/`this`/`instanceof` breakage. */
(window as Window & { __fplacesMapApp?: ArMessageBridgeHost }).__fplacesMapApp = {
  isArOpen: () => app.isArOpen(),
  startRouteMovement: (options) => app.startRouteMovement(options),
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
