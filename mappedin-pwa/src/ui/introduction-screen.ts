import { renderPlaceholderScreen } from './placeholder-screen';

/** TODO: Replace with the final Introduction / product story UI. */
export function renderIntroductionScreen(): string {
  return renderPlaceholderScreen({
    title: 'Introduction',
    primaryActionId: 'introduction-continue',
    primaryActionLabel: 'Continue',
  });
}
