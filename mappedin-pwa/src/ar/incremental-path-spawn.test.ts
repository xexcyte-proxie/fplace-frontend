import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const spawn = require('../../../ar-nav/js/incremental-path-spawn.js') as {
  firstGridMark: (fromM: number, spacingM: number) => number;
  resolveTrailSpawnWindow: (
    alongM: number,
    totalLen: number,
    cfg?: Record<string, number>,
  ) => {
    spacing: number;
    revealAheadM: number;
    maxVisible: number;
    nearScale: number;
    remaining: number;
    clearTrail: boolean;
    spawnFrom: number;
    spawnTo: number;
    canSpawn: boolean;
    minSeparationM: number;
  };
  resolveTrailMarks: (
    alongM: number,
    totalLen: number,
    cfg?: Record<string, number>,
  ) => {
    maxVisible: number;
    spacing: number;
    marks: number[];
    candidates: number[];
    clearTrail: boolean;
    canSpawn: boolean;
  };
  occupyTrailSlots: (
    candidates: Array<{ x: number; z: number; alongM?: number }>,
    maxVisible: number,
    minSepM: number,
  ) => Array<{ x: number; z: number; alongM?: number }>;
  resolveTrailAlongM: (
    cameraAlongM: number | null | undefined,
    navigatorAlongM: number | null | undefined,
  ) => number;
};

describe('resolveTrailSpawnWindow', () => {
  it('places up to eight chevrons clearly ahead at the start (in view, not a pile)', () => {
    const window = spawn.resolveTrailSpawnWindow(0, 24);
    const firstMark = spawn.firstGridMark(window.spawnFrom, window.spacing);

    expect(window.clearTrail).toBe(false);
    expect(window.canSpawn).toBe(true);
    expect(window.maxVisible).toBe(8);
    expect(window.spacing).toBe(2);
    expect(window.nearScale).toBe(1);
    expect(window.spawnFrom).toBeCloseTo(2, 3);
    expect(window.spawnTo).toBeCloseTo(16, 3);
    expect(firstMark).toBe(2);
    expect(firstMark).toBeLessThanOrEqual(window.spawnTo);
  });

  it('keeps the eight-slot cap after the opening stretch', () => {
    const window = spawn.resolveTrailSpawnWindow(8, 40);

    expect(window.spacing).toBe(2);
    expect(window.maxVisible).toBe(8);
    expect(window.spawnFrom).toBeCloseTo(8.8, 3);
    expect(window.spawnTo).toBeCloseTo(24, 3);
  });

  it('still places a chevron on a short indoor hop', () => {
    const window = spawn.resolveTrailSpawnWindow(0, 5);
    const firstMark = spawn.firstGridMark(window.spawnFrom, window.spacing);

    expect(window.clearTrail).toBe(false);
    expect(window.canSpawn).toBe(true);
    expect(firstMark).toBeLessThanOrEqual(window.spawnTo);
  });

  it('clears the trail only after real progress near the destination', () => {
    expect(spawn.resolveTrailSpawnWindow(0, 1.5).clearTrail).toBe(false);
    expect(spawn.resolveTrailSpawnWindow(18.4, 20).clearTrail).toBe(true);
    expect(spawn.resolveTrailSpawnWindow(18.4, 20).canSpawn).toBe(false);
  });
});

describe('resolveTrailMarks', () => {
  it('opens with eight spaced marks and no extras in the window', () => {
    const trail = spawn.resolveTrailMarks(0, 24);

    expect(trail.marks).toEqual([2, 4, 6, 8, 10, 12, 14, 16]);
    expect(trail.maxVisible).toBe(8);
    expect(trail.marks.length).toBeLessThanOrEqual(trail.maxVisible);
  });

  it('increments by one grid cell as the user walks (passed mark leaves, next enters)', () => {
    const start = spawn.resolveTrailMarks(0, 40);
    const next = spawn.resolveTrailMarks(3.3, 40);

    expect(start.marks).toEqual([2, 4, 6, 8, 10, 12, 14, 16]);
    expect(next.marks).toEqual([6, 8, 10, 12, 14, 16, 18]);
    expect(next.marks).not.toContain(4);
    expect(next.marks.length).toBe(7);
  });

  it('never returns more marks than the slot cap, even far along the route', () => {
    const mid = spawn.resolveTrailMarks(16, 80);
    expect(mid.maxVisible).toBe(8);
    expect(mid.marks.length).toBeLessThanOrEqual(8);
    expect(mid.marks[0]).toBeGreaterThan(16);
    expect(mid.marks[1]! - mid.marks[0]!).toBe(2);
  });

  it('never refills candidates beyond the visual horizon', () => {
    const trail = spawn.resolveTrailMarks(0, 40);
    expect(trail.candidates).toEqual(trail.marks);
    expect(Math.max(...trail.candidates)).toBeLessThanOrEqual(16);
  });
});

