# Physical Walk Demo — blue-dot position investigation

Diagnostic pass, 30 October 2026. Behavioral fixes are **not implemented** in this pass. The reproduced defects below remain present deliberately; characterization tests describe current behavior rather than certify it as correct.

The code and deterministic fixtures establish two independent ways to get position jumps: a normal-navigation ownership race and interpolation retargeting after missed frames. They also establish movement-filter false positives and false negatives. No coordinate-axis or metre-scale defect was found. These results do **not** identify which cause produced the reported device screenshots: the actual screenshots and a timestamp-correlated diagnostic export were not available in this pass. The previously supplied counts (45 observations, 3 accepted positions, 3 render requests/projections) locate suppression upstream of rendering for that capture, but do not explain individual held fixes or establish current-device behavior.

**Pipeline and coordinate contract**

| Layer / file and function | Input → output / cadence | Authority and diagnostic evidence |
| --- | --- | --- |
| `position/physical-walk/session.ts`: `watch`, `ingest` | Browser `watchPosition`, high accuracy, maximumAge 0, timeout 15s → physical fix | Browser controls delivery cadence. Original fix timestamp and delivery time are distinct. `gps.sample` records every attempted fix. No physical latitude/longitude is exported. |
| Same: validation and recovery | Finite point/source, accuracy 0–30m, age ≤15s, future ≤1s, increasing timestamps, jump ≤4m/s × elapsed + uncertainty, session radius ≤1km | Rejections reset pending/trend/recovery evidence. Valid observations update observation freshness, even when movement is held. Two consecutive valid recovery observations restore readiness; they do not publish outage movement. |
| Same plus `movement-evidence.ts`: `MovementEvidenceWindow.push` | Valid origin-relative E/N → deadband/coherence or sustained trajectory decision | `fix.held`, `fix.rejected`, `movement.accepted` distinguish accuracy/timestamp/jump failures, insufficient distance, pending confirmation and temporal evidence. Accepted movement remains separate from fresh stationary observations. |
| `transform.ts`: `displacement`, `offset` | Physical displacement → remote venue latitude/longitude | R=6,371,000m. East = R cos(physical-origin latitude) Δlongitude; north = R Δlatitude. Inverse uses the venue-anchor latitude. Geographic north preserved; rotation=0; scale=1. No compass/camera rotation and no route snapping. Local tangent approximation, bounded to 1km. |
| `navigation.ts`: `update` | Accepted session position → `host.render` only for a new accepted timestamp with usable freshness and before arrival | Origin preview is selected start, not GPS evidence. Normal heartbeat is 250ms and does not create position/progress. `blue-dot.request` distinguishes publication from session acceptance. |
| `services/map-app.ts`: demo `render` host | Venue fix → `MapMarkerService.applyProviderFrame` | `physical-gps-transformed` uses the existing marker service. Normal provider and SDK position callbacks have active-demo guards. See the exception below. |
| `map/markers.ts`: `renderPhysicalPosition` / `render-interpolation.ts` | Accepted target → RAF samples | Target and accepted `lastPosition` remain authoritative; animation is presentation only. Duration clamps to 180–800ms (zero for initial/identical/different-floor targets). Each request uses SDK `update(..., {animate:false})` and preserves heading. Stops at target; never extrapolates. |
| Installed `@mappedin/blue-dot` 6.27.0-beta.0 / Mappedin 6.27.0 | Requested geographic coordinate → SDK logical coordinate/model state → GPU rendering | Diagnostic readback captures `blueDot.coordinate`, and `mapView.getState(dotModel).position` when geographic coordinates are available. These are logical/state readbacks, **not a rendered-pixel measurement**. The installed experimental rendered-state API supports labels, not BlueDot models. |
| `routing/coordinate-transformation-service.ts`: `snapToRoute` | Accepted unsnapped position → route projection | `geoToLocalMeters` uses x=east/z=south; `toLocalMeters` converts y=-z=north correctly. SDK placement uses latitude, longitude, floor in that order. Projection does not write the physical blue dot. |

The selected `route.origin` is the physical-to-venue anchor, falling back to `pathCoordinates[0]`. A selected origin is not guaranteed to equal the first routable path point. Mappedin map/camera bearing changes screen projection, not the geographic transformation. Deterministic north/east/south/retrace tests pass; an intentionally swapped-axis fixture yields a measurable audit transform error. No venue coordinate, floor geometry, loading code or routing geometry was changed.

