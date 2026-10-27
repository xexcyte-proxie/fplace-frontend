# AR trail visual redesign — Phase 1

The active incremental trail now uses one shallow, unlit, vertex-colored mesh per
chevron. Its six-point silhouette is 0.75 m wide, 0.60 m long and 0.018 m deep,
without bevels or decorative overlays. Caps are teal (#14B8A6), side walls dark
teal (#0D9488). Local forward remains -Z and the existing yaw offset is preserved.

## Configuration

In `ar-nav/config.js`:

| Setting | Value |
| --- | --- |
| `trailArrowWidthM` / `trailArrowLengthM` / `trailArrowDepthM` | 0.75 / 0.60 / 0.018 m |
| `trailArrowColor` / `trailArrowEdgeColor` | 0x14b8a6 / 0x0d9488 |
| `trailArrowOpacity` / `trailArrowScale` | 0.95 / 1 |
| `incrementalPathSpacingM` / `nearFieldSpacingM` | 2 / 2 m |
| `incrementalPathMaxVisible` / `nearFieldMaxArrows` | 8 / 8 |
| `incrementalPathHorizonM` | 16 m from current visual progress |
| `nearFieldLeadGapM` | 2 m during the first meter of progress |
| `incrementalPathPassM` | 0.8 m (unchanged) |
| `incrementalPathMinSeparationM` | 1 m in horizontal world coordinates |
| `trailTangentSampleM` | 0.75 m either side of a mark |
| `trailTangentMaxTurnDeg` | 35 degrees total bend within sampling window |
| `trailMinCameraDepthM` / `trailCameraFadeM` | 0.8 / 0.6 m |
| `nearFieldArrowScale` | 1; legacy fallback if explicit trail scale is absent |

Geometry/colors are initialized once per document. Reload AR after changing them.
The factory interface remains `createTrailSegment(THREE, place, fade, scale)`.

## Placement and rendering

Marks remain on the original polyline at global 2 m intervals. A long route opens
with marks at 2, 4, ..., 16 m. A strict progress-relative horizon replaces expanded
out-of-window refill candidates. Fewer arrows may appear on short routes, near
arrival, between grid boundaries, or when 1 m separation rejects hairpin overlap.

Before/after samples determine orientation only; they never move a mark or alter
route distances. Bends above 35 degrees retain the segment tangent. At an exact
corner the outgoing segment wins. Summed curvature also catches hairpins made of
many short segments. No path curves or navigation maneuvers are rewritten.

Each arrow has a fixed world size. Camera perspective supplies distance scaling.
The arrow fades between camera-space depths 1.4 and 0.8 m, and is hidden at/below
0.8 m (including behind the camera). It retains its position and instance while
hidden. This tests depth, not horizontal walking distance; phone tilt affects it.

Shared geometry is retained for the warm iframe lifetime. Each arrow owns one
material for independent spawn and proximity fades. Removed materials are disposed;
destination-owned geometry/material cleanup is preserved. Eight chevrons use eight
meshes, matching the former two-chevron/four-mesh count. Front-face rendering avoids
double-sided transparent passes. Actual mobile frame times have not been measured.

## Scope

Changed sources: `ar-nav/config.js`, `ar-nav/index.html`,
`ar-nav/js/world-floor-arrows.js`, `ar-nav/js/incremental-path-spawn.js`,
`ar-nav/js/incremental-ar-path.js`, and `ar-nav/js/pathGeometry.js`.
The last file only forwards the existing camera to incremental rendering.
Corresponding files in `mappedin-pwa/public/ar/` are synchronized; HTML script URLs
carry a visual asset revision. Tests are in `mappedin-pwa/src/ar/`.

Routing, geographic transforms, calibration, XR8 startup/compositing, progress
authority, arrival, floor selection, rerouting and bridge/HUD contracts are unchanged.
Ground detection/physical floor anchoring is NOT implemented. The existing fixed
Y=0.04 and previously audited tracking/reroute limitations remain.

No reference image was present with the request; geometry follows its dimensions
and visual description. The browser connection failed before a preview could open.
No physical-device AR or visual screenshot verification was performed.

## Validation

- 129 tests passed in 14 files:
  `npm test --prefix mappedin-pwa -- src/ar src/routing src/services/navigation-presence.integration.test.ts --exclude '**/*.e2e.test.ts'`
- TypeScript: `cd mappedin-pwa && ./node_modules/.bin/tsc --noEmit` passed.
- The 27 focused geometry/trail tests also passed on actual Three.js 0.160.0:
  `FPLACES_TEST_THREE=/tmp/fplaces-three-0.160.cjs npm test --prefix mappedin-pwa -- src/ar/trail-rendering.test.ts src/ar/incremental-path-spawn.test.ts`
  The pinned build was downloaded to /tmp for validation, not installed or vendored.
  Without that optional variable the tests use offline constructor doubles.
- Two live `guest-indoor-routing.e2e.test.ts` cases could not reach the backend
  (DNS ENOTFOUND). They were not rerun against the external service.

## iPhone appearance check

1. Build/deploy the current working tree through the existing HTTPS workflow.
   The normal PWA prebuild copies `ar-nav/` into `public/ar/`.
2. Reload the PWA in Safari; close/reopen Live View to replace an already warmed
   iframe. If an installed PWA keeps old assets, apply its normal update/reload flow.
3. Select a route with at least 25 m of straight walking space. Open AR, grant the
   normal camera/motion permissions, and face along the route during calibration.
4. Verify a teal trail of up to eight small chevrons, about 2 m apart, shrinking
   naturally with distance. Verify no white outlines, glow discs or oversized layers.
5. Walk forward. Retained arrows should stay fixed, near arrows should fade out,
   and new distant marks should enter without rescaling retained arrows.
6. Rotate/tilt the phone and look backward. Arrows behind the camera should be
   hidden; returning to the route view should reveal the same retained positions.
7. Check a gentle bend, right-angle corner and hairpin. Gentle bends should blend
   direction; sharp corners should indicate the actual outgoing segment without
   moving arrows off the polyline. Hairpins may deliberately show fewer arrows.
8. Check a short route, arrival, floor change, close/reopen and end-navigation.
   Confirm existing HUD/progress behavior. Report any floating/sliding separately
   as an anchoring/tracking issue; Phase 1 does not establish a physical ground plane.
