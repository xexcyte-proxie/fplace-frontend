# Physical Walk Demo — Phase 1

Remote Mappedin loading remains unchanged. No map bundles are introduced. The new
foundation has no consumers in MapApp, the provider registry, Blue Dot or AR.

## Architecture

Future: remote map → selected start/destination → Mappedin route → demo session →
physical GPS → quality/movement filter → fixed-origin East/North transform → shared
venue provider → existing projection/progress → parent state → 2D/AR.
Implemented flow stops at standalone VenueFix output. No renderer receives it.

## API and lifecycle

VITE_PHYSICAL_WALK_DEMO=1 enables explicit API start; default is disabled. It does
not mount UI or start GPS. start(options) captures the selected anchor and enters
capturing-origin; watch() explicitly starts hardware; ingest() accepts fixtures;
checkFreshness() is an explicit caller heartbeat. end() clears hardware, reset()
requires a new unique session ID and captures a new origin. No pause or implicit
rebase is implemented. Old callbacks cannot affect a reset session.

Origin requires >=3 valid fixes spanning >=2 seconds in a 10-second window, within
5 metres of the first. Select the sample with lowest reported accuracy, retaining
its original accuracy and timestamp. This is not statistically improved precision.
Anchor and origin remain fixed until reset. Floor is selected, not GPS-derived.

Transform: R=6371000m, reference-latitude longitude scaling, 1:1 scale, zero rotation,
antimeridian wrapping, max 1000m radius, supported latitudes within 80 degrees.
Output source is physical-gps-transformed; physicalSource is gps.

Quality: positive accuracy <=30m; age <=15s; future tolerance <=1s; increasing
sample timestamps. Jump gate: 4m/s plus reported uncertainty. Movement needs
>=max(2m, half the greater origin/current accuracy) and coherent subsequent evidence.
This conservative heuristic can delay slow walking and needs device tuning. Holds
retain accepted timestamp and return no new frame. Explicit freshness checks and
browser errors degrade state. Two valid samples restore stream readiness; unknown
paths through outages are not reconstructed. Heading has no input into this API.

## Diagnostics

5000-event bounded chronological JSON, sequence IDs, caller timestamps, truncation
count, fix quality, relative E/N, holds/rejections, transformed coordinates and
lifecycle. Scalar allowlist excludes physical latitude/longitude/origin before
storage. Relative trajectories can still identify movements. copy()/download()
export JSON; optional mountPhysicalWalkDebugPanel() offers mobile buttons and
selectable text fallback. It is not mounted in the app. Renderer, heading, route,
arrival and AR event producers belong to subsequent integration phases.

## Revised implementation plan

1. Foundation: these modules, fixtures, recorder, default-off flag.
2. 2D: adapt services/map-app.ts, position/types.ts, providerRegistry.ts and
   map/markers.ts; reuse glow and renderer. Add parent physical distance, speed,
   elapsed time, existing route-pace ETA and independent unsnapped position.
3. Intelligence: reuse routing/coordinate-transformation-service.ts and
   route-progress.ts; add parent maneuver/off-route/arrival-evidence modules.
4. AR: adapt position/bridge.ts, ar-nav/js/route-bridge.js and route-navigator.js
   for parent-physical authority; disable child extrapolation/arrival only in demo.
   Keep SLAM camera, graphics, anchorEngine and tracking invalidation. Calibrate at
   current accepted venue position, not always original start.
5. Device validation: iPhone Safari and Android Chrome.

## Phase 2 prerequisites and risks

- Capture timeout/cancel UI, heartbeat scheduling, mobile panel mounting.
- Origin/movement thresholds tested against real sensor quality.
- Explicit pause semantics; no silent origin recapture.
- Preserve real location/presence access policy separately from synthetic position.
- Good off-route fixes must survive current route-snap rejection; preserve raw venue
  fixes and avoid corner advancement from route projection alone.
- Physical walked distance differs from along-route progress; allow backtracking.
- Parent owns navigation/arrival; no timer-driven motion, including child display
  extrapolation. Compass-only ticks cannot advance progress.
- Existing arrival gates remain; probable/manual/confirmed completion are distinct.
- Request orientation permission directly from Start user gesture.

Rollback: disable flag; no production navigation consumer has been changed.
Fixture/build checks do not validate live walking, 2D, AR alignment or arrival.

## Readiness remediation: observation and movement contract

The snapshot API now separates five concepts:

- observation: latest fully validated GPS evidence, its original timestamp/accuracy,
  and independently transformed venuePosition. This includes stationary observations.
- acceptedPosition / position: last origin placement or independently accepted movement,
  retaining its own timestamp/accuracy. Holds never rewrite this provenance.
- displayedPosition: retained accepted coordinate, without pretending it is a new fix.
- lastMovementTimestamp: null until actual movement is accepted, then its original fix time.
- observationFresh / positionFresh / sensorHealth: observation age, active readiness and
  stream health; fresh recovery evidence alone does not mean active readiness.

movementEvidence describes the last ingested sample, not an instruction to advance
navigation repeatedly. Deduplicate by session ID and observation timestamp. Compass
input is unsupported; non-GPS input is rejected. Timers only check freshness.

For Phase 2 (not implemented): use observation's actual transformed venuePosition,
original accuracy and timestamp for the existing unchanged GPS-quality gate. Consume
acceptedPosition separately for the retained renderer coordinate. A new observation
with no accepted movement may update quality/health, but must not call route-progress,
physical-distance, measured-speed or confirmed-arrival advancement. Never create a
position frame combining an old accepted coordinate with a newer observation timestamp.
Do not pass held observation candidates into existing route projection in a way that
advances progress. Arrival needs a separate sustained-evidence policy, beyond freshness.
If snapshots are polled, timestamp deduplication is mandatory. Stationary speed decay
may be derived from absence of accepted movement, not summed jitter. Caller schedules
checkFreshness(); it does not subscribe or schedule timers itself.

All rejection gates (including jump and transform-radius validation) run before
trusted observation freshness or recovery is updated. A rejection clears pending
movement and resets consecutive recovery evidence. Browser errors and observation
freshness timeout also clear recovery and pending origin/movement evidence. Duplicate
and out-of-order timestamps cannot recover. Two consecutive valid recovery observations
restore readiness only: neither publishes position or movement; subsequent independent
movement validation is required. No path, distance, speed or progress is reconstructed
through an outage. Reset clears observation, movement and recovery state; old hardware
callbacks remain scoped to the old session.

The original stationary readiness regression now asserts the separate observation
freshness contract, while retaining the original accepted timestamp assertion. The
rejection recovery regression remains. Additional tests cover stationary observations
past 15 seconds, immutable movement provenance, rejected observation freshness,
consecutive recovery, duplicates, ordering, non-GPS input, browser errors, timeout,
and old-session callbacks.

Recovery also establishes a movement-validation reference at the second recovery
observation, without changing the fixed physical origin or displayed position.
Repeated stationary observations at that recovered location cannot accept outage
displacement. Subsequent movement must independently exceed the existing movement
threshold relative to that recovery reference. Phase 2 must mark outages as distance
continuity breaks: a later accepted absolute position is not proof of the path walked
or distance travelled during the outage.
