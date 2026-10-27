# Phase 3 — arrow visibility and camera motion stability

Date: 2026-10-27. Two deterministic instability mechanisms were reproduced and corrected. The reported physical-device incident has **not** been reproduced on a handset here; field validation remains required.

## Evidence and diagnosis

### 1. Arrow membership oscillation

Before changing the implementation, the existing spawn resolver and Phase 2 visual-progress deadband were evaluated with this input sequence:

| Navigation distance | Visual distance after deadband | Selected marks |
| --- | --- | --- |
| 5.0 m | 5.0 m | 6, 8, 10, 12, 14, 16, 18, 20 |
| 5.4 m | 5.4 m | 8, 10, 12, 14, 16, 18, 20 |
| 5.0 m | 5.0 m | 6, 8, 10, 12, 14, 16, 18, 20 |

The 0.4 m changes exceed the existing 0.35 m deadband. The stateless grid boundary removes mark 6 immediately, then recreates it when progress reverses. Recreating the instance restarts its 280 ms fade. At 120 ms updates this can look like flicker rather than walking progress.

The regression test retains a reproducible pre-fix mode (`trailMembershipStableMs: 0`). For `[5, 5.4, 5, 5.4, 5]`, diagnostics record **two removals and three creations of slot `seg:6`**. With the new default, twenty alternating samples preserve the exact original objects with **zero removals**. A sustained forward sample subsequently removes only the passed slot; deliberate backward travel restores the appropriate slot without replacing unchanged instances.

This proves a lifecycle mechanism under synthetic progress jitter. It does not prove that the phone incident used this progress source or noise pattern.

### 2. Heading-only assumed walking

Inspection of `RouteNavigator.effectiveMoveSpeedMps()` found an unrelated contributor: an untrusted GPS snap with zero measured speed returned **0.55 m/s** when the phone faced within 40 degrees of the route, and zero when facing away. This was reproduced using the actual navigator method before editing it. Its result feeds progress extrapolation and distance smoothing, so stationary rotation could change displayed progress when fusion was unavailable.

The method now returns measured speed only, or zero. A regression runs the actual display-progress method with headings `0, 20, 180, 0, 10, 0` and zero movement: distance stays at 5 m. Giving it measured speed of 1 m/s advances it to 6 m after one second. The parent simulator clock remains separate and is covered by another regression. Arrival thresholds, arrival latches, maneuver logic, and payload formats were not changed; removing fabricated walking can naturally change the time at which inferred progress previously reached a threshold.

### 3. Visibility without lifecycle changes

Phase 1's camera-depth fade is orientation-dependent by design. A stationary camera viewing a point 2 m forward produces:

| Camera yaw | Camera-space depth | Fade multiplier |
| --- | --- | --- |
| 0° | 2.000 m | 1.000 |
| 60° | 1.000 m | 0.333 |
| 70° | 0.684 m | 0.000 |
| Back to 0° | 2.000 m | 1.000 |

This changes visibility without removing a mesh. Separately, the renderer naturally culls objects outside its frustum. A real Three.js perspective-camera test turns 180° away and back, verifies frustum exit/reentry, and checks that instance IDs and world positions stay unchanged. Neither behavior is treated as a lifecycle bug. Depth fading, arrow style, and camera compositing remain unchanged.

### Other inspected paths

- Phase 2 already prioritizes navigator distance over camera projection. Camera-only movement across parallel/hairpin branches can jump the nearest projection, but deterministic tests show it does not replace authoritative visual progress or change arrow IDs when navigation progress is fixed.
- Phase 2's route/section/anchor revision invalidation remains in force. Normal rotation does not change that identity. No new route hashing runs in a frame loop.
- The 120 ms trail refresh controls reconciliation frequency; it is distinct from per-frame depth fading and diagnostic sampling.
- SLAM prediction uses camera translation projected on the calibrated route bearing. The diagnostics read its existing fused-distance value without calling a mutating update method.
- XR8 NORMAL/LIMITED status, pause/resume and recenter handling remain as verified in [Phase 2](ar-spatial-phase-2.md). Phone angular velocity is not used to infer tracking failure.

