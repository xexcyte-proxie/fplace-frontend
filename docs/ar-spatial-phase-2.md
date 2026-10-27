# AR navigation Phase 2 — spatial alignment and route synchronization

**Usability update (2026-10-27):** The height-entry form described below has been replaced by one-tap alignment. The centered Align route button requires the same recent NORMAL tracking and valid pose/heading, reuses a still-valid same-floor estimate, or uses the existing explicitly estimated origin-height fallback after invalidation. No height input is required. Latest usability adjustment: Align route stays hidden until the tracking gate requires recalibration and hides again on successful alignment. Off-screen arrows and normal camera motion do not request recalibration. Chevrons now render at 0.975 m × 0.78 m (1.3 XZ scale), with their prior 1.12 height scale retained to preserve thickness; spacing and design are unchanged. The remaining text records the original Phase 2 implementation.

Implementation date: 2026-10-26. This is an engineering implementation with automated verification, **not a claim of physical ground accuracy or a completed mobile field trial**.

## Runtime capability investigation

The application loads Three.js 0.160.0 and `@8thwall/engine-binary@1/dist/xr.js` from jsDelivr. XR8 loads the SLAM chunk dynamically. The CDN major version is floating; it is not an installed, lockfile-pinned SDK. The exact loader and SLAM chunk served during this audit were downloaded and inspected before implementation:

| Artifact | SHA-256 |
| --- | --- |
| `dist/xr.js` | `b3973936862f4cb77ae32d24f253d8a0e8b1de4fa2a0cf688833742889ee829d` |
| `dist/xr-slam.js` | `398f675c920892afd4521d5196df2b6b8a1b8a90b6a5c749cf5ad1a6e0a85270` |

These were inspected locally as `/tmp/fplaces-xr8-audit.js` and `/tmp/fplaces-xr8-slam-audit.js`; temporary files are not release dependencies.

| Capability | Evidence and implementation decision |
| --- | --- |
| Camera pose | `processCpuResult.reality` exposes position and rotation; existing XR8 Three.js camera remains the pose source. |
| Tracking quality | `trackingStatus` and `trackingReason`, plus `reality.trackingstatus` with `detail.status`/`reason`. Consume `NORMAL`/`LIMITED`; unknown/missing status cannot authorize alignment. Lighting is not used as tracking confidence. |
| Pause/resume | Loader callback registry includes `onPaused`, `onResume`, `onDetach`, and `onException`. Clear spatial alignment on these lifecycle interruptions. |
| Coordinate-frame change | SLAM dispatches `reality.cameraconfigured` with `detail.recenter`. Invalidate on explicit recenter; initial configuration alone does not invalidate. No dedicated reliable relocalization-complete callback was established. |
| Hit testing | SLAM exports `XrController.hitTest(x, y, includedTypes)` returning position, rotation, type, and distance. Type names include feature points and estimated/detected surfaces. Export presence does **not** establish reliable floor surfaces on the target phones. Not used to claim floor detection. |
| Ground normal | No directly validated floor-normal measurement. Returned hit quaternion semantics and surface classification were not device-verified. Use an explicitly assumed horizontal plane. |
| Depth/occlusion | No usable real-world depth texture or obstacle mesh path was established for this integration. Real-world occlusion is not implemented. Phase 1 virtual-object depth testing remains enabled. |

