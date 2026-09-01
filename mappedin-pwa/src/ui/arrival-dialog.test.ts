import { describe, expect, it } from 'vitest';

import { arrivalDialogCopy, renderArrivalDialog } from './arrival-dialog';

describe('arrival dialog', () => {
  it('names the destination when one is known', () => {
    expect(arrivalDialogCopy('Apple Store')).toEqual({
      title: "You've arrived",
      body: "You've gotten there — Apple Store.",
    });
  });

  it('renders done and dismiss hooks', () => {
    const html = renderArrivalDialog('Gate A');
    expect(html).toContain("You've arrived");
    expect(html).toContain("You've gotten there — Gate A.");
    expect(html).toContain('id="arrival-dialog-done-btn"');
    expect(html).toContain('id="arrival-dialog-dismiss"');
  });
});
