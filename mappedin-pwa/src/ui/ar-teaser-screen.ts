/**
 * Dummy AR teaser placeholder in the onboarding flow.
 * TODO: Replace with the final AR teaser / Live View promo UI.
 */
export function renderArTeaserScreen(): string {
  return `
    <main class="ar-teaser-screen placeholder-screen" role="main">
      <header class="ar-teaser-top">
        <button
          type="button"
          id="ar-teaser-skip-btn"
          class="ar-teaser-skip-btn"
        >
          Skip
        </button>
      </header>
      <div class="placeholder-screen-body">
        <h1 class="placeholder-screen-title">AR teaser</h1>
        <p class="placeholder-screen-secondary">
          Preview of AR navigation — coming soon.
        </p>
      </div>
      <div class="placeholder-screen-actions">
        <button
          type="button"
          id="ar-teaser-continue"
          class="onboarding-cta-primary"
        >
          Continue
        </button>
      </div>
    </main>
  `;
}
