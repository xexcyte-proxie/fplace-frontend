import { describe, expect, it } from 'vitest';

import { renderPseudoNameScreen } from './pseudo-name-screen';

const emptyState = {
  pseudoNameDraft: '',
  pseudoNameHint: 'Fan_01',
  selectedInterests: [] as string[],
  interestOptions: ['Live music', 'Merch'],
  authLoading: false,
  authFieldErrors: {},
};

describe('pseudo name screen interests', () => {
  it('renders chips from the loaded catalog, not a hardcoded list', () => {
    const html = renderPseudoNameScreen({
      pseudoNameDraft: '',
      pseudoNameHint: 'Fan_01',
      selectedInterests: ['Live music'],
      interestOptions: ['Live music', 'Merch'],
      authLoading: false,
      authFieldErrors: {},
    });

    expect(html).toContain('Live music');
    expect(html).toContain('Merch');
    expect(html).not.toContain('Photography');
  });
});

describe('renderPseudoNameScreen', () => {
  it('keeps pseudo-name hooks used by ui-root-events', () => {
    const html = renderPseudoNameScreen(emptyState);
    expect(html).toContain('id="pseudo-name-back-btn"');
    expect(html).toContain('id="pseudo-name-form"');
    expect(html).toContain('id="pseudo-name-input"');
    expect(html).toContain('id="pseudo-name-shuffle-btn"');
    expect(html).toContain('id="pseudo-name-continue-btn"');
    expect(html).toContain('data-interest="Live music"');
    expect(html).toContain('data-interest="Merch"');
    expect(html).toContain('Pick a pseudo-name');
  });

  it('hides the back button when allowBack is false', () => {
    const html = renderPseudoNameScreen({ ...emptyState, allowBack: false });
    expect(html).not.toContain('id="pseudo-name-back-btn"');
  });

  it('escapes name, hint, interests, and errors that look like HTML', () => {
    const html = renderPseudoNameScreen({
      pseudoNameDraft: '"quoted"',
      pseudoNameHint: '<i>hint</i>',
      selectedInterests: ['<em>Live</em>'],
      interestOptions: ['<b>Merch</b>'],
      authLoading: false,
      authFieldErrors: {
        pseudo_name: '<b>bad</b>',
        _form: '<img src=x>',
      },
    });
    expect(html).toContain('value="&quot;quoted&quot;"');
    expect(html).toContain('placeholder="&lt;i&gt;hint&lt;/i&gt;"');
    expect(html).toContain('data-interest="&lt;b&gt;Merch&lt;/b&gt;"');
    expect(html).toContain('data-interest="&lt;em&gt;Live&lt;/em&gt;"');
    expect(html).toContain('&lt;b&gt;bad&lt;/b&gt;');
    expect(html).toContain('&lt;img src=x&gt;');
    expect(html).not.toContain('<b>Merch</b>');
    expect(html).not.toContain('<em>Live</em>');
    expect(html).not.toContain('<b>bad</b>');
    expect(html).not.toContain('<img src=x>');
  });
});
