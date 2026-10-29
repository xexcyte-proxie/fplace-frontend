# Blue location dot: lifecycle investigation and fix

## Source-confirmed causes

The disappearing marker has multiple lifecycle causes; a device capture is still needed to attribute a particular historical occurrence.

- `MapApp.initializeVenueGpsReference()` switches BlueDot into provider-driven mode and disables native GPS. Previously, `maybeAutoStartBlueDot()` immediately returned in simulation mode, while the replacement provider started only when a route was generated. Capturing a physical reference alone did not feed a coordinate to the renderer.
- `clearRoute()` stopped the provider without restoring idle positioning. In simulation the SDK GPS watch was still disabled, leaving no ongoing position feed. This also affected periods between editing route points and generating a replacement route.
- `clearRoutePoints()` subsequently called `MapMarkerService.resetNavigationDisplay()`, which explicitly disabled the entire location marker. This could hide the dot even after idle tracking had restarted.
- Auto-start required `navigator.permissions.query` to exist and succeed despite an already-recorded successful location grant. Missing/rejecting Permissions API implementations silently prevented startup.
- Permission and sensor startup were asynchronous without sufficient map-instance/provider ownership checks. A venue replacement or navigation takeover during startup could resume the old native watch. Local-first/cache loading changes the timing and exposes these existing ordering gaps; the catalog itself does not supply dot coordinates.
- Provider updates assumed the SDK marker was already enabled and had its visible navigation appearance. A disabled marker or ambient transparent boot state could therefore persist despite accepted position updates.

## Changes

`src/services/map-app.ts` now starts the shared GPS provider for simulation independently of route existence, restores idle positioning after route clearing/editing/calculation, and guards asynchronous auto-start against map replacement and provider takeover. An existing location grant permits startup when the Permissions API is unavailable; explicit browser `denied` or `prompt` states still require user action.

`src/map/markers.ts` coalesces concurrent startup requests, invalidates pending startup on mode changes/stop/destruction, and guards late heading initialization. Accepted finite provider coordinates restore an enabled, visible marker without resetting its appearance on every update. Resetting route presentation no longer disables the location dot.

The physical GPS → fixed simulation transform → route projection → accepted display position → AR synchronization pipeline remains in place. No synthetic movement, venue-centre fallback, new route anchor, relaxed GPS quality threshold, or altered arrival threshold was introduced. Existing rendering accuracy handling was not changed.

## Legitimately unavailable positions

A simulated position requires both a real physical GPS reference and a map-space reference. The original lifecycle fix left the map reference dependent on the first route start; that restriction was subsequently removed. On venue opening, the app now chooses an actual mapped anchor on the opening floor: the selected section's mapped object when available, otherwise an exterior entrance, otherwise a stable mapped-space center. Coordinates and floor come from loaded SDK objects, not catalog latitude/longitude, camera position, or a route. The chosen object's id, name and source are retained in diagnostics. If no valid mapped reference exists, the marker is withheld with an explanation about missing map data, never a request to select a route. See [route-independent simulation](route-independent-simulation.md).

Other reasons include map not ready, permission not granted/denied/prompt, failed provider startup, stale/imprecise/invalid fixes, route-snap rejection, provider inactivity/error, and SDK rendering status. A marker on another floor or outside the current viewport is not necessarily disabled; renderer diagnostics include floor identity and floor/view agreement. Tracking does not force camera recentering or change floors solely to make a dot visible.

## Diagnostics

Console transitions use `[IndoorNav/BlueDot]` with explicit reasons. Coordinate-free lifecycle records are also included in the existing location diagnostic report (`getLocationDiagnosticReport`), including `blue-dot-availability`, `blue-dot-tracking-started`, `blue-dot-renderer-status`, and `blue-dot-unavailable`.

The development AR Debug recorder receives `blue-dot-availability` and `blue-dot-renderer` events alongside the existing GPS, transform, position, progress and AR records. `accepted-position-sent-to-renderer` means the application supplied an accepted frame; it is intentionally not a claim that pixels were visible on the physical screen.

## Files and validation

Changed for this fix:
- `mappedin-pwa/src/services/map-app.ts`
- `mappedin-pwa/src/map/markers.ts`
- `mappedin-pwa/src/map/markers.test.ts`
- New `mappedin-pwa/src/services/blue-dot-lifecycle.integration.test.ts`
- This document

Regression run: **343 passed, 1 skipped, across 40 files**, covering services, marker rendering/lifecycle, position providers, simulation transforms, navigation progress and AR. New cases cover unavailable Permissions API, explicit denial, stale map startup, provider takeover, concurrent subscriptions, missing simulation anchor, idle tracking restoration, disabled-marker recovery, invalid-coordinate rejection, and retaining the location marker on route reset. The skipped case requires a real Three.js runtime for frustum testing.

