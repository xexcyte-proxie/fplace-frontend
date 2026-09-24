import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(process.cwd(), '..');
const html = readFileSync(resolve(repoRoot, 'ar-nav/index.html'), 'utf8');
const hud = readFileSync(resolve(repoRoot, 'ar-nav/js/live-view-hud.js'), 'utf8');
const icons = readFileSync(resolve(repoRoot, 'ar-nav/js/ui-icons.js'), 'utf8');

describe('AR icon assets', () => {
  it('does not render Material Symbols ligature text', () => {
    expect(html).not.toContain('material-symbols-rounded');
    expect(html).not.toMatch(/>\s*(arrow_back|map|layers|location_on|expand_more|close)\s*</);
    expect(hud).not.toContain('material-symbols-rounded');
  });

  it('ships font-independent icons for every static and route symbol', () => {
    for (const name of [
      'photo_camera', 'arrow_back', 'map', 'layers', 'check_circle',
      'location_on', 'expand_more', 'close', 'arrow_upward', 'straight',
      'chevron_left', 'chevron_right', 'turn_left', 'turn_right',
      'turn_slight_left', 'turn_slight_right', 'u_turn_right', 'u_turn_left',
      'flag',
    ]) {
      expect(icons).toContain(`${name}:`);
    }
    expect(html).toContain('./js/ui-icons.js?v=20260923-inline-icons-v1');
  });
});