describe('occupyTrailSlots', () => {
  it('cannot keep two chevrons that share the same world spot', () => {
    const stacked = [
      { x: 0, z: 0, alongM: 4 },
      { x: 0.1, z: 0.1, alongM: 4.05 },
      { x: 0.2, z: 0, alongM: 4.1 },
      { x: 8, z: 0, alongM: 8 },
    ];
    const kept = spawn.occupyTrailSlots(stacked, 2, 2.4);

    expect(kept).toHaveLength(2);
    expect(kept[0]).toMatchObject({ alongM: 4 });
    expect(kept[1]).toMatchObject({ alongM: 8 });
  });

  it('never exceeds the slot cap even when many candidates are far apart', () => {
    const row = [0, 4, 8, 12, 16].map((alongM) => ({
      x: alongM,
      z: 0,
      alongM,
    }));
    const kept = spawn.occupyTrailSlots(row, 2, 2.4);
    expect(kept).toHaveLength(2);
    expect(kept.map((p) => p.alongM)).toEqual([0, 4]);
  });

  it('skips a hairpin pile and refills from the next far candidate', () => {
    const hairpin = [
      { x: 0, z: 0, alongM: 8 },
      { x: 0.3, z: 0.2, alongM: 8.2 },
      { x: 0.4, z: 0.1, alongM: 8.4 },
      { x: 6, z: 0, alongM: 12 },
    ];
    const kept = spawn.occupyTrailSlots(hairpin, 2, 2.4);
    expect(kept).toHaveLength(2);
    expect(kept.map((p) => p.alongM)).toEqual([8, 12]);
  });
});

describe('resolveTrailAlongM', () => {
  it('slides with the camera even when map/GPS along is stuck', () => {
    expect(spawn.resolveTrailAlongM(7.2, 0.4)).toBe(7.2);
    expect(spawn.resolveTrailAlongM(0, 12)).toBe(0);
  });

  it('falls back to navigator only when camera along is missing', () => {
    expect(spawn.resolveTrailAlongM(null, 5.5)).toBe(5.5);
    expect(spawn.resolveTrailAlongM(undefined, undefined)).toBe(0);
  });
});


describe('visual density configuration', () => {
  it('honors both legacy caps and spacing fields', () => {
    const trail = spawn.resolveTrailMarks(0, 100, {
      incrementalPathMaxVisible: 8, nearFieldMaxArrows: 3,
      incrementalPathSpacingM: 2, nearFieldSpacingM: 3,
    });
    expect(trail.maxVisible).toBe(3);
    expect(trail.spacing).toBe(3);
    expect(trail.marks).toEqual([3, 6, 9]);
  });
  it('does not force an arrow inside the exclusion on very short routes', () => {
    expect(spawn.resolveTrailMarks(0, 1.5).marks).toEqual([]);
    expect(spawn.resolveTrailMarks(0, 5).marks).toEqual([2, 4]);
  });
  it('keeps retained marks on the same grid under small progress changes', () => {
    const a = spawn.resolveTrailMarks(4.1, 100);
    const b = spawn.resolveTrailMarks(4.2, 100);
    expect(a.marks).toEqual(b.marks);
    expect(a.marks).toHaveLength(8);
  });
  it('accepts the legacy uniform scale when the explicit scale is absent', () => {
    expect(spawn.resolveTrailSpawnWindow(8, 100, { nearFieldArrowScale: .7 }).nearScale).toBe(.7);
    expect(spawn.resolveTrailSpawnWindow(8, 100, { nearFieldArrowScale: .7, trailArrowScale: 1 }).nearScale).toBe(1);
  });
});
