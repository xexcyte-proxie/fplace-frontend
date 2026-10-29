# Get Current Location console diagnostics

Run the Vite development app (`npm run dev --prefix mappedin-pwa` from the repository root), open its HTTPS development URL, and select the **top/main app frame** in DevTools, rather than the AR iframe. Enable Info/Warnings/Errors and filter for `Fplaces:`. The console interface is installed at app startup, before venue selection, permissions, map initialization or button interactions. Tap Get Current Location to add an interaction trace. Each tap receives a `location-<timestamp>-<sequence>` interaction id.

Live steps use `[Fplaces:Location]`, `[Fplaces:Simulation]`, and `[Fplaces:BlueDot]`. On completion, expand the grouped **complete diagnostic trace**. It contains the initial state, a step/timing/status table, every step's actual values, and a **COPYABLE DIAGNOSTIC SUMMARY** as JSON. Failures, map-not-ready, permission gates, stale map results and missing simulation anchors also produce a summary. Groups open only on completion so overlapping requests do not become nested across asynchronous operations.

## Copy a report

In Chrome DevTools, copy the **complete current location report**:

```js
copy(window.FplacesLocationDiagnostics.exportAll())
```

This combines current venue/simulation/provider/blue-dot state, recent lifecycle events (including failures **after** a button tap), completed and in-progress interactions, sampled positions and the navigation diagnostic report. It works before any button interaction; unavailable sections are null or empty. It reads diagnostics only and never requests GPS or starts navigation.

For just the most recently completed button interaction, retain the original command:

```js
copy(window.FplacesLocationDiagnostics.export())
```

Inspect the running mode, module URL, boot time, frame and service-worker controller/registrations:

```js
await window.FplacesLocationDiagnostics.status()
```

List retained interactions and copy a specific one:

```js
window.FplacesLocationDiagnostics.list()
copy(window.FplacesLocationDiagnostics.export('location-<timestamp>-<sequence>'))
```

The trace prints the exact command with its actual interaction id. If the browser does not provide the DevTools `copy()` helper, evaluate `window.FplacesLocationDiagnostics.exportAll()` and copy the returned JSON string, or copy the JSON printed in the console group.

Clear retained summaries:

```js
window.FplacesLocationDiagnostics.clear()
```

Only the last ten completed and ten in-progress button reports are retained in memory; lifecycle and navigation histories retain their existing bounded limits. `clear()` clears button interaction history only. Refreshing the page clears them. Console entries already printed must be cleared using the console's own Clear action. The app does not write these summaries to storage, upload them, or automatically access the clipboard.

## Values to inspect

- **Initial context:** selected venue name/id, original catalog latitude/longitude, loaded map id, permission, provider source/running state, current map floor and camera center. Original catalog coordinates remain distinct from the simulation reference.
- **Simulation reference:** physical origin, paired SDK map anchor and floor, map-object source/id/name, reference revision and capture time. The physical origin is the physical geographic reference for the selected map anchor; it is not a claim of actual indoor presence.
- **GPS response:** exact browser latitude, longitude, accuracy, `GeolocationPosition.timestamp` in milliseconds and ISO form, fix age, speed and course. Acquisition metadata reports whether the existing relaxed-accuracy timeout retry was used and the permitted cache age. The location action also receives the original GPS timestamp in every build for quality checks; diagnostic observer availability cannot change freshness decisions. Receipt time is not substituted for the GPS timestamp.
- **Transformation:** physical input, physical origin, map origin, anchor provenance, signed east/north offsets in metres (plus SLAM X/Z), physical latitude/longitude deltas, calculated map coordinates and inverse physical-coordinate check. Origin coordinates are immutable during this interaction; logging does not recenter them.
- **Blue dot:** coordinate supplied to rendering, immediate and final SDK coordinates, application coordinate, SDK accuracy/status, enabled/configured visibility/color, tracking/following/provider mode, marker floor and visible floor, and distance from the calculated position. `matchesExpectedWithin1cm` compares the SDK coordinate with the calculated coordinate using a one-centimetre numeric tolerance; it does not imply GPS has centimetre accuracy. Mismatches or disabled/configured-hidden/off-floor states are warning events.
- **Camera:** requested position, observed camera center, floor and following state. The flow records the centering/follow request without awaiting or changing SDK camera animation behavior. `animationCompletionVerified: false` is explicit.
- **Route dependency:** route/start/destination existence at tap and completion, reference availability/source, policy that route selection is not required, and observed `determinedWithoutRoute` after transformation. Existing optional adoption of the located point as a route origin happens after positioning and is separately logged. Missing map geometry is distinct from a missing route.
- **Failures:** step, severity, elapsed milliseconds, outcome, error name/message/code, reference replacement/map replacement and available final state. Optional heading/origin failures remain warnings and do not change the existing recovery flow.

