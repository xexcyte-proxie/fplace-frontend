# Physical Walk Demo — Phase 2

## Activation and scope

Set VITE_PHYSICAL_WALK_DEMO=1 in the Vite environment and restart dev/rebuild.
Without this flag the controls are not mounted and existing navigation stays intact.
Remote getMapData/resolveMapData, credentials and venue geometry remain unchanged.
The demo build permits remote route point selection while preserving guest denial
and keeping actual userLocation unchanged. This bypass is route-planning-only;
AR/presence/social checks retain their existing inputs and rules.

On the existing map select a routable start/destination and calculate a single-floor
route. The Physical Walk Demo panel appears on the map. Origin capture starts automatically
as soon as both points produce a valid route; no separate Start tap is required.
The start is rendered as an explicit preview, not a claimed GPS fix. The original
heading sensor is enabled from the tap; browser geolocation requests permission.
Capture requires the Phase 1 stable sample window. Cancel/End stops the watch;
30 seconds without captured origin times out, releases ownership and offers Retry.
Reset explicitly ends the old session and captures a new physical origin at the
same selected venue start. No pause/resume exists.

## Ownership and integration

PhysicalWalkNavigation uses the Phase 1 session and snapshot contract. GPS samples
are processed immediately; the 250ms heartbeat only checks freshness and updates
elapsed time/ETA. Observations are deduplicated by session lifetime and GPS timestamp.
Stationary observations maintain readiness; they never call route projection or
renderer movement. Position timestamps are never replaced with observation times.

MapApp stops its active provider and uses the renderer's existing parallel-position
mode with compassGlow. This disables native device position watching but preserves
heading filtering and stationary cone rotation. Competing provider and Blue Dot
callbacks cannot change progress, presence or AR. Get Current Location recentres the
retained demo dot instead of acquiring another position. End restores normal provider
selection. Scene teardown stops the session without starting a provider on a destroyed
map. Real location-service watches remain available for real presence/access checks.

The dot receives accepted, unsnapped transformed positions with the original source,
accuracy and timestamp. Existing coordinateTransformationService projects separately
for along-route progress and travelled-polyline rendering. Backtracking can reduce
progress. Existing 30m projection and production arrival predicates remain in use.
No new off-route or arrival state machine is introduced. Existing manual leg controls
remain; automatic shared maneuver advancement belongs to Phase 3.

## Metrics

Panel shows physical walked metres, along-route metres, remaining distance, completion,
accepted-fix speed, elapsed time, route-pace walking time and wall-clock ETA. Physical
distance sums accepted metre deltas and excludes outages. Stops are recognized from
fresh observations without recent accepted movement; clocks never advance position.
Remaining distance reuses the existing path-plus-geometric-off-route estimate, not a
new walkable detour calculation. ETA uses route duration/length or 1.4m/s fallback.
Multi-floor demo routes are rejected rather than inventing GPS floor transitions.

Recovery requires consecutive valid observations and independent movement after that.
Retained position can later be reconciled with absolute transformed coordinates;
a continuity-break event records this and outage distance is excluded. There is no
silent origin recapture. Exact physical paths during outages remain unknown.

## Diagnostics

Mounted diagnostics offer Refresh, Copy JSON, Download JSON and selectable-text fallback.
Recorder includes provider ownership, origin state, trusted observation freshness,
transform/held/rejected fixes, requested dot position, sampled existing renderer heading,
route projection, physical/route metrics and lifecycle. Physical coordinates remain
excluded before storage; original physical-GPS metadata stays in session frames.
High-rate raw compass samples are not duplicated; published heading is sampled from
existing marker state. UI metrics refresh every 250ms; report fields record positioning
events. There is no network upload.

## Validation and device procedure

Deterministic tests cover initial placement, ownership/restoration, stationary freshness,
slow walking, turns, wrong-direction walking, backtracking, rejected fixes, outages,
reset/old callbacks, timeout/retry, route/physical distance and ETA, plus redaction.

On iPhone Safari and Android Chrome, use HTTPS and an outdoor measured course aligned
with the venue route's compass bearings. Start while stationary. Rotate the phone:
the glow should turn without changing distance. Walk north/east as the route requires;
then test backtracking, continuing straight at a virtual turn, stop/start and GPS loss.
Export diagnostics after each run. Cancel, Retry, Reset, End and venue switching must
clear the previous GPS watch. AR is deliberately unavailable during an active demo.

Physical sensor/compass accuracy, browser permissions, world-scale behavior and actual
mobile downloads still require device verification. Phone GPS cannot guarantee short
indoor movement or precise arrival. Phase 3 adds parent maneuver automation, off-route
state/recovery UX and sustained/probable/manual arrival. Phase 4 AR is not implemented.

## Verification results

Focused deterministic navigation/renderer/heading/presence suite: 180 tests across
17 files pass with VITE_ALLOW_REMOTE_AR=0. TypeScript and production build pass.
The full repository run reported 890 passed, 13 failed, 4 skipped: failures include
backend-dependent E2E connections, remote-AR environment assumptions and two unrelated
UI expectations (comments presence copy and venue Enter loading). The two UI failures
also reproduce in a focused run. No unrelated UI/backend fixes were included.
No actual phone walk, camera alignment or mobile download was claimed as verified.

## Automatic start

With the demo feature enabled, applying a successfully calculated route starts the
physical session immediately. No route means no GPS watch. Normal provider startup
is retained when the feature is disabled. Retry/reset remains explicit after cancellation
or timeout. Orientation permission is requested from route-selection gestures where
possible, before asynchronous calculation loses browser user activation. Browser GPS
and compass permissions still require consent; the app cannot bypass OS prompts.
