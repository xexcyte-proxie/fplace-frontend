/**
 * Shared centered placeholder used for incomplete onboarding screens.
 * TODO: Replace each caller with the final designed UI.
 */
export function renderPlaceholderScreen(options: {
  title: string;
  primaryActionId?: string;
  primaryActionLabel?: string;
  secondaryText?: string;
}): string {
  const actions =
    options.primaryActionId && options.primaryActionLabel
      ? `
      <div class="placeholder-screen-actions">
        <button
          type="button"
          id="${options.primaryActionId}"
          class="onboarding-cta-primary"
        >
          ${options.primaryActionLabel}
        </button>
      </div>
    `
      : '';

  const secondary = options.secondaryText
    ? `<p class="placeholder-screen-secondary">${options.secondaryText}</p>`
    : '';

  return `
    <main class="placeholder-screen" role="main">
      <div class="placeholder-screen-body">
        <h1 class="placeholder-screen-title">${options.title}</h1>
        ${secondary}
      </div>
      ${actions}
    </main>
  `;
}