A `success` outcome means the location action completed its existing display/follow path. It does not certify visible pixels or completed camera animation. SDK state cannot establish viewport clipping, occlusion or physical-screen rendering. Continuous provider updates may legitimately change the SDK position after the button request; the snapshots show the state at their recorded times. Existing navigation reports remain available for longer positioning/AR timelines.

## Development-only, frames and PWA caches

`npm run build` and `npm run preview` produce/serve **production**, even when hosted on localhost. They intentionally exclude this precise-location interface. This is not enabled by a query parameter or by opening a venue. Use the Vite development server. The default dev port is 5173; preview is 4173. Ports can be overridden, so inspect the actual loaded entry (`/@vite/client` and `/src/main.ts` versus hashed `/assets/index-*.js`) rather than relying on the port alone.

If `typeof window.FplacesLocationDiagnostics` is `"undefined"`:

1. Select the top/main app frame in DevTools; the AR iframe has a separate `window`. A cross-origin iframe cannot access the parent's interface.
2. Confirm the tab is running the Vite development server, rather than an installed production PWA or preview.
3. Reload once after updating/restarting the dev server. Check DevTools for an earlier module/boot error if the app itself never initialized.
4. Inspect **Application → Service Workers** for this origin. A previous production worker can serve a cached production shell on an origin now running Vite. An old production worker also cannot update when `/sw.js` falls through to SPA HTML.

The dev server now serves `/sw.js` as uncached JavaScript that activates and unregisters **its own registration**. It has no fetch handler, deletes no caches, and contains no forced navigation. Existing production update checks can retire a worker left on a development origin; reload the tab once if it still displays the old page. Production service-worker behavior remains unchanged.

If a stale tab cannot recover automatically, in its top-frame console update only this app's root worker, then reload the page:

```js
const registration = await navigator.serviceWorker.getRegistration(location.origin + '/');
if (registration?.active?.scriptURL === location.origin + '/sw.js') await registration.update();
// After the worker update has completed, reload this tab once.
```

Do not clear all site data: that is unnecessary and would remove authentication/preferences. Clearing an API's button history also cannot change which bundle is loaded.

All precise trace collection, current-state reads and console installation remain guarded by `import.meta.env.DEV`. Production JavaScript asset inspection confirms the console API is absent. The exported complete report explicitly contains precise development locations and absolute navigation coordinates; nothing is uploaded or automatically persisted.

## Verification (2026-10-29)

- **Actual isolated Chrome, development:** opened `https://localhost:5173/` through the real app entry, with no location tap or selected venue. `status()` returned `development: true`, API version 2, the source-module URL and no controller. `exportAll()` returned parseable JSON with runtime, current state, lifecycle, completed/in-progress interactions, positioning and navigation sections. The exact synchronous `copy(window.FplacesLocationDiagnostics.exportAll())` console expression completed without exception (the helper normally returns undefined).
- **Actual Chrome, production preview:** opened `https://localhost:4173/`; observed a hashed entry asset and an active `/sw.js` controller. The console interface was undefined, as intended.
- **Actual Chrome, same-origin recovery:** stopped preview and served Vite development on that same test origin. The old worker retired and the page recovered to the development entry with no controller and the export API available. Re-ran the exact copy expression successfully. Separately registered the development retirement worker in the isolated profile and observed an empty registration list afterwards, without navigation or loss of the API.
- **Automated:** 30 focused tests pass across the console trace, location-button integration and lifecycle report suites. Coverage includes bootstrap before any map, current venue/navigation reads, post-tap watch events, in-progress traces, original per-interaction exports, service-worker status reads, error isolation, history limits and production suppression. TypeScript/production Vite-PWA build and `git diff --check` pass.

The isolated browser reached the welcome screen and was not signed into a venue. Authenticated venue opening and an active physical navigation session were not exercised in that browser; dynamic venue/navigation state is covered by regression tests. Physical GPS, rendered glow, Safari clipboard transfer and the user's existing installed-PWA session still require device/session verification. No GPS, blue-dot, simulation transform or navigation behavior was changed for this diagnostics fix.
