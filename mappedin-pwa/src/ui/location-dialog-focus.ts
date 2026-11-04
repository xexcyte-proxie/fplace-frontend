type FocusState = { opener: string; focused: string; helpOpen: boolean; open: boolean };
const states = new WeakMap<HTMLElement, FocusState>();
export function captureLocationDialogFocus(root: HTMLElement): void {
  const previous = states.get(root);
  const modal = root.querySelector('#location-gate-dismiss');
  const active = document.activeElement as HTMLElement | null;
  states.set(root, {
    opener: previous?.open ? previous.opener : active?.id ?? '',
    focused: modal?.contains(active) ? active?.id ?? '' : '',
    helpOpen: !!modal?.querySelector('details[open]'),
    open: !!modal,
  });
}
export function restoreLocationDialogFocus(root: HTMLElement): void {
  const state = states.get(root);
  const modal = root.querySelector<HTMLElement>('#location-gate-dismiss');
  root.querySelectorAll<HTMLElement>('[data-location-inert]').forEach(el => { el.inert = false; el.removeAttribute('data-location-inert'); });
  if (!modal) {
    if (state?.open && state.opener) root.querySelector<HTMLElement>(`#${CSS.escape(state.opener)}`)?.focus();
    return;
  }
  // Inert only siblings along the modal's ancestor chain, including nested auth layouts.
  let branch: HTMLElement = modal;
  while (branch !== root && branch.parentElement) {
    for (const sibling of branch.parentElement.children) {
      if (sibling !== branch && sibling instanceof HTMLElement && !sibling.inert) {
        sibling.inert = true; sibling.setAttribute('data-location-inert', '');
      }
    }
    branch = branch.parentElement;
  }
  const details = modal.querySelector('details');
  if (details && state?.helpOpen) details.open = true;
  const previous = state?.focused ? modal.querySelector<HTMLElement>(`#${CSS.escape(state.focused)}`) : null;
  (previous && !previous.matches(':disabled') ? previous : modal.querySelector<HTMLElement>('button:not(:disabled), summary'))?.focus();
}
