import { renderPlaceholderScreen } from './placeholder-screen';

/** TODO: Replace with the final Features highlight UI. */
export function renderFeaturesScreen(): string {
  return renderPlaceholderScreen({
    title: 'Features',
    primaryActionId: 'features-continue',
    primaryActionLabel: 'Continue',
  });
}
