const ONBOARDING_ASSETS = {
  logo: '/onboarding/map-pin-logo.svg',
} as const;

export function renderOnboardingScreen(): string {
  return `
    <div class="onboarding-screen">
      <div class="onboarding-top">
        <div class="onboarding-logo" aria-hidden="true">
          <img
            class="onboarding-logo-icon"
            src="${ONBOARDING_ASSETS.logo}"
            alt=""
            width="30"
            height="30"
            decoding="async"
          />
        </div>
      </div>

      <div class="onboarding-copy">
        <h1 class="onboarding-title">
          Find places.<br />
          Find people.<br />
          Find your way.
        </h1>
      </div>

      <div class="onboarding-actions">
        <button type="button" id="onboarding-continue" class="onboarding-cta-primary">
          Continue
        </button>
      </div>
    </div>
  `;
}