**All position writers and related lifecycle paths**

| Path | Effect during Physical Walk Demo |
| --- | --- |
| Demo preview and accepted `host.render` → `applyProviderFrame` → physical RAF | Intended position writer. RAF closure repeatedly writes interpolated lat/lng; previous RAF is cancelled on retarget, reset or provider release. |
| `MapApp.handleProviderFrame` → route projection/stabilization → `applySimulatorFrame` | Guarded at entry while demo runs; normally inactive. |
| `MapApp.snapBlueDotToAlongPath` → `applySimulatorFrame({source:'gps'})` | **No ownership guard here.** Reachable through the confirmed awaited-start race below. Takes the nonphysical SDK animation branch and can compete with the still-active physical RAF. |
| `MapMarkerService.applyProviderFrame` nonparallel `reportPosition` | Normal provider/sensor fusion input; demo acquisition normally selects parallel mode. |
| `MapApp.goToMyLocation` → `showLivePosition` → SDK `update` | Entry guard and post-location-request guard protect active demo. Sensor startup awaits also reclaim demo ownership. |
| Native SDK `position-update` / `dot-position-update` | SDK-owned callbacks. Service/app guards suppress navigation updates in physical mode. Instrumented as callbacks, not proof of an independent application write. SDK `.coordinate` reflects logical state; callback event order can precede model-state updates. |
| `publishConeHeading` → SDK heading-only `update` | Deliberately independent writer of heading only. No latitude/longitude and no route projection. Existing heading filtering and freshness behavior preserved. |
| `startTracking`, `stopTracking`, `setSimulatorParallelMode`, `prepare`, `resetNavigationDisplay`, `destroy` | Enable/disable/reset SDK or physical rendering state; can change visibility/ownership. New hook reports attach, ownership, cancellation, callbacks and writer attempts. No extra sensor activation is introduced. |
| Normal startup `maybeAutoStartBlueDot` / location actions | Existing reclaim-after-await logic stops normal GPS again if demo acquired while startup awaited, and retains demo heading. Existing regression remains passing. |
| Route apply/change, reset/end, scene disposal | End/recreate session/provider ownership; set selected floor/anchor; restore normal provider after demo end. Audit context carries session/route IDs, and debug overlays are cleared on end/disposal. |
| `follow`, `stopFollow`, `focusOnUser`, floor/camera changes | Can move the marker **on screen** through view changes, without changing geographic position. Camera bearing/pitch/zoom and current/SDK floors are recorded where observable. |
| `RoutePlanner.updateTravelledPath` / green start marker updates | Route styling and selected-start markers; these do not write BlueDot coordinates. |

Multiple position writers therefore still exist, and exclusive ownership is **not proven**: the awaited-start race reproduces an actual conflicting call. The added `position.audit.writer` event marks `foreignWriter:true` when a nonphysical frame arrives while physical rendering is active.

**Confirmed defects and deterministic counterexamples**

