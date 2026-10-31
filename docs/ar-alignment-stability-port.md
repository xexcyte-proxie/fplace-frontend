# AR alignment and stability port

Compared current working-tree implementations with `demo-pwa-local-first` at `f9258e7b189b52044f042e2bbef62d046c92bd22`, using read-only Git show/diff/blame. No merge, checkout, cherry-pick, history change, or wholesale file replacement was used. Existing uncommitted work was retained.

## Source comparison and selected changes

The current branch already had fixed grid spacing, retained arrow slots, the 180ms membership gate, camera-depth fading, event-built route snapshots, and explicit tracking invalidation. Those mechanisms were preserved. The missing improvements from `f9258e7` were:

- Stable `geometryIdentity` in both initial construction and periodic `pathGeometry` refreshes. Previously each refresh supplied a new vector array as identity, resetting and recreating the entire trail. The accepted route section is now the identity; route, section, anchor, and floor changes still dispose/rebuild deliberately.
- Arrow-visibility sampling at most every 200ms, including camera-frustum checks, and an 800ms sustained-missing window before offering recovery. Short occlusions and ordinary camera turns do not invalidate the anchor.
- Reuse and bind the Align Route button exactly once; restore legacy inline hiding, inject it during activation/recovery, and keep it above the camera layers.
- Respect automatic-calibration gates, report failed calibration accurately, accept both XR tracking-event shapes, and retry initial calibration when tracking becomes ready. A valid anchor is not automatically recalibrated just because arrows are out of view.

Not imported: source-branch diagnostic panels/markers, general diagnostics instrumentation, venue-loading changes, arrow density/size settings, arrival-policy or movement calculations. The current parent-physical-walk authority and its strict committed arrival remain intact.

## Exact Align Route behavior

All of the following are required for the recovery button to be visible:

1. A route and active AR camera/scene exist; AR is not parked and navigation has not arrived.
2. XR tracking is `NORMAL`, with a tracking observation no older than 3000ms.
3. Independent raw compass evidence is available and no older than 1500ms. Its shortest angular difference from the current route target bearing is at most 30 degrees, including north wraparound. That facing condition must hold for at least 300ms. Unknown/stale heading and turning outside the tolerance hide the button immediately; returning requires the facing dwell again. Route-derived or assumed heading is never used to prove correct facing.
4. Recovery is needed: the world was invalidated by tracking loss/pause/resume/recenter/floor change, or the calibrated route's arrows have been continuously absent from view for at least 800ms while facing the route. Missing arrows during the existing intentional end-of-route clearing window (1.8m) do not offer recovery.

The 200ms visibility sample cadence means disappearance recovery appears on the first sample at or after 800ms; this is not an exact wall-clock alarm. Misalignment is detected through world invalidation or missing expected arrows, not claimed as automatic measurement of arbitrary visible positional drift.

A click rechecks active session, fresh tracking, and correct fresh facing. Failure does not mutate the anchor or navigation. A successful click anchors the route at the existing committed route position and current camera pose, preserves an existing valid same-floor ground estimate, rebuilds the visuals once, and hides the button. After tracking invalidation it uses the existing estimated-floor-height policy. It does not reset metres, session ID, route geometry, arrival, the physical GPS watch, or the 2D dot. Subsequent accepted walking increments continue through the same shared 2D/AR progress stream.

No height prompt, automatic world recentering on a short disappearance, or independent walking-distance calculation is introduced. Camera/SLAM continues to serve world rendering and heading; it is not simulation progress evidence.

## Acceptance tests

| Scenario | Required result | Coverage |
| --- | --- | --- |
| Routine refresh with freshly allocated vector arrays | Same trail group, mesh identities, world transforms, yaw, and anchor revision; no mesh creation | `spatial-alignment.test.ts`: stable refresh acceptance |
| Entire 40m route with stable geometry identity | Replenish every 2m mark, at most six arrows, fixed grid, no group rebuild | `trail-stability.test.ts`: full-route replenishment |
| Threshold jitter, camera turns/shake, parallel corridors | Retain slots/positions; camera projection must not advance navigation | Existing `trail-stability.test.ts` sequences plus shared-progress tests |
| Short disappearance / normal camera turn | Button remains hidden; anchor revision unchanged | `spatial-alignment.test.ts`: visibility debounce and wrong-facing cases |
| Sustained disappearance while facing correctly | Recovery appears only after 800ms and facing dwell; hides when arrows return | `spatial-alignment.test.ts`: missing-arrow acceptance |
| Wrong, missing, stale, or changed heading | Button hidden; a stale/direct click fails without recalibration | Parameterized heading acceptance, 1500ms freshness and wraparound tests |
| Tracking loss/recenter/pause/resume | Clear stale geometry once; hide control during bad tracking; require explicit valid recovery | Existing XR pipeline tests and idempotent invalidation acceptance |
| Valid world with absent ribbon | Repeated auto-calibration retries never re-anchor it | Bootstrap safeguard acceptance |
| Failed initial calibration | Report failure; no automatic override of manual recovery | Bootstrap safeguard acceptance |
| Reused/preexisting hidden button | One click handler; legacy hiding removed when eligible | Reused-button acceptance |
| Arrival, final intentional clearing, parked AR | No recovery prompt | Terminal/parked-state acceptance |
| Recalibration during physical walk at an L-turn | Anchor at committed position; same session/metres/authority; six arrows restored; next increment advances both | `physical-walk-progress.test.ts`: actual engine + child navigator + calibration |
| Arrow design and lifecycle | Preserve current dimensions, 2m spacing, six-arrow cap, tangent orientation, fade and disposal rules | Existing `trail-rendering.test.ts`, `spatial-alignment.test.ts`, `physical-walk-progress.test.ts` |
| AR open/close/reopen, stationary and competing GPS | Same physical session/watch, shared progress held without accepted movement, committed-only arrival | Existing MapApp physical-walk AR integration tests |

The deterministic tests use the existing offline Three.js constructor doubles. The optional real-Three perspective-frustum case is skipped when that runtime is unavailable. Physical camera, compass accuracy, and real-device visual tracking still require phone verification; these tests do not establish real walking-distance accuracy.

## Files changed for this port

- Runtime: `ar-nav/js/spatial-alignment.js`, `xr-nav-scene.js`, `bootstrap.js`, `pathGeometry.js`, `incremental-ar-path.js`.
- UI layering: `ar-nav/css/ar.css`.
- Cache/build identity: `ar-nav/config.js`, `ar-nav/index.html`, `mappedin-pwa/src/config.ts`.
- Acceptance tests: `mappedin-pwa/src/ar/spatial-alignment.test.ts`, `trail-stability.test.ts`, `physical-walk-progress.test.ts`.
- This comparison, behavior definition, and acceptance matrix: `docs/ar-alignment-stability-port.md`.
