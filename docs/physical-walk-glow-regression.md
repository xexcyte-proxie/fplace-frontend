# Phase 2 directional glow investigation

## Findings

Two defects are reproducible from the inspected code:

1. Installed @mappedin/blue-dot 6.27.0-beta.0 forwards Fusion heading-update to its
   device-orientation-update event only while status is active. Its position timeout
   is 30000ms. Demo deliberately stops forwarding held GPS observations, so SDK position
   inactivity can stop orientation forwarding even though phone sensors remain active.
   heading.displayWhenInactive preserves an existing cone but does not restore updates.
2. disableHeading awaits watchDeviceOrientation(false), then sets heading.visible=false.
   A new provider can enable heading during that await; the old completion subsequently
   hides the new glow. Acquisition/release and async permission operations had no
   generation boundary. Also enableHeading enabled the orientation sensor twice:
   watchDeviceOrientation(true) already calls sensor.enable in the installed SDK.

The first defect explains the stationary timeout path, not disappearance within a few
seconds. The second reproduces an immediate visibility overwrite. No device trace was
provided, so the precise trigger on the reported phone remains unconfirmed. Another
physical-device test is required; do not attribute the reported symptom definitively
without its diagnostic sequence.

## Correction

MapApp attaches demo heading diagnostics before stopping the prior position provider.
Only while this demo attachment exists, injected Blue Dot appearance uses timeout
Infinity. This is renderer liveness, not positioning trust: all physical GPS age,
accuracy, movement, recovery and arrival gates remain unchanged. No fake coordinate or
movement heartbeat is introduced. Normal 30000ms timeout is restored on release.

Heading enable/disable and ownership transitions have a generation guard. An obsolete
async disable cannot apply hidden heading state to a newer owner. Enable uses the SDK
watch operation once, retains the existing filter, and records permission results.
No new heading calculation, renderer, route tangent or compass filter is introduced.

## Visibility policy

Valid headings continue through the existing compass filter, visual smoothing and
heading-only silent SDK update. They never call navigation position/progress.
When heading evidence is absent for COMPASS_FRESH_MS (4000ms), retain the last displayed
direction, record freshness=false and reason hold-last-direction. Do not substitute
north/route bearing or silently remove the cone. With no heading ever available,
visibility is requested but no direction is fabricated. Explicit disable, reset,
provider release and destruction may hide/remove the glow, with diagnostic reasons.

## Diagnostics

Recorder receives browser orientation events (alpha/absolute/WebKit heading without
computing a heading), existing SDK orientation absolute updates, fused SDK headings,
filter holds/results, visual publication, permission outcomes, listener ownership,
model creation/removal and observed SDK model visibility. Browser and raw-SDK listeners
are diagnostic-only: they do not feed the filter or progress. A 500ms health timer
records freshness transitions and inspects the existing model; it never updates GPS.
App-requested visibility changes and SDK status/action changes are separately logged.
Model state is renderer state, not proof of pixels being visible through occlusion.

Each event includes demo provider, session state, route state and route identity when
available. All added fields are scalar-allowlisted; physical GPS coordinates remain
excluded. Diagnostics detach on end/reset/scene disposal; normal tracking is restored.
The bounded recorder can truncate older events, with a dropped-event count.

## Device retest

Start the demo outdoors, capture origin while still, turn phone through several angles,
remain stationary for at least 45 seconds, turn again, then End. Refresh and export JSON
immediately. Check browser-event → SDK raw → received → filtered → published → glow
visibility sequence. Reproduce temporary sensor interruption and recovery. A stale
heading must be explicitly logged and held; resumption must rotate without GPS movement.
Verify physical/route distance and progress stay unchanged throughout. Verify normal
heading and GPS behavior after End. Record phone/browser and permission outcome.

Phase 3, AR, remote loading, route geometry and movement filtering are unchanged.

## Automated verification

185 tests pass across 17 focused files with production mode flags explicitly off;
demo-specific cases enable the flag or exercise explicit demo acquisition. Four new
marker regressions cover heading beyond 30s without positional updates, stale async
hide completion, diagnostic-only SDK subscription/normal restoration, and browser/model
visibility diagnostics. TypeScript passes. Demo-enabled and demo-disabled production
builds/PWA generation pass, with existing dependency annotation/large-chunk warnings.