| Issue and responsible layer | Evidence and reproduction | Recommended fix — deferred |
| --- | --- | --- |
| Normal-navigation ownership race — `MapApp.startRouteMovement`, `applyNavigationPositionMode`, `snapBlueDotToAlongPath` | Active-demo check happens before two awaits. Test pauses `ensureLocationEnabledForAction`, acquires demo, resolves it, and observes a `source:'gps'` route-snapped write plus normal live-route tracking becoming true. `startPositionProvider` itself is guarded, but this does not guard the later direct dot write. | Revalidate owner/session generation after each await and at direct position writes. Add a regression asserting no normal-navigation write after ownership changes. Do not alter physical coordinate authority. |
| Retarget jump after missed frames — `PositionInterpolation.setTarget`, called by `renderPhysicalPosition` | `setTarget` uses `sample(now)` from elapsed time rather than the last coordinate actually submitted to SDK. Test: target 10m east at t=1000, last drawn sample 2.5m at t=1200; no frames; target 20m at t=3000. New starting coordinate is 10m, a 7.5m discontinuity from the last draw. | Seed retarget from the last submitted/drawn coordinate with explicit lifecycle reset. Keep duration bounded and keep animation out of navigation evidence. Actual device causality requires frame-gap evidence. |
| Sparse walking can be held indefinitely — `PhysicalWalkSession.ingest`, `MovementEvidenceWindow.push` | At 4m reported accuracy, observations move 6m every 10s (0.6m/s). Quality/freshness/jump gates pass. A 10s trend window never has four samples; the pending-confirmation tolerance is only max(3m, threshold), so each new candidate is too far from the previous pending candidate. Three such updates all remain held. | Evaluate cadence-aware temporal/pending evidence, with explicit drift counterexamples and retained quality/recovery limits. Do not lower all deadbands. First measure real delivery versus held cadence. |
| Origin capture can introduce apparent post-capture movement — `PhysicalWalkSession.ingest` origin selection | Three fixes at 0m/2m/4m within the permitted 5m capture spread, accuracies 1m/4m/4m, select the earliest 0m fix. Initial dot publishes zero at the selected venue anchor; later fixes remain at 4m and publish 4m despite no new motion after capture. | Specify the capture-end reference contract; validate a contemporaneous representative physical origin before activation. Preserve original observation/movement timestamps. New audit records selected origin timestamp and final capture offset. |
| Existing metric log precedes projection — `PhysicalWalkNavigation.update` | `navigation.metrics` is recorded before processing the current accepted position. Comparing it with same-timestamp `position.accepted` can look one fix behind. Runtime host progress uses the updated projection; this is a diagnostic-order defect, not proof of a progress defect. | Interpret `route.projection` and the new post-update `position.audit.snapshot` together. A later cleanup can move/version the old metric event; it was not changed here. |

These are characterization tests: their passing status confirms the described defects/counterexamples still reproduce.

**Confirmed limitations and evidence-supported hypotheses**

| Issue / file-function | Established evidence / reproduction | Device attribution and recommended next action |
| --- | --- | --- |
| Coherent stationary drift can look like walking — session movement decision / `MovementEvidenceWindow.push` | With stationary ground truth, a synthetic receiver estimate drifts 0.5m east each second at 4m accuracy. The filter accepts a 10m displacement. A persistent 6m GPS offset across accuracy 12m→3m is also accepted. Low-scatter GPS-only trends cannot by themselves prove bodily motion. | A hypothesis for the reported dot displacement, **not established as its cause**. Measure stationary traces with receiver accuracy changes; evaluate uncertainty-aware evidence against real walking and drift fixtures before changing movement criteria. |
| Sparse accepted targets necessarily create stop/start animation — interpolation layer | Animation finishes in ≤800ms; the deterministic fixture holds the endpoint for the rest of a multi-second observation gap. This is bounded interpolation behaving as written. | Compare `gpsDeliveryGapMs`, `acceptedDeliveryGapMs`, `durationMs` and `frameGapMs`. Fix upstream excessive suppression first; consider only bounded presentation-duration changes separately. Do not extrapolate or synthesize progress. |
| Selected start / green marker can differ from path start — `RoutePlanner.generateRoute`, `routableTargetsNear`, `MapApp.startPhysicalWalkDemo` | Directions can choose from selected coordinate plus nearby nodes/spaces, while payload `origin` and green marker preserve selected origin. Fixture records an 8m anchor-to-first-path-point gap. | Real-venue occurrence requires export. Reconcile or clearly communicate selected-anchor versus routable-start semantics if observed; do not snap the live physical dot. |
| Geographic walking direction differs from virtual route — `transform.ts` | Mapping has zero rotation. Walking physical east moves venue east regardless of phone heading, camera bearing or route direction. | An off-route dot can be accurate under this contract. Compare measured E/N with route bearing. Confirm intended orientation contract before proposing any calibration change. |
| Arrival latch stops later dot publication — `PhysicalWalkNavigation.update` | Render/project block includes `!metrics.arrived`. Test reaches the destination, then accepts another physical position; `position.accepted` continues but `host.render` does not. | This is confirmed current lifecycle behavior, not established as the screenshot cause. Check arrival events. If physical position should remain live after arrival, separate rendering lifetime from latched route completion in a later approved change; leave arrival thresholds intact. |
| SDK visual/state divergence or camera-induced apparent motion | No deterministic SDK/GPU rendering defect established. Mock tests verify application requests/readback separation, not physical pixels. | Compare requested/interpolated coordinates, SDK logical coordinates, model state, floors and screen recording. Callback-time readbacks can be transient; prefer `reason:'after-sdk-update-call'`. Do not replace SDK based on screenshots alone. |

