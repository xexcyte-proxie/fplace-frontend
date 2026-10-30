# Physical Walk 2D stabilization

## Established findings and limits of evidence

The supplied device summary (45 samples, 42 holds, three accepted positions/renderer
requests/projections) establishes sparse publication; 2461 browser orientation events
and 8973 dropped records establish diagnostic overload. The complete GPS export was
not supplied in this request, so individual hold reasons/accuracy values cannot be
reconstructed retrospectively.

Code findings: the original deadband used half the greater current/origin accuracy
forever (minimum 2m). A poor origin therefore continued suppressing later accurate
walking. Acceptance reset the baseline and confirmation, forcing another deadband
crossing for each publication. SDK animation alone cannot fill gaps in accepted
sensor evidence. Unsnapped points away from a route are intentional and can represent
physical direction mismatch or GPS error; this is not evidence of coordinate scaling.

## Acceptance

Original timestamp/age, accuracy <=30m, jump, origin, consecutive recovery and outage
rules remain. The isolated-fix gate still requires the accuracy-dependent deadband
and coherent confirmation. Its accuracy reference is the last accepted fix, not a
permanent origin floor. A separate temporal path permits finer updates only after
sustained evidence: >=4 observations spanning >=3s, directional efficiency >=0.85,
low straight-line-fit residual, fitted walking speed 0.2–4m/s, and window displacement
>=max(2m, 0.2*median reported accuracy, 3*residual). This is a motion heuristic, not a
claim that averaging improves the GPS confidence radius.

Once this evidence exists, an increment must still exceed max(0.5m, 0.05*current
accuracy). Coordinates remain actual accepted observations, not fitted predictions.
Rejects and interruptions clear temporal evidence; recovery seeds a new window and
never publishes outage movement. No compass or timer manufactures displacement.

Controlled trace: initial accuracy 20m; subsequent fixes accuracy 4m, 1m north each
second for 20 seconds. The old origin-based 10m gate accepts once (at 11m); the revised
gate accepts 18 times (3m through 20m). This does not predict an acceptance rate for
unseen device logs. Stationary jitter, small repeated moves and recovery are tested
separately. Coherent GPS drift can still resemble walking; no browser-only filter can
perfectly distinguish these. Field tuning requires raw-quality/relative-motion logs.

Every movement hold records accuracy, original timestamp, candidate E/N, bearing,
distance from accepted position, isolated/incremental thresholds and temporal evidence
(net distance, window, residual, efficiency, fitted speed, trajectory confirmation).
Recovery holds explicitly state readiness-only. Origin wait is a separate capture
decision. Quality rejects identify accuracy, age/order, source/coordinate or jump gates.

## Coordinates and presentation

Original remote map and coordinate transform are unchanged: geographic deltas become
East/North metres at the physical latitude, then geographic coordinates at the venue
anchor latitude, unit scale and zero rotation. Independent fixtures verify 5m north,
east, south and retracing. Original floor identity is passed directly to Blue Dot.

PositionInterpolation is presentation-only: start at current interpolated position,
retarget on interruption, clamp duration to 180–800ms, stop exactly at target, cancel
on end/reset/teardown. Identical points do not start an animation. Existing SDK models
are updated with animate:false to avoid nested SDK tweens. Heading is never overwritten
by render frames. The accepted-coordinate timestamp is not attached to intermediate
render points as new sensor evidence. The controller retains authority; marker
getLastPosition retains the accepted point, while SDK coordinate reflects presentation.
SDK animation callbacks cannot overwrite accepted position/heading or update metrics.

Route projection remains separate. A single qualified snap supplies along distance,
remaining distance, percentage and travelled-route styling in one host callback.
Outside the existing 30m route-quality bound, retain last qualified progress/style
and suppress ETA; keep the unsnapped physical dot and candidate off-route distance.
No rendered-point re-projection, progress extrapolation or Phase 3 state machine exists.

## Glow lifecycle

The existing compass/filter/renderer are retained. Stopping a competing position
provider no longer disables parallel rendering/compass while physical demo owns it.
Installing diagnostics on an already enabled renderer applies the demo liveness policy
even if ownership mode is already active. The established stale-heading hold policy
and lifecycle-generation guards remain. New interpolation frames omit heading, and SDK
animation events cannot erase accepted heading state.

## Diagnostics

Repetitive orientation, heading and render events are sampled (normally once/type/sec;
meaningful turns >=10 degrees can publish at >=100ms). Permission/freshness/visibility
transitions and errors remain unsampled. Reports include full per-type incoming counts,
suppressed counts and dropped retained-event counts. Overflow evicts repetitive events
before GPS/decisions/session events. High-priority history remains bounded as before.
Renderer targets and completed endpoints are retained; intermediate frames are sampled.
Physical geographic coordinates remain excluded by the scalar allowlist.

## Verification and next device test

202 tests across 18 focused files pass; TypeScript passes. Tests include stationary
jitter, slow/repeated small walking, cardinal unit scale, retracing, backtracking,
off-route/rejoin projection consistency, existing outage/recovery safeguards, interrupted
rendering, no extrapolation, heading-only stationarity and priority diagnostic retention.

Builds are checked in demo-enabled and demo-disabled configurations. Existing dependency
annotation and chunk-size warnings are separate from this change.

On iPhone Safari and Android Chrome, use a measured outdoor course aligned to the route's
actual geographic bearings. Hold still for 45s and rotate; walk 5m north/east/south,
retrace, walk slowly, stop, deviate from and rejoin the route, interrupt GPS, then reset
and end. Compare accepted target/rendered endpoint and the single route projection.
Check movement cadence and initial accuracy against hold reasons. Export shortly after
testing and inspect eventCounts/suppressed/dropped totals. Camera smoothness, GPS accuracy,
walking acceptance and glow visibility still need this physical-device validation.
No AR, remote map loading, routing engine or production arrival/GPS thresholds changed.

## SDK placement audit

The installed SDK can discard a marker update outside Camera.bounds when its default
preventOutOfBounds flag is true. Demo-only rendering now disables this display bound,
without changing camera bounds, venue coordinates or positioning quality. The previous
SDK timeout/bounds policy is captured and restored on release, even when the renderer
is disabled during handoff. Requested interpolation points and SDK coordinate readback
are logged separately. This is a code-level restriction found by audit, not a claim
that it caused the supplied device trace.
