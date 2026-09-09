import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const spawn = require('../../../ar-nav/js/incremental-path-spawn.js') as {
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
  };
};

describe('resolveTrailSpawnWindow', () => {
  it('opens ~0.8 m ahead at the start so the grid lands in the first view', () => {
    const window = spawn.resolveTrailSpawnWindow(0, 24);
    const firstMark = Math.ceil(window.spawnFrom / window.spacing) * window.spacing;

    expect(window.clearTrail).toBe(false);
    expect(window.canSpawn).toBe(true);
    expect(window.spawnFrom).toBeCloseTo(0.8125, 3);
    expect(window.spawnTo).toBe(8);
    expect(firstMark).toBe(4.5);
  });

  it('caps near-field count/scale without emptying the opening stretch', () => {
    const window = spawn.resolveTrailSpawnWindow(0, 24);

    expect(window.spacing).toBe(4.5);
    expect(window.maxVisible).toBe(3);
    expect(window.nearScale).toBe(0.75);
    expect(window.canSpawn).toBe(true);
  });

  it('restores full mid-route density after the near field', () => {
    const window = spawn.resolveTrailSpawnWindow(8, 40);

    expect(window.spacing).toBe(4);
    expect(window.maxVisible).toBe(6);
    expect(window.nearScale).toBe(1);
    expect(window.spawnFrom).toBeCloseTo(8.8125, 3);
    expect(window.spawnTo).toBe(16);
  });

  it('still places a chevron on a short indoor hop', () => {
    const window = spawn.resolveTrailSpawnWindow(0, 5);
    const firstMark = Math.ceil(window.spawnFrom / window.spacing) * window.spacing;

    expect(window.canSpawn).toBe(true);
    expect(window.clearTrail).toBe(false);
    expect(firstMark).toBeLessThanOrEqual(window.spawnTo);
  });

  it('clears the trail only after real progress near the destination', () => {
    expect(spawn.resolveTrailSpawnWindow(0, 1.5).clearTrail).toBe(false);
    expect(spawn.resolveTrailSpawnWindow(18.4, 20).clearTrail).toBe(true);
    expect(spawn.resolveTrailSpawnWindow(18.4, 20).canSpawn).toBe(false);
  });

  it('keeps mid-route spawn just ahead of progress', () => {
    const window = spawn.resolveTrailSpawnWindow(16, 40);
    expect(window.canSpawn).toBe(true);
    expect(window.spawnFrom).toBeCloseTo(16.8125, 3);
    expect(window.spawnTo).toBe(24);
    expect(window.nearScale).toBe(1);
  });
});
