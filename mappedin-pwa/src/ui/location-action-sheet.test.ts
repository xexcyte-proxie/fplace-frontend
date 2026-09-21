import { describe, expect, it } from 'vitest';

import { renderLocationActionSheet } from './location-action-sheet';

describe('location action sheet', () => {
  it('puts navigate ahead of open conversation', () => {
    const html = renderLocationActionSheet(
      { locationId: 'loc-1', name: 'Food Court', anchor: null },
      false,
    );
    const navigateIndex = html.indexOf('id="location-action-navigate"');
    const conversationIndex = html.indexOf(
      'id="location-action-conversation"',
    );

    expect(navigateIndex).toBeGreaterThan(-1);
    expect(conversationIndex).toBeGreaterThan(-1);
    expect(navigateIndex).toBeLessThan(conversationIndex);
    expect(html).toContain('Navigate from here');
    expect(html).toContain('Open conversation');
  });

  it('labels navigate as the destination when a start point exists', () => {
    const html = renderLocationActionSheet(
      { locationId: 'loc-2', name: 'Gate A', anchor: null },
      true,
    );

    expect(html).toContain('Navigate to here');
    expect(html).toContain('location-action-btn--primary');
  });

  it('keeps dismiss, cancel, and title hooks used by ui-root-events', () => {
    const html = renderLocationActionSheet(
      { locationId: 'loc-1', name: 'Food Court', anchor: null },
      false,
    );
    expect(html).toContain('id="location-action-dismiss"');
    expect(html).toContain('id="location-action-cancel"');
    expect(html).toContain('id="location-action-title"');
    expect(html).toContain('Food Court');
    expect(html).toContain('Cancel');
    expect(html).toContain('role="dialog"');
  });

  it('escapes location names that look like HTML', () => {
    const html = renderLocationActionSheet(
      { locationId: 'loc-1', name: '<b>hi</b>', anchor: null },
      false,
    );
    expect(html).toContain('&lt;b&gt;hi&lt;/b&gt;');
    expect(html).not.toContain('<b>hi</b>');
  });
});
