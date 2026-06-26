const ONBOARDING_ASSETS = {
  ring: '/onboarding/Ellipse.png',
  dotTop: '/onboarding/Ellipse-1.png',
  dotLeft: '/onboarding/Ellipse-2.png',
  dotRight: '/onboarding/Ellipse-3.png',
  dotBottom: '/onboarding/Ellipse-4.png',
} as const;

export function renderOnboardingScreen(): string {
  return `
    <div class="onboarding-screen">
      <div class="onboarding-hero" aria-hidden="true">
        <div class="onboarding-graphic">
          <img
            class="onboarding-graphic-ring"
            src="${ONBOARDING_ASSETS.ring}"
            alt=""
            decoding="async"
          />
          <img
            class="onboarding-graphic-dot onboarding-graphic-dot--top"
            src="${ONBOARDING_ASSETS.dotTop}"
            alt=""
            decoding="async"
          />
          <img
            class="onboarding-graphic-dot onboarding-graphic-dot--left"
            src="${ONBOARDING_ASSETS.dotLeft}"
            alt=""
            decoding="async"
          />
          <img
            class="onboarding-graphic-dot onboarding-graphic-dot--right"
            src="${ONBOARDING_ASSETS.dotRight}"
            alt=""
            decoding="async"
          />
          <img
            class="onboarding-graphic-dot onboarding-graphic-dot--bottom"
            src="${ONBOARDING_ASSETS.dotBottom}"
            alt=""
            decoding="async"
          />
        </div>
      </div>

      <div class="onboarding-copy">
        <h1 class="onboarding-title">Navigate together,<br />not alone.</h1>
        <p class="onboarding-subtitle">
          AR wayfinding plus a live feed from fans already inside. Know where to go and what's happening before you get there.
        </p>
      </div>

      <div class="onboarding-actions">
        <button type="button" id="onboarding-get-started" class="onboarding-primary-btn">
          Get Started
        </button>
        <button type="button" id="onboarding-guest-btn" class="onboarding-guest-btn">
          Continue as Guest
        </button>
      </div>
    </div>
  `;
}
