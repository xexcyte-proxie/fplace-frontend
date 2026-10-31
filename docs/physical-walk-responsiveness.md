# Physical Walk Demo responsiveness

This change tunes Physical Walk Demo movement acceptance and its presentation interpolation only. Accepted coordinates remain the original, unsnapped physical-to-venue result. Route projection, arrival, venue loading, coordinate transformation, AR and production GPS thresholds were not changed in this pass. Independent compass/glow handling is unchanged.

## Tuning

The single default configuration is `mappedin-pwa/src/position/physical-walk/tuning.ts`. Movement/session and interpolation constructors also accept typed configuration for isolated tests/experiments. Runtime defaults use this file; there is no new settings UI.

| Setting | Previous | New |
| --- | --- | --- |
| Isolated deadband minimum | 2m | 1.2m (-40%) |
| Isolated deadband accuracy multiplier | 0.5 | 0.3 (-40%) |
| Sustained evidence window | 10,000ms | 5,000ms |
| Sustained minimum net displacement | 2m | 1.4m (-30%) |
| Sustained median-accuracy multiplier | 0.20 | 0.14 (-30%) |
| Accepted incremental displacement floor | 0.5m | 0.35m (-30%) |
| Incremental current-accuracy multiplier | 0.05 | 0.035 (-30%) |
| Animation duration | 180–800ms; 0.8 × target interval | Unchanged; centralized |

The effective deadband is the maximum of its floor and accuracy-derived distance. Sustained evidence still requires at least four samples spanning three seconds, efficiency >= 0.85, low regression residual, and fitted speed between 0.2 and 4m/s. The residual-derived minimum remains 3 × residual; reported GPS accuracy is not improved or discarded. The sample cap remains 16.

A 5-second window contains only 1.25m at 0.25m/s, less than the new 1.4m startup requirement. Once walking has been independently accepted, a continuation rule permits net displacement >= max(70% of the sustained threshold, 3 × residual). It additionally requires the same trajectory consistency tests, a movement acceptance within 5 seconds, no recovery anchor, and the incremental displacement threshold. The isolated two-fix coherent confirmation path remains available to establish slower walking.

With enough recent evidence, fitted speed below 0.2m/s now also blocks that isolated confirmation path. This prevents sufficiently slow stationary drift from eventually exceeding the smaller deadband and being accepted merely because two distant samples agree. Extremely slow real walking can also be held; this is a deliberate uncertainty tradeoff.

No path-length accumulation is used to publish movement. Net displacement is measured from GPS observations; cumulative path length is only a trajectory-efficiency check. Accuracy, fix freshness, duplicate/out-of-order handling, jump checks, origin capture, signal degradation and consecutive recovery requirements remain intact.

## Rendering and diagnostics

`PositionInterpolation` now starts each replacement animation from the last coordinate successfully submitted by the renderer, rather than extrapolating the old animation to the new callback time. Reading an interpolation sample for diagnostics cannot change this acknowledgement. Repeated identical targets do not restart the animation. Animation generations invalidate cancelled or obsolete callbacks, including callbacks queued before demo shutdown. The renderer still submits SDK updates with animation disabled, preserving a single presentation animation loop.

Accepted authority is updated independently of displayed frames; animations never generate GPS evidence, route progress, speed or arrival. The layer stops at the final accepted endpoint. A submitted SDK coordinate is observable; this does not certify the exact painted pixel on a physical device.

The recorder now includes a `session.config` event with the tuning values, per-decision sample counts/consistency/continuation evidence, effective thresholds and reason, first-movement delay, intervals between accepted movement timestamps, and accepted GPS/delivery intervals. Existing physical latitude/longitude redaction and heading-event throttling are preserved.

## Verification

- 225 tests across 25 files passed: position/Physical Walk Demo, routing, physical-walk integration and marker regressions. The live backend guest-routing E2E test was excluded; no live backend result is claimed.
- TypeScript: `npx tsc --noEmit` passed.
- Production builds with demo/diagnostics/overlay enabled and disabled passed. Vite retains the existing large-chunk advisory.
- `git diff --check` passed.
- Pre/post SHA-256 comparison confirmed `navigation.ts`, `map-app.ts`, `transform.ts`, `route-progress.ts` and `snap-along-continuity.ts` unchanged.

New deterministic cases cover 0.4m/s small-step walking, 0.25m/s walking, 600 stationary jitter observations, 120 seconds of 0.05m/s stationary drift, pauses/resumption, configuration isolation, diagnostic redaction and intervals, consecutive interpolation targets, missed frames, duplicate endpoints and cancelled animation callbacks. Existing heading-only, recovery, coordinate and route regression tests remain passing. The prior test reproducing the retarget teleport now asserts continuity.

A local replay of the supplied redacted capture produced:

| Metric | Original capture | New replay |
| --- | --- | --- |
| Accepted movements | 16 | 29 |
| Held observations | 39 | 26 |
| Delay from origin capture to first accepted movement | Approximately 25s | 15.002s |

The replay reconstructs physical samples from recorded relative east/north offsets at an arbitrary physical origin. The three initial capture samples were seeded at that origin because their physical coordinates were redacted. It is a comparative filter replay, not an exact raw-GPS replay or proof that every accepted movement was real walking. No private physical coordinates were added to the repository.

## Limitations and device checks

GPS alone cannot reliably distinguish smooth positional drift from an equally smooth walking trajectory. The existing coherent 0.5m/s stationary-drift characterization still reproduces a false positive; this pass does not claim to solve it. Lower thresholds increase sensitivity to such errors. Poor accuracy can still cause long holds; animation cannot fill gaps with invented movement. Sharp turns/reversals may need new consistent evidence, and very slow walking below 0.2m/s may be suppressed.

Repeat a device test with: stationary phone/rotation, measured slow straight walking, short pauses and restarts, turns/backtracking, GPS interruption/recovery, and rapid accepted targets while the browser drops frames. Inspect the new threshold/reason/interval diagnostics alongside actual measured displacement. Existing route projection and arrival behavior was deliberately left unchanged, so this change does not resolve their separately documented limitations.

## Files changed in this pass

- `mappedin-pwa/src/position/physical-walk/tuning.ts` (new)
- `mappedin-pwa/src/position/physical-walk/movement-evidence.ts`
- `mappedin-pwa/src/position/physical-walk/session.ts`
- `mappedin-pwa/src/position/physical-walk/recorder.ts`
- `mappedin-pwa/src/position/physical-walk/render-interpolation.ts`
- `mappedin-pwa/src/map/markers.ts`
- `mappedin-pwa/src/position/physical-walk/responsiveness.test.ts` (new)
- `mappedin-pwa/src/position/physical-walk/stabilization.test.ts`
- `mappedin-pwa/src/position/physical-walk/position-investigation.test.ts`
- `mappedin-pwa/src/map/markers.test.ts`
- This report.
