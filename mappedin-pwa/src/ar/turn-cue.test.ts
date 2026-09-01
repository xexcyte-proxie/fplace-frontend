import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const turnCue = require('../../../ar-nav/js/turn-cue.js') as {
  SHOW_DEG: number;
  HIDE_DEG: number;
  resolveTurnCue: (
    deltaDeg: number | null | undefined,
    wasVisible?: boolean,
  ) => {
    visible: boolean;
    side: 'left' | 'right' | 'around' | null;
    intensity: number;
    scale: number;
    tiltDeg: number;
    label: string;
    symbol: string;
  };
};

describe('resolveTurnCue', () => {
  it('hides when heading is missing', () => {
    expect(turnCue.resolveTurnCue(null).visible).toBe(false);
    expect(turnCue.resolveTurnCue(undefined).visible).toBe(false);
  });

  it('places a left turn on the left of the screen', () => {
    const cue = turnCue.resolveTurnCue(-48);
    expect(cue.visible).toBe(true);
    expect(cue.side).toBe('left');
    expect(cue.label).toBe('Turn left');
    expect(cue.symbol).toBe('chevron_left');
  });

  it('places a right turn on the right of the screen', () => {
    const cue = turnCue.resolveTurnCue(48);
    expect(cue.visible).toBe(true);
    expect(cue.side).toBe('right');
    expect(cue.label).toBe('Turn right');
    expect(cue.symbol).toBe('chevron_right');
  });

  it('uses a bottom u-turn when facing the opposite way', () => {
    const cue = turnCue.resolveTurnCue(150);
    expect(cue.visible).toBe(true);
    expect(cue.side).toBe('around');
    expect(cue.label).toBe('Turn around');
  });

  it('stays hidden just under the show threshold', () => {
    expect(turnCue.resolveTurnCue(turnCue.SHOW_DEG - 1, false).visible).toBe(
      false,
    );
  });

  it('keeps a shown cue until heading is nearly aligned', () => {
    expect(turnCue.resolveTurnCue(15, true).visible).toBe(true);
    expect(turnCue.resolveTurnCue(turnCue.HIDE_DEG - 1, true).visible).toBe(
      false,
    );
  });

  it('grows intensity as heading error increases', () => {
    const mild = turnCue.resolveTurnCue(-30);
    const hard = turnCue.resolveTurnCue(-88);
    expect(hard.intensity).toBeGreaterThan(mild.intensity);
    expect(hard.scale).toBeGreaterThan(mild.scale);
  });
});