TypeScript and the production Vite/PWA build pass. Build warnings concern existing bundle size and third-party pure annotations. `git diff --check` passes.

Physical iPhone verification remains necessary: test a cached venue with previously granted location, rapid venue changes, route clear/reset and regeneration, walking with a fixed simulation reference, background/foreground recovery, and AR handoff. No physical-device rendering result is claimed here.

## Compass glow restoration (2026-10-29)

The original SDK heading cone and its visual settings remain in use (`#2266ff`, opacity `0.85`, `displayWhenInactive: true`). No replacement marker or coordinate transformation was introduced.

The heading-specific lifecycle had survived the earlier blue-dot fixes: route presentation cleanup still called `disableHeading()`. Returning to the same provider mode could then skip restarting the orientation watch. Additionally, the simulation preference alone was treated as proof that compass data was available, suppressing provider heading updates even when the watch had failed or had not settled. Disabling the SDK marker releases its sensor resources, so leaving provider-driven mode must also clear our cached compass-active state.

Route cleanup now retains the compass subscription. Heading startup is coalesced and retried when appropriate; generation checks keep stale startup/shutdown work from affecting a newer watcher. The location button primes the existing orientation watcher synchronously in the tap handler, before permission/GPS awaits, to retain the user gesture required by iOS. Compass preference takes precedence only once the watch is active and its existing filter has settled. Existing circular smoothing and the animation-frame renderer remain unchanged.

The SDK receives geographic heading and handles map bearing itself; no second bearing adjustment or simulation translation is applied to compass angles. Compass rendering sends heading-only, silent SDK updates, without latitude/longitude or positioning callbacks. Turning the phone cannot itself supply navigation progress or arrival evidence. The development location-button summary now includes compass active/pending/locked state, device/displayed headings and SDK cone state.

Regression coverage in `src/map/markers.test.ts` and `src/services/my-location.integration.test.ts` covers map rotation, stationary coordinates, original cone styling, route cleanup, same-mode restart, return to native positioning, denied compass fallback, stale disable completion, and gesture-time startup. The focused positioning/lifecycle/navigation diagnostics run passes 139 tests across 18 files; TypeScript and production build also pass.

Physical-device verification remains required: on iOS and Android, grant location and orientation permissions, turn the stationary phone through north, rotate the map, start/end/clear a route, and repeat with development venue simulation enabled. Confirm the original glow turns smoothly, stays attached to the stationary dot, respects map rotation, and continues after navigation. Check denied orientation permission and retry with a location tap. Browser mocks cannot establish sensor calibration, platform permission behavior, rendering appearance or actual compass accuracy.

## Location-button to continuous-watch handoff (2026-10-29)

### Confirmed causes and interpretation of the supplied trace

- A fresh 35m fix was rejected by `handleDiagnosticProviderFrame()` because it used the **30m navigation limit** for all rendering. The location button separately submitted its fix directly to the SDK, so successful button placement could be followed by continuous positioning rejecting every subsequent reading. The SDK then receives no new accepted positions and reaches its existing 30-second inactivity timeout.
- `PositionProvider.isRunning` means a subscription/session exists. Timeouts, missing recent fixes, rejected accuracy, or rejected route snaps can make application positioning inactive while that subscription remains running. This was not proof of two conflicting providers. Reports now show subscription state, provider signal status, positioning status/reason, and marker availability separately.
- Switching out of provider-driven mode called SDK `disable()`, which releases renderer/sensor resources. Switching back enabled the marker in its initial hidden state, requiring another acceptable coordinate. A failed/poor subsequent watch could therefore leave a previously placed marker hidden. Handoffs now retain the renderer and compass; explicit stop/destruction still cleans up resources.
- `tracking: false` was a native-watch flag, but renderer events treated it as “off” even in provider-driven mode. Provider-driven renderer events now remain meaningful without claiming a native GPS watch is running.
- The button's final unconditional `blueDotStatus: active` could overwrite an error/inactive callback from the continuous watch during initialization. Position acceptance is now recorded before starting that watch, so subsequent watch failures remain authoritative. A later successful explicit tap restarts a previously failed continuous provider even if its subscription flag remained true.
- GPS-watch errors cleared cached coordinates used by the provider's compass stream. Errors now retain that context, with **the original GPS timestamp**, and compass frames explicitly carry `headingOnly: true`. They cannot renew provider health, restore live-position status, move the dot, or supply navigation/arrival evidence.
- Idle GPS simulation previously assigned the currently browsed floor on each fix. It now retains the simulation anchor's mapped floor. Get Current Location selects that floor when centering. Navigation keeps its existing route/floor orchestration rules.