**Which component uses which position**

| Component | Coordinate and update cycle |
| --- | --- |
| Authoritative blue-dot target / marker service `getLastPosition()` | Accepted unsnapped transformed venue fix; origin preview before capture; new accepted publication only. |
| Displayed blue dot | RAF interpolation from previous presentation to accepted target, then SDK rendering. Authority may already be at target while display is still between points. |
| Route along distance and percentage | One projection of accepted position onto serialized path, updated at accepted-fix cadence. Can decrease on backtracking. No animation input. |
| Remaining distance / ETA | Same qualified projection; remaining distance also includes off-route return distance. Thus remaining percentage is not necessarily the complement of along-path percentage. |
| Completed-route grey styling | Same qualified projected coordinate sent by demo host to `RoutePlanner.updateTravelledPath`, then SDK `Navigation.trackCoordinate` against SDK Directions. Actual SDK styling extent is not exposed as a geographic readback. |
| Off-route >30m | Dot retains unsnapped authority. Candidate projection/off-route distance updates, while last qualified along/remaining/style is retained. Audit distinguishes candidate and qualified projection. |
| Green start marker | `RoutePlanner.originCoord`, static selected/canonical start; recreated/repositioned by route selection/sync, not walking. The identified green marker is not a movement estimate. Other unidentified screenshot decorations cannot be classified without the screenshots. |
| Directional glow | Existing filtered device heading and heading lifecycle; independent of physical acceptance/route progress. |

**Diagnostic changes in this pass**

All new instrumentation defaults off. Enable in a diagnostic build (Vite flags are build-time):

```dotenv
VITE_PHYSICAL_WALK_DEMO=1
VITE_PHYSICAL_WALK_POSITION_DIAGNOSTICS=1
# Optional extra map markers:
VITE_PHYSICAL_WALK_POSITION_OVERLAY=1
```

The existing demo card contains a collapsible “Position pipeline audit” readout only when diagnostics are enabled. Existing whole-card collapse remains available. Debug marker rings use different sizes: amber=raw transformed attempted fix, red=accepted, cyan=interpolated request, magenta=last qualified route projection, black=SDK logical coordinate. They are noninteractive, reuse marker handles, skip unchanged coordinates, and are removed on session end/disposal. They never call camera, floor, route-progress or BlueDot APIs. Overlay positions are sampled diagnostic observations, not an alternate navigation display.

The recorder captures raw transformed venue position before validation (explicitly untrusted), selected-origin/capture offsets, accepted target, interpolated request, last drawn request, new animation start, SDK logical/model state when available, route candidate/qualified projection, GPS accuracy, attempted/trusted/accepted timestamp ages, filter decisions, heading age, writer/source/session/route context, floors and camera state. Post-update snapshots include current route metrics. Existing physical latitude/longitude redaction remains enforced; exported venue coordinates and relative displacements can reveal relative movement, as before.

SDK readback/callback samples are capped at 4Hz per event type, post-update snapshots at 1Hz; target/completion/ownership transitions remain unsampled. Repetitive audit/heading events are evicted before GPS decisions when the bounded recorder fills. Total/suppressed/dropped counts remain in exports. Observer/readback/overlay failures are isolated from navigation. No additional GPS watch is created by diagnostics; the text panel refresh timer only reads snapshots.

Files changed for this pass (relative to `mappedin-pwa/` unless stated):

