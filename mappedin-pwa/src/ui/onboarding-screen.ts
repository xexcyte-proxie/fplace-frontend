export function renderOnboardingScreen(): string {
  return `
    <div class="onboarding-screen">
      <div class="onboarding-copy">
        <h1 class="onboarding-title">
          Find places. Find<br />
          people. Find your way.
        </h1>
      </div>

      <div class="onboarding-actions">
        <button type="button" id="onboarding-create-account" class="onboarding-cta-primary">
          Create account
        </button>
        <button type="button" id="onboarding-login" class="onboarding-cta-secondary">
          I already have an account
        </button>
      </div>
    </div>
  `;
}
