import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderArrivalDialog } from './arrival-dialog';
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
describe('2D and AR arrival appearance parity', () => {
  it('uses one stylesheet and identical card classes and SVG geometry in both renderers', () => {
    const ar = read('../../../ar-nav/index.html').split('<div class="arrival-dialog"')[1].split('<div id="trip-footer"')[0];
    const map = renderArrivalDialog('Gate A').split('<div class="arrival-dialog"')[1];
    const classes = (html: string) => [...html.matchAll(/class="([^"]+)"/g)].map(m => m[1]);
    const paths = (html: string) => [...html.matchAll(/<svg[\s\S]*?<\/svg>/g)].map(m => m[0].replace(/\s+/g, ' '));
    expect(classes(ar)).toEqual(classes(map)); expect(paths(ar)).toEqual(paths(map));
    expect(read('../main.ts')).toContain("import '../../ar-nav/css/arrival-dialog.css'");
    expect(read('../../../ar-nav/index.html')).toContain('./css/arrival-dialog.css?');
    expect(read('../../../ar-nav/css/ar.css')).not.toContain('.lv-arrival-card {');
    expect(read('../styles.css')).not.toContain('.arrival-dialog-title {');
  });
  it('ships the exact 2D font binaries for the independently served AR iframe', () => {
    const fontSources = [
      ['@fontsource-variable/source-serif-4', 'source-serif-4-latin-wght-normal.woff2'],
      ...[500, 600, 700].map(weight => ['@fontsource/plus-jakarta-sans', `plus-jakarta-sans-latin-${weight}-normal.woff2`]),
    ];
    const fontCss = read('../../../ar-nav/css/arrival-fonts.css');
    for (const [pkg, file] of fontSources) {
      expect(readFileSync(new URL(`../../../ar-nav/fonts/${file}`, import.meta.url))).toEqual(readFileSync(new URL(`../../node_modules/${pkg}/files/${file}`, import.meta.url)));
      expect(fontCss).toContain(`../fonts/${file}`);
    }
    expect(read('../../../ar-nav/css/arrival-dialog.css')).toContain('"Plus Jakarta Sans"');
    expect(read('../../../ar-nav/css/arrival-dialog.css')).toContain('"Source Serif 4 Variable"');
  });
});
