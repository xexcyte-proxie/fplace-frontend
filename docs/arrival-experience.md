# Arrival presentation

The AR and 2D completion dialogs use a warm white card, a green SVG success mark with a subtle halo, serif heading, clear destination chip, and the application's orange primary action. The existing Done/backdrop action IDs and navigation completion behavior remain in place. Both layouts allow long names to wrap, scroll in short viewports, and honor reduced-motion preferences.

Minimized AR uses a separate, opaque light-green surface inside the existing PiP shell. Its only visible content is one green SVG checkmark. Absolute `inset: 0` and grid `place-items: center` center the mark against the entire PiP viewport, without toolbar or safe-area offsets; the SVG path bounds are centered in its square viewBox. The Live label, icons, hint, spinner, and underlying camera content do not clutter that surface. The existing drag/tap-to-expand layer still works; Enter/Space also expands the arrived PiP for keyboard users.

The parent shell reads only already-confirmed `routeSimulationComplete` from the shared navigation snapshot or the existing confirmed arrival handler. The AR dialog reads the child navigator's confirmed `arrived` flag, which remains controlled by the physical-walk authority during simulation. No distance threshold, movement filter, independent position writer, or new arrival calculation was added.

The HUD changes visibility, destination text, and ARIA attributes only when needed. Repeated completion snapshots do not rebuild the dialog, repeat its entry animation, or repeatedly focus Done. Camera/status chatter cannot dismiss confirmed arrival. Full-screen AR suppresses the parent map dialog to avoid duplicate modals; minimized AR hides the child full-screen dialog. Mode changes switch presentation without changing route progress or the simulation session.

New route/session snapshots remove the PiP indicator. Explicit parent route reset also sends a route/version-scoped presentation reset to clear stale child route/arrival UI; mismatched old reset messages are ignored. This reset is tied to the user's existing route-clear action, not opening or closing AR. Completed-route reopen avoids covering the arrival dialog with the startup spinner.

Tests cover confirmed-only rendering, repeated updates, camera interruption, mode changes, destination escaping, Done action preservation, reset/arrival synchronization, uncluttered centering rules, and stale-reset rejection. Navigation, shared physical progress, arrow geometry/stability, and existing raw-demo tests are included in regression verification.

Visual browser verification could not run because the in-app browser connection failed before opening a page. Actual screen rendering and phone camera behavior still need visual/device verification; deterministic presentation tests do not replace those checks.

## Exact 2D / AR appearance

Both renderers now use the same `ar-nav/css/arrival-dialog.css` and the same arrival class names. The PWA imports that stylesheet; the standalone AR HTML links it. AR-specific rules change only overlay positioning/layer priority, not the card's appearance. The same bundled Source Serif 4 Variable and Plus Jakarta Sans font binaries and weights are packaged for the AR iframe in `ar-nav/fonts`, with their original licenses, and declared in the shared `arrival-fonts.css`. This removes the previous Georgia/system-font fallback and 20px-versus-24px backdrop spacing difference. The PiP checkmark and navigation/simulation state are unchanged.
