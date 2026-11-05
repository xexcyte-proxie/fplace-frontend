import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapApp } from './map-app';

afterEach(() => vi.unstubAllGlobals());

describe('map pointer projection', () => {
  for (const [label, left, top, width, height] of [
    ['desktop sidebar', 248, 0, 1192, 900],
    ['offset map panel', 224, 80, 800, 600],
    ['mobile fullscreen', 0, 0, 390, 844],
  ] as const) {
    it(`projects the clicked point once for ${label}`, () => {
      const rect = { left, top, width, height };
      class Canvas { getBoundingClientRect() { return rect; } }
      vi.stubGlobal('HTMLElement', Canvas);
      const canvas = new Canvas();
      const floor = { id: 'ground' };
      // Match the installed SDK: it subtracts the container offset internally.
      const project = vi.fn((x: number, y: number) => ({
        normalizedX: ((x - left) / width) * 2 - 1,
        normalizedY: -((y - top) / height) * 2 + 1,
      }));
      const app = { mapView: { createCoordinateFromScreenCoordinate: project, currentFloor: floor }, mapContainer: { querySelector: () => canvas } };
      const pointer = { x: left + width / 2, y: top + height / 2 };
      const resolve = (MapApp.prototype as unknown as { resolveTapCoordinateFromPointer: (this: typeof app, point: typeof pointer) => unknown }).resolveTapCoordinateFromPointer;
      expect(resolve.call(app, pointer)).toEqual({ normalizedX: 0, normalizedY: 0 });
      expect(project).toHaveBeenCalledWith(pointer.x, pointer.y, floor);
      expect(resolve.call(app, { x: left - 1, y: top + 10 })).toBeNull();
      expect(project).toHaveBeenCalledTimes(1);
    });
  }
});
