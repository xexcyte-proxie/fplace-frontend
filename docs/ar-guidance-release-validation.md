# AR guidance release validation

The main card follows facing relative to the current route direction: Head straight, Turn left, Turn right, or Turn around. Upcoming maneuvers do not override this direction feedback. Missing heading, poor compass accuracy, stale local positions, stale parent synchronization, and explicit parent sensor degradation suppress walking instructions. SLAM heading requires calibration and fresh NORMAL tracking. Alignment enters at 22 degrees, exits below 12 degrees, and requires 350 ms stability. Opposite-facing prompts enter at 140 degrees and exit below 125 degrees.

Recovery detects tracking loss/staleness, missing arrows while facing the route for 800 ms, and sustained AR/compass disagreement of at least 45 degrees for 1800 ms. Drift detection ignores unavailable or reported inaccurate compass evidence. The Align route button requires fresh NORMAL tracking and facing the route steadily for 300 ms. These checks detect supported failure signals; they do not diagnose every possible AR fault.

Arrival uses the navigator's existing confirmed arrival latch; remaining distance alone never produces an arrival instruction. GPS movement filtering and committed parent progress remain the movement authority. These changes do not add indoor positioning or make route-guided physical-walk simulation a measurement of actual position on the venue route.

Before production rollout, record device/browser versions and results on an iPhone and Android phone at the target venue:

- Walk a straight segment and a left/right junction; verify that the main instruction follows the direction of the current path.
- Rotate the phone while stationary: committed distance must stay unchanged; the main instruction must follow facing.
- Oscillate near alignment thresholds: prompts must remain stable.
- Deny location/orientation/camera access, interrupt tracking, cover the camera, and test poor lighting and magnetic interference. Confirm uncertainty and recovery.
- Stop, walk slowly, backtrack, and deviate from the path. Confirm progress is credible and recovery messaging matches actual position. Route-guided simulation cannot validate deviation detection.
- Change floors and confirm the next maneuver and floor state agree.
- Approach the destination, stop just short, and lose tracking: confirm arrival requires the existing credible progress evidence.
- Background and resume the app; confirm stale data cannot issue a walking command.
- Measure incorrect prompts, instruction delay, position error, and battery usage. Set acceptance limits using venue requirements before release.

Automated regression coverage is in `src/ar/live-guidance.test.ts` and `src/ar/physical-walk-progress.test.ts`, alongside existing movement, alignment, and arrival suites. Real-device results have not yet been collected.

## Stationary GPS regression

The physical-walk estimator previously allowed two agreeing displaced GPS readings to bypass trajectory checks. This could turn stationary GPS cluster changes into route-guided distance. Acceptance now always requires a sustained, consistent trajectory (or a qualified continuation), with an 8-second evidence window to support slow walking. Repeated endpoint fixes, accuracy changes, and capture-window offsets cannot independently grant walking distance. Regression coverage includes alternating stationary clusters committed through the route-guided distance consumer, as well as real sampled trajectories for walking, turns, and backtracking.

GPS-only evidence still cannot distinguish a smooth coherent location drift from equivalent actual walking. The diagnostic reproduction in `position-investigation.test.ts` retains this limitation explicitly. Device field validation or independent movement evidence is needed to address that remaining class of false positives.

## Unified alignment presentation

Missing direction and AR alignment recovery use the existing main instruction card, titled “Face the route” with a red background. The Align route control is requested alongside this card. Alignment invalidation and rejected calibration attempts refresh this card instead of opening the separate status/error banner. Normal direction guidance restores the original card theme. Repeated recovery updates preserve text and icon content and do not hide/show the Align route control between frames.