**Limits of the evidence:** SDK `hidden` with no application coordinate before the first submission is normal. SDK `inactive` normally retains a grey dot; it does not itself mean the marker was removed. The installed SDK also reports hidden when the marker's floor is not visible. The supplied trace establishes rejection/inactivity, but does not independently prove a pixel-level disappearance or a particular off-floor occurrence. The new SDK/floor snapshots and device checks distinguish these cases.

### Quality, retention and navigation behavior

| Evidence | Map behavior | Navigation / arrival |
| --- | --- | --- |
| Fresh finite fix, accuracy 0–30m, acceptable route snap when required | Existing stabilized live positioning | Existing progress and stricter arrival rules apply |
| Fresh finite fix, accuracy >30–50m | Approximate, muted dot with actual reported uncertainty | Paused; no route projection, progress, arrival, floor proposal or raw AR navigation update |
| Accuracy >50m, missing/invalid timestamp or coordinate, age >15s, excessive future timestamp, timeout or unavailable signal | Last accepted coordinate remains retained and muted when available | Paused until acceptable evidence recovers |
| New compass sample with cached GPS context | Original smoothed cone turns at the retained dot | Navigation position/progress unchanged |

The 50m display limit matches the installed SDK's default accuracy threshold; the 30m navigation limit and stricter arrival thresholds are unchanged. Display-only filtering is separate from precise navigation filtering, so a coarse sample cannot seed subsequent navigation stabilization. Real GPS uncertainty is no longer capped to 30m on SDK submission. No reference is recentered, no venue catalog coordinates are modified, and a route is never needed to initialize simulation.

Retention changes marker color/state only. It does not repeatedly inject coordinates, invent a fresh GPS timestamp, reset accepted-fix age, or keep the SDK artificially “active.” The existing SDK inactive color and `heading.displayWhenInactive` remain in use. AR compass updates use the unchanged trusted route position/clock; approximate display coordinates cannot replace AR navigation coordinates. Valid accepted readings restore live presentation.

### Compass and diagnostics

The original cone color, opacity, glow, circular filter, animation and geographic-heading/map-bearing alignment remain unchanged. Handoffs preserve its watcher. Orientation denial or absent sensor samples still legitimately produce `deviceHeading: null`; no north-facing value is fabricated. Diagnostics now include watcher active/pending state, filter lock, last heading event time, startup error, displayed heading and cone state.

`[IndoorNav/BlueDot]` availability records include the marker snapshot: SDK/application coordinates, SDK status, retained/live/approximate presentation, original GPS timestamp and age, last submission time, actual accuracy and both floors. The complete current location/lifecycle report is copyable with `copy(window.FplacesLocationDiagnostics.exportAll())`; `export()` retains its original meaning of the latest completed button interaction. The interface is registered at development app startup, independently of venue opening or location taps. Production/preview builds intentionally omit it. See [location-button-console-diagnostics.md](location-button-console-diagnostics.md) for frame selection, runtime status, real-browser verification and PWA-cache recovery. Detailed snapshots and console location summaries remain development-only.

### Validation and device checks

Regression tests exercise the actual MapApp → GpsPositionProvider → MapMarkerService lifecycle with the browser geolocation and SDK boundaries mocked: place a 35m fix without a route, fail the watch with timeout/unavailable/permission-denied, retain its coordinate and age, rotate the original compass, reject stale/200m samples, and recover on a fresh 5m fix. Additional tests cover same-mode/native handoffs, early watch failure versus button completion, retry of failed watches, floor browsing/centering, approximate-versus-navigation quality, heading-only provider health, unchanged AR progress and original cone appearance.

The combined positioning, marker, location-button, lifecycle, UI, diagnostics and AR regression run passes **254 tests, with 1 existing skip across 23 files**. The skipped test requires a real Three.js PerspectiveCamera unavailable in its current test mock. TypeScript/production Vite-PWA build and `git diff --check` pass; existing bundle-size/third-party annotation warnings remain.

On physical iOS/Android devices, verify the visible dot and glow before/during/after navigation, deny/regrant orientation permission, switch floors then recenter, interrupt/recover GPS, and background/foreground the browser. Confirm grey retained/approximate presentation versus blue live positioning, GPS uncertainty, smooth compass turns with fixed coordinates, paused travel/arrival during weak/stale GPS, and synchronized AR recovery. Sensor calibration, browser permission recovery, actual SDK pixels/occlusion and indoor GPS accuracy are not established by automated mocks.