- `src/position/physical-walk/position-diagnostics.ts` — new read-only aggregation and flag gates.
- `src/position/physical-walk/position-overlay.ts` — optional diagnostic markers.
- `src/position/physical-walk/position-audit-panel.ts` — optional snapshot readout.
- `src/position/physical-walk/session.ts` — gated raw-transformation/origin-capture diagnostic events only.
- `src/position/physical-walk/navigation.ts` — optional observer context/projection/post-update snapshot taps only.
- `src/position/physical-walk/recorder.ts` — safe subscriptions, allowed audit fields, sampling/retention priority.
- `src/position/physical-walk/controls.ts` — mount/clean up optional audit readout.
- `src/map/markers.ts` — read-only writer/callback/render readbacks and diagnostic attachment.
- `src/services/map-app.ts` — attach/remove diagnostics and optional overlay under flags; capture actual green-marker coordinate.
- `.env.example` — document diagnostic flags.
- `src/position/physical-walk/position-investigation.test.ts`, `navigation.test.ts`, `src/map/markers.test.ts`, `src/services/physical-walk.integration.test.ts` — deterministic reproductions and isolation tests.
- Repository `docs/physical-walk-position-investigation.md` — this report.

No changes to `transform.ts`, `movement-evidence.ts`, `render-interpolation.ts`, route geometry/loading, production quality thresholds, compass filtering, AR or Phase 3 were made in this pass. Existing unrelated workspace changes were left in place. No Git branch changes or history investigation were performed.

**Verification**

- **PASS:** 214 local tests across 24 files: all physical-walk session/readiness/stabilization/navigation tests, the new diagnostic reproductions, position/GPS/provider tests, local routing regressions, MapApp integration and marker/heading tests.
- **PASS:** TypeScript (`tsc --noEmit`) and production builds with demo/diagnostics/overlay all enabled and all disabled.
- **PASS:** `git diff --check`. New files were also checked for trailing whitespace/conflict markers.
- **NOT VERIFIED:** Two existing live tests in `src/routing/guest-indoor-routing.e2e.test.ts` failed before their navigation assertions because the configured backend hostname returned `getaddrinfo ENOTFOUND`. The final local run excludes only this network-dependent file. No backend or live-venue success is claimed.
- Build output retains the existing large-chunk warning. No physical-device/GPU visual verification was performed.

Local test command (from `mappedin-pwa`):

```sh
VITE_PHYSICAL_WALK_DEMO=0 VITE_PHYSICAL_WALK_POSITION_DIAGNOSTICS=0 VITE_PHYSICAL_WALK_POSITION_OVERLAY=0 npx vitest run src/position src/routing src/services/physical-walk.integration.test.ts src/map/markers.test.ts --exclude '**/guest-indoor-routing.e2e.test.ts'
npx tsc --noEmit
VITE_PHYSICAL_WALK_DEMO=1 VITE_PHYSICAL_WALK_POSITION_DIAGNOSTICS=1 VITE_PHYSICAL_WALK_POSITION_OVERLAY=1 npm run build
VITE_PHYSICAL_WALK_DEMO=0 VITE_PHYSICAL_WALK_POSITION_DIAGNOSTICS=0 VITE_PHYSICAL_WALK_POSITION_OVERLAY=0 npm run build
```

**Physical-device measurements still required**

1. Start from a known selected point; record green/anchor/path-start distances before movement. Stand still for 60–90s, first with stable accuracy and then under changing reception. Export all held/accepted evidence.
2. Walk measured 5m north/east/south, pause at each endpoint, then retrace. Record real movement times alongside a screen recording. Do not infer geographic direction from camera rotation alone.
3. Walk slowly with sparse observations, reverse direction, go off route and rejoin. Compare fix delivery, acceptance, route projection and render endpoints for the same fix timestamp.
4. Briefly background/foreground or otherwise reproduce a frame interruption, then receive a new target. Compare `lastDrawn*`, `animationStart*` and frame gaps. No background GPS cadence is assumed.
5. Start normal navigation while permission/location work is pending, then start the demo. Check for `foreignWriter:true`; this is a reproduced code race and should be corrected in a separately approved behavioral pass.
6. Rotate stationary phone; rotate/pan map separately. Compare heading age, camera state and geographic coordinates. Capture SDK/model readbacks and visible marker positions together.
7. Reach arrival, then walk farther. Determine whether a perceived freeze corresponds to the documented arrival latch. End/restart demo and confirm restoration and overlay cleanup on the actual SDK/device.

Use short captures and retain recorder suppression/drop counts. The debug overlay itself adds sampled marker work, so compare a capture with diagnostics enabled/overlay disabled against overlay enabled if investigating frame scheduling. A new physical-device test is required before attributing the screenshots to one layer or approving stabilization.
