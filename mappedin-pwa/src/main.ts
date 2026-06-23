import { AppStore } from './state/app-store';
import { MapApp } from './services/map-app';
import { UiRoot } from './ui/ui-root';
import './styles.css';

const mapContainer = document.querySelector('#mappedin-map') as HTMLDivElement;
const uiContainer = document.querySelector('#ui-root') as HTMLDivElement;

const store = new AppStore();
const app = new MapApp(store);
const ui = new UiRoot(uiContainer);

store.subscribe((state) => ui.render(state, app));

void app.start(mapContainer);