## Stability mechanism

Only noncritical **slot membership** is temporally stabilized. A different desired set must remain unchanged for `trailMembershipStableMs` before additions/removals commit. Default: **180 ms**, clamped to 0–500 ms; zero disables it for diagnosis. With 120 ms reconciliation, a change normally commits 240 ms after its first candidate sample (up to approximately 360 ms after physical input, excluding frame stalls).

Initial construction, route replacement, anchor changes, floor-section changes, arrival clearing, and tracking invalidation bypass the wait. They reset pending membership. During the wait, existing instances remain in world space and retained placements can still update their transforms. No camera-following overlays, forward-only clamp, extra projection-continuity algorithm, motion classifier, or long-lived hidden arrow pool was added.

Tradeoff: a passed slot can remain briefly during the stability interval. Existing near-camera fading still applies. Noise that stays on one side of a boundary longer than the interval may still change membership. Continuous camera-only projection ambiguity remains a limitation if navigator progress is unavailable; the trace identifies that source instead of pretending to solve localization.

## Development diagnostics

Diagnostics are off by default. They require an explicit developer opt-in and do not log to the console, persist data, or send network requests.

Enable in the **AR iframe's** remote-debugger console:

```js
FplacesTrailDiagnostics.setEnabled(true)
```

Alternatively append `arTrailDebug=1` to the AR iframe URL, preserving its other query parameters. This is not a parent-page query flag. Runtime enable/disable clears the buffer. Export before disabling:

```js
const traceJson = FplacesTrailDiagnostics.export()
// Save/copy traceJson using the remote debugger.
FplacesTrailDiagnostics.setEnabled(false)
```

Capture includes:

- Camera world position and yaw/pitch/roll in radians (YXZ Euler decomposition).
- Camera-projected distance, resolved local navigation distance, visual distance/source, parent distance, navigator display distance, and a read-only fused-distance snapshot. Global and section-local distances have different origins; use route section metadata when comparing them.
- Route ID/version, local visual-route revision, active section ID, anchor revision and calibration validity.
- XR8 tracking status (`NORMAL`, `LIMITED`, or `UNKNOWN`); this is not a numerical confidence estimate.
- Unique instance IDs, slot keys, along-path positions, world positions, mesh visibility, opacity, and mesh/frustum intersection.
- Create/remove events with reasons: slot-window change, arrival window, route replacement, anchor revision, section change, calibration, tracking interruption, or disposal.
- Exact depth-visibility toggle timestamps at processed frame updates, and time since the preceding toggle. Frustum/combined visibility transitions are sampled at 200 ms intervals and can miss shorter excursions.

`null` pose angles/frustum fields mean the required camera math was unavailable, not that the object was off-screen. In normal XR8 operation the existing Three.js camera supplies these matrices. Tracking invalidation is recorded immediately, including when no arrows remain to sample.

Storage is capped at **512 records**, overwriting the oldest. Capture short individual scenarios and export promptly, especially during rapid shaking. Disable clears retained records and per-instance diagnostic state.

## Performance

Production adds a bounded slot signature comparison at the existing 120 ms reconciliation rate and an integer instance ID per new arrow. Membership state consists of committed/pending signatures and a timestamp. No route-length hashing, full-scene traversal, or frustum calculations execute while diagnostics are disabled. Mesh count remains capped by Phase 1 settings.

Enabled diagnostics sample at most 5 times per second, inspect only active arrow meshes, and reuse camera/frustum math objects. Lifecycle/depth-toggle events are recorded when they happen. The buffer is bounded, but logging/allocation still has a cost; compare device frame timing with diagnostics off before release. No physical-device frame-time benchmark was performed.

## Files changed for Phase 3

