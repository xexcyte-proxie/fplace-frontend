import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const quality = require('../../../ar-nav/js/visual-tracking-quality.js') as {
  classifyLighting: (
    sample: { luma?: number; contrast?: number } | null,
    thresholds?: Record<string, number>,
  ) => string;
  createLightingTracker: (thresholds?: Record<string, number>) => {
    start: (nowMs: number) => void;
    ingest: (
      sample: { luma?: number; contrast?: number } | null,
      nowMs: number,
    ) => { shouldPrompt: boolean; shouldSwitch: boolean; reason: string | null };
    dismiss: (nowMs: number) => void;
    isLightingOkLocked: (nowMs: number) => boolean;
  };
};

const tight = {
  darkLuma: 22,
  dimLuma: 48,
  lowContrast: 11,
  consecutivePoorMs: 400,
  recoveredOkMs: 200,
  warmupMs: 100,
  dismissCooldownMs: 1000,
  maxDismissalsPerSession: 2,
};

describe('classifyLighting', () => {
  it('labels near-black frames as dark', () => {
    expect(quality.classifyLighting({ luma: 8, contrast: 1 })).toBe('dark');
  });

  it('labels dim low-contrast frames as feature-poor', () => {
    expect(quality.classifyLighting({ luma: 35, contrast: 4 })).toBe(
      'feature-poor',
    );
  });

  it('keeps a normally lit textured scene as ok', () => {
    expect(quality.classifyLighting({ luma: 90, contrast: 28 })).toBe('ok');
  });

  it('ignores missing samples', () => {
    expect(quality.classifyLighting(null)).toBe('unknown');
  });
});

describe('createLightingTracker', () => {
  it('does not prompt during warmup', () => {
    const tracker = quality.createLightingTracker(tight);
    tracker.start(0);
    expect(tracker.ingest({ luma: 6, contrast: 1 }, 50).shouldPrompt).toBe(
      false,
    );
  });

  it('prompts after sustained darkness', () => {
    const tracker = quality.createLightingTracker(tight);
    tracker.start(0);
    expect(tracker.ingest({ luma: 6, contrast: 1 }, 120).shouldPrompt).toBe(
      false,
    );
    const dark = tracker.ingest({ luma: 6, contrast: 1 }, 540);
    expect(dark.shouldPrompt).toBe(true);
    expect(dark.shouldSwitch).toBe(true);
    expect(dark.reason).toBe('dark');
  });

  it('does not switch to compass for dim feature-poor light', () => {
    const tracker = quality.createLightingTracker(tight);
    tracker.start(0);
    tracker.ingest({ luma: 35, contrast: 4 }, 120);
    expect(tracker.ingest({ luma: 35, contrast: 4 }, 540).shouldSwitch).toBe(
      false,
    );
  });

  it('does not prompt for a brief dark flash', () => {
    const tracker = quality.createLightingTracker(tight);
    tracker.start(0);
    tracker.ingest({ luma: 6, contrast: 1 }, 120);
    expect(tracker.ingest({ luma: 90, contrast: 24 }, 200).shouldPrompt).toBe(
      false,
    );
  });

  it('keeps the dark streak when a sample cannot be read', () => {
    const tracker = quality.createLightingTracker(tight);
    tracker.start(0);
    tracker.ingest({ luma: 6, contrast: 1 }, 120);
    tracker.ingest(null, 200);
    expect(tracker.ingest({ luma: 6, contrast: 1 }, 540).shouldPrompt).toBe(
      true,
    );
  });

  it('treats sustained good light as a locked-ok sample', () => {
    const tracker = quality.createLightingTracker(tight);
    tracker.start(0);
    tracker.ingest({ luma: 90, contrast: 24 }, 120);
    expect(tracker.isLightingOkLocked(200)).toBe(false);
    expect(tracker.isLightingOkLocked(400)).toBe(true);
  });
});
