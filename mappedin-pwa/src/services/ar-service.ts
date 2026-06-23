import { appConfig } from '../config';
import type { RouteCoordinate } from '../types';
import { encodeRouteForAr, toArPayload } from '../utils/route-helpers';
import type { RoutePayload } from '../types';

export function buildArUrl(
  route: RoutePayload,
  currentLegIndex: number,
  instructions: string,
  userPosition?: RouteCoordinate | null,
): string {
  const base = appConfig.arUrl.replace(/\/?$/, '/');
  const payload = toArPayload(route, currentLegIndex, instructions, userPosition);
  return `${base}${encodeRouteForAr(payload)}`;
}

export function openArFullscreen(url: string): HTMLIFrameElement {
  const frame = document.querySelector('#ar-frame') as HTMLIFrameElement;
  frame.hidden = false;
  frame.src = url;
  return frame;
}

export function closeArFullscreen(): void {
  const frame = document.querySelector('#ar-frame') as HTMLIFrameElement;
  frame.hidden = true;
  frame.src = 'about:blank';
}