- `ar-nav/js/trail-diagnostics.js` — new bounded opt-in trace.
- `ar-nav/js/incremental-path-spawn.js` — pure membership stability gate.
- `ar-nav/js/incremental-ar-path.js` — gate integration, instance IDs, lifecycle and visibility events.
- `ar-nav/js/pathGeometry.js` — visual progress diagnostics and disposal reasons.
- `ar-nav/js/world-route-scene.js` — diagnostic identity and explicit invalidation reasons.
- `ar-nav/js/spatial-alignment.js` — tracking invalidation trace and reason propagation.
- `ar-nav/js/slam-pose-bridge.js` — read-only fused-distance accessor.
- `ar-nav/js/route-navigator.js` — remove heading-only assumed walking.
- `ar-nav/js/xr-nav-scene.js` — label calibration disposal reason.
- `ar-nav/config.js`, `ar-nav/index.html` — stability setting and cache-versioned script loading.
- `mappedin-pwa/src/ar/trail-stability.test.ts` — deterministic movement, lifecycle, tracing, and frustum tests.
- `mappedin-pwa/src/ar/trail-rendering.test.ts` — existing lifecycle test now waits for stable membership.

The generated `mappedin-pwa/public/ar/` mirror is synchronized with source. Mappedin calculation, navigation serialization, geographic conventions, XR8 pipeline order, compositing, floor-transition contracts, and Phase 1 visual geometry are preserved.

## Automated results

- Broader AR/routing/navigation-presence regression suite: **168 passed, one skipped**, across 16 files. The skipped case requires actual Three.js camera/frustum math.
- Same rendering/spatial/stability tests with Three.js **0.160.0**: **50 passed**, including that frustum case.
- TypeScript check: passed.

Commands:

```sh
npm test --prefix mappedin-pwa -- src/ar src/routing src/services/navigation-presence.integration.test.ts --exclude '**/*.e2e.test.ts'
FPLACES_TEST_THREE=/tmp/fplaces-three-0.160.cjs npm test --prefix mappedin-pwa -- src/ar/trail-stability.test.ts src/ar/trail-rendering.test.ts src/ar/spatial-alignment.test.ts
cd mappedin-pwa && ./node_modules/.bin/tsc --noEmit
```

The optional Three.js build is a temporary local validation artifact, not a new application dependency. Offline tests use existing constructor doubles. SDK tracking events are mocked; neither test mode establishes physical SLAM accuracy. Live backend E2E tests were excluded.

## Physical-device validation

On iOS Safari and Android Chrome, use HTTPS and record handset/browser, route ID, floor, calibration model, and whether navigation is parent-authoritative or camera fallback. Select the AR iframe in remote debugging, enable diagnostics, and capture/export each short scenario separately:

1. Hold steady facing the route: IDs and world positions should remain fixed at stationary navigation progress.
2. Rotate slowly left/right: compare depth visibility and frustum status with create/remove events.
3. Rotate 180° away: off-screen arrows should keep their IDs. Return and verify their old world positions.
4. Tilt up/down: expect frustum/depth changes, not unrelated route selection.
5. Shake/rotate rapidly: look for tracking invalidation versus depth toggles versus actual slot churn. Do not infer tracking loss from motion alone.
6. Walk sideways facing the route: compare parent distance with camera projection and fused distance.
7. Move away from the path: test nearest-projection ambiguity without accepting camera-only changes as parent movement.
8. Walk backward: after a sustained distance change, passed slots should return without replacing unchanged slots.
9. Return to the original orientation and position: distinguish a stable world anchor from a fresh calibration/route revision.
10. Interrupt/resume tracking or background the browser: stale arrows must clear immediately; recovery still requires Phase 2's valid manual alignment.

Also repeat same-floor rerouting with identical endpoints, a hairpin/parallel corridor, manual recalibration, arrival, and floor changes. Compare `trailMembershipStableMs = 0` with 180 only in a controlled stationary diagnostic test; restore 180 afterward. Check measured frame time and resources with diagnostics disabled.

The real-world report is considered validated only after these traces identify the handset cause and confirm the corresponding behavior. Remaining limitations include camera-fallback projection ambiguity, longer-duration positioning noise, existing camera-depth fading, unverified physical ground accuracy, and absent real-world occlusion.
