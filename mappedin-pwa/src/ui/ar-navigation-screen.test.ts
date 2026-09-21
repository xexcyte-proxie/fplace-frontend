import { describe, expect, it } from 'vitest';

import { initialAppState } from '../types';
import { renderArNavigationScreen } from './ar-navigation-screen';

describe('renderArNavigationScreen', () => {
  it('keeps AR navigation hooks used by ui-root-events', () => {
    const html = renderArNavigationScreen(initialAppState());
    expect(html).toContain('id="ar-nav-close-btn"');
    expect(html).toContain('aria-label="Close AR navigation"');
    expect(html).toContain('id="ar-nav-minimize-btn"');
    expect(html).toContain('aria-label="Minimize Live View"');
    expect(html).toContain('id="ar-nav-end-btn"');
    expect(html).toContain('End navigation');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="AR navigation"');
    expect(html).toContain('AR mode active');
  });

  it('shows destination fallbacks when no route is set', () => {
    const html = renderArNavigationScreen(initialAppState());
    expect(html).toContain('Follow the path');
    expect(html).toContain('along the route');
    expect(html).toContain('Destination');
    expect(html).toContain('On your route');
    expect(html).toContain('ETA');
    expect(html).toContain('Distance');
    expect(html).toContain('Arrive');
    expect(html).toContain('>-</span>');
  });

  it('renders live guidance and destination copy from the route', () => {
    const state = initialAppState();
    state.markers = {
      destinationLabel: 'Food Court',
      destinationFloorName: 'Level 1',
    };
    state.routeInstructions = 'Turn left for 40 meters, then continue';
    state.routeRemainingMeters = 40;
    const html = renderArNavigationScreen(state);
    expect(html).toContain('Turn left');
    expect(html).toContain('for 40 meters');
    expect(html).toContain('Food Court');
    expect(html).toContain('Level 1 - Near Food Court');
    expect(html).toContain('1 min');
    expect(html).toContain('40m');
  });

  it('escapes destination and guidance that look like HTML', () => {
    const state = initialAppState();
    state.markers = { destinationLabel: '<img src=x>' };
    state.routeInstructions = '<b>Turn left</b> for 12 meters';
    const html = renderArNavigationScreen(state);
    expect(html).toContain('&lt;img src=x&gt;');
    expect(html).toContain('&lt;b&gt;Turn left&lt;/b&gt;');
    expect(html).not.toContain('<img src=x>');
    expect(html).not.toContain('<b>Turn left</b>');
  });
});