Primary references: [XR controller pipeline outputs/events](https://8thwall.org/docs/api/engine/xrcontroller/pipelinemodule), [browser requirements](https://8thwall.org/docs/troubleshooting/browser-requirements), and [engine integration](https://8thwall.org/docs/engine/overview). The published browser requirements include HTTPS, WebGL, camera/orientation access, WebAssembly SIMD, Safari on iOS 16.4+, and supported Android browsers. These baseline requirements do not promise floor detection, scene depth, or accuracy on a particular handset. Safari and Android Chrome remain unverified on physical devices in this workspace.

## Ground model and tracking behavior

The persistent **Align route** button opens a form inside the AR iframe. The user stands on a flat walking surface, faces the route, enters the measured camera height in metres, and confirms while holding that height. Native browser prompts are avoided because cross-origin iframe support varies.

The explicit model is:

```
estimated floor Y = tracked camera Y at confirmation − user-entered camera height
arrow Y = estimated floor Y + configurable groundOffsetM (default 0.04 m)
```

The stored reference includes floor ID, height, assumed normal `(0, 1, 0)`, estimate kind, and `physicallyVerified: false`. Ground height and the geographic-to-world yaw/translation stay fixed as the camera moves. The yaw still uses the existing compass-first alignment and route-facing fallback. Missing/invalid heading, camera pose, height, or anchor coordinates reject calibration. No screen tap is interpreted as a measured surface.

Initial automatic alignment is allowed only with recent NORMAL tracking. Without a height measurement, it retains the old world-origin height as `estimated-origin-height`, explicitly labeled **Estimated route height**. It never says “AR locked to floor.” An initial LIMITED initialization status waits for NORMAL; degradation after valid tracking invalidates alignment.

LIMITED tracking, pause/resume, detach, runtime error, recenter, floor changes, and expired tracking samples clear scene-parented route geometry and deactivate pose fusion. A missing tracking update for over three seconds is detected by the existing 1.5-second maintenance timer (maximum detection delay approximately 4.5 seconds). Backgrounding clears immediately via the visibility handler. Recovery of NORMAL tracking does not restore old anchors automatically: the button reads **Tracking ready — Align route**, and manual confirmation is required. If the runtime does not supply recognizable tracking status, the trail stays unavailable; there is no fabricated confidence fallback.

Calibration increments an anchor revision and rebuilds transformed geometry. It no longer calls `resetProgressAtSnap`, sends synthetic simulator progress, clears completion flags, or requests parent movement. Actual arrival and maneuver advancement remain navigator responsibilities. Recalibration restores visuals only when the route/floor remains renderable and navigation has not already arrived.

## Route identity, reconciliation, and progress

`RouteNavigator.setRoute` explicitly notifies `WorldRoute` after accepted route normalization and pending progress application. A snapshot serializes the full accepted payload once, covering route identity/version, every coordinate, and leg metadata. New route references are also detected by the world renderer. An explicit `setRoute` handles in-place changes; arbitrary mutations outside route acceptance are not a supported contract.

The active render identity is the prepared section object plus anchor revision. Transformed points cache against immutable section coordinates, engine identity, and revision. Incremental trails use point-array identity instead of rounded endpoint fingerprints. Equal along-path slot keys update retained mesh position and yaw; changed visual identity disposes obsolete owned materials and destination assets. Unchanged updates neither serialize routes nor reconstruct world geometry. Shared Phase 1 arrow geometry stays shared.

Visual reveal progress uses accepted authoritative navigator distance first, then navigator display/snapped progress. Camera projection is only a fallback when no navigation distance exists. The incremental layer honors the already-resolved distance rather than replacing it with camera projection. Global distance is converted to section-local distance before placement. A symmetric 0.35 m visual deadband suppresses small oscillations; backward movement beyond it is accepted. This state only controls the trail and never writes navigation progress.

The legacy standalone `resolveTrailAlongM` helper remains for compatibility, but the active renderer uses the new navigation-first resolver. Phase 1 arrow design, spacing, caps, tangent handling, and camera fade remain intact. The existing 5 m navigator arrival threshold and 1.8 m visual-trail clearing threshold remain unchanged; they describe different behaviors.

## Floors and connectors

Prepared sections split at floor changes and route-leg boundaries, retaining actual floor IDs and same-floor shared endpoints. Selection uses current floor and global progress, not longest matching run. Repeated visits to the same floor select the appropriate progress interval; equal-distance boundaries prefer the later visit. Inter-floor edges are excluded, and intermediate floor/leg endpoints never display a destination marker.

Changing floors invalidates the height/anchor and requires realignment on the new walking surface. No elevation is inferred from floor labels. Stairs/elevators are represented by the existing navigator transition information and the horizontal approach/departure sections; no vertical or sloped connector mesh is fabricated. Ramps cannot be surface-aligned by this horizontal-only model. Ambiguous overlapping visits with identical cumulative distance need richer position/leg information; no physical separation is invented.

## Files and architecture preservation

| Files | Responsibility |
| --- | --- |
| `ar-nav/js/anchorEngine.js` | Validated height estimate, revision, configurable offset; existing east/up/south conversion retained. |
| `ar-nav/js/spatial-alignment.js` (new) | Tracking gate and explicit recovery; independent of route calculation/progress. |
| `ar-nav/js/visual-route-state.js` (new) | Event-built snapshots, floor/leg sections, visual-only progress policy. |
| `ar-nav/js/world-route-scene.js` | Route/section/revision lifecycle and cleanup; same XR8 scene and Three.js renderer. |
| `ar-nav/js/pathGeometry.js`, `incremental-ar-path.js` | Revision-aware conversion, local progress, retained transforms, intermediate-goal suppression. |
| `ar-nav/js/floor-transitions.js` | Progress-aware filtering without cross-floor joins. |
| `ar-nav/js/route-navigator.js` | Renderer notification on route acceptance and current floor before notification; arrival/maneuver algorithms unchanged. |
| `ar-nav/js/xr-nav-scene.js`, `bootstrap.js` | Existing pipeline callbacks, lifecycle invalidation, in-iframe alignment form; startup order and permission flow retained. |
| `ar-nav/config.js`, `index.html`, `css/ar.css` | Height offset, script cache revisions, calibration form styling. |
| `mappedin-pwa/src/ar/spatial-alignment.test.ts`, `trail-rendering.test.ts`, `mappedin-pwa/test-support/ar-runtime.ts` | Spatial integration tests and shared offline Three.js doubles. |

`mappedin-pwa/public/ar/` is the ignored served mirror, synchronized using the existing copy script. `mappedin-pwa/src/position/bridge.ts`, route serialization/validation, Mappedin calculation, and XR8 pipeline ordering were inspected and left unchanged. No camera restarts were introduced for rerouting. Pose fusion internals remain unchanged; the new gate deactivates them and normal calibration reactivates them.

## Automated validation

The offline suite covers same-floor reroutes, interior-only geometry changes with identical endpoints, version changes, different-floor replacement, anchor revision/height offset, initial fallback, invalid reference/retry, camera movement, noisy/reverse progress, floor/leg selection, connector destination suppression, retained transforms, resource disposal, repeated replacement/open-close, missing tracking samples, and actual registered XR8 pause/resume/status/recenter callbacks. A call-count check asserts zero route preparations/world rebuilds across unchanged movement updates.

Final results:

- `npm test --prefix mappedin-pwa -- src/ar src/routing src/services/navigation-presence.integration.test.ts --exclude '**/*.e2e.test.ts'`: **156 passed, 15 files** (including 27 new spatial tests).
- `FPLACES_TEST_THREE=/tmp/fplaces-three-0.160.cjs npm test --prefix mappedin-pwa -- src/ar/trail-rendering.test.ts src/ar/spatial-alignment.test.ts src/ar/incremental-path-spawn.test.ts`: **54 passed, 3 files**, using the exact Three.js 0.160.0 build.
- `cd mappedin-pwa && ./node_modules/.bin/tsc --noEmit`: **passed**.
- `git diff --check`, changed JavaScript syntax checks, and byte-for-byte served mirror comparison: **passed**.
- Existing `copy:ar:public` script: **completed**.

SDK-dependent tests use mocks. Optional tests use actual Three.js 0.160.0 meshes, but neither proves camera tracking or physical accuracy. Live backend E2E tests are excluded; the earlier run could not resolve the backend hostname. The in-app browser could not initialize its execution tool (`missing field sandboxPolicy`), so interactive visual QA and mobile testing remain outstanding.

## Real-device release checklist

- [ ] Record handset, browser/version, XR8 loader/chunk digests, status events, and camera permission behavior on iOS Safari and Android Chrome over HTTPS.
- [ ] Verify initial LIMITED → NORMAL, button visibility, numeric keyboard, cancel/retry, and in-iframe confirmation on both browsers.
- [ ] Measure camera height and compare arrow contact with a flat, textured floor at near/far distances. Record height error, yaw error, drift over time, and distance traveled; do not infer accuracy from screenshots alone.
- [ ] Walk straight, turn, rotate in place, lower/raise the phone, and reverse. The world anchor should remain fixed; visual progress should follow parent position without camera-noise flicker.
- [ ] Introduce poor texture, rapid motion, partial camera cover, and low light. Verify actual LIMITED events hide arrows and recovery requires realignment. Verify lighting alone does not decide confidence.
- [ ] Background/unlock Safari, interrupt camera permissions, resume, and trigger recenter. Confirm no stale trail flashes before alignment.
- [ ] Reroute on the same floor with unchanged endpoints and altered interior points; test a version-only update. Ensure route changes without restarting the camera.
- [ ] Recalibrate after moving/rotating; verify old transforms disappear and parent progress, maneuver, and arrival state remain unchanged.
- [ ] Walk A → B → A, including stairs/elevator. Verify approach/departure sections, no inter-floor arrows, no intermediate goal marker, and recalibration on each floor.
- [ ] Verify behavior on a ramp is clearly treated as unsupported horizontal estimation. Do not use this model as evidence of ramp alignment.
- [ ] Place real obstacles in view: confirm the known lack of real-world occlusion is understood. Verify virtual meshes still depth-test correctly.
- [ ] Repeat open/close and reroute at least 20 times while monitoring GPU resources, memory, frame time, and capped arrow count. Compare with Phase 1 on the same phone.
- [ ] Confirm near-destination and completed-navigation HUD behavior using the existing arrival thresholds.

No device results are marked complete in this document.
