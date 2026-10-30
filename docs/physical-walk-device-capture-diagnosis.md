# Diagnosis of supplied physical-device capture

Source: user-supplied JSON attachment `098cd531-e40a-46d2-ad45-392d78dce40d`, plus six screenshots. Capture spans 30 October 2026, 08:34:16.863–08:35:14.737 Africa/Lagos. Screenshot clocks have minute precision, so exact frame/event alignment is not claimed. No application behavior was changed in this analysis.

**Confirmed from this capture**

- 58 GPS samples, all 58 valid, approximately one second apart (0.999–1.000s fix timestamp intervals). Accuracy ranges from 7.31m to 17.92m. No rejected fixes or degraded-state transition appears.
- 39 held fixes, all labelled `below-accuracy-deadband`. All 16 accepted movements use `sustained-low-scatter-trajectory`. There are 17 accepted positions including origin, 14 blue-dot requests, and 13 route projections.
- No recorder overflow: zero dropped events. 6,426 repetitive events were intentionally suppressed. Important GPS/movement/projection evidence is retained.
- No `position.audit.*` events occur. The new writer/frame-gap audit was not active in this capture (or the running build predates it). Absence of these events prevents excluding transient competing writes or missed-frame retarget jumps.
- All 15 render-completion records, including preview/origin, have exactly equal requested-render and SDK logical latitude/longitude. This supports correct endpoint delivery, not a claim about every GPU frame.
- Recomputing every accepted venue coordinate from recorded E/N and the origin venue anchor agrees to floating-point precision (maximum residual below 0.000001m). No axis/scale/transform discrepancy is demonstrated. Physical origin latitude/longitude is redacted, so the earlier physical-GPS-to-E/N calculation cannot be independently reconstructed from this export.

**1. Stop/start dot motion begins with movement acceptance**

After origin publication there is a 25.003s gap before the next blue-dot request. That request moves the target 5.21m and renders over 800ms. Later request gaps include 7.0s, 3.108s and 3.998s; animations last approximately 791–800ms. The renderer finishes, holds, then animates the next target. Browser GPS delivery itself was regular throughout.

At first accepted movement, accuracy is 13.73m, the isolated-fix deadband is 6.87m, and the accepted displacement is 5.21m. The separate sustained-trajectory branch permits acceptance: 10s window, 7.26m net movement, efficiency 0.868 and fitted speed 0.804m/s. This explains why a fix below the deadband can still move the dot; it is not an SDK inconsistency.

Responsible code: `PhysicalWalkSession.ingest`, `MovementEvidenceWindow.push`, `PositionInterpolation.setTarget`. The export cannot establish how much held displacement was real walking rather than receiver drift because there is no timed physical ground truth. Do not simply lower thresholds. Assess movement acceptance against measured walking and stationary traces first.

**2. Route progress advances much farther than accepted position movement**

| Local time / event sequence | Accepted accumulated chord distance | Along-route progress | Off-route distance | Remaining distance |
| --- | ---: | ---: | ---: | ---: |
| 08:34:55.166 / 687 | 9.944m | 8.523m | 4.615m | 20.785m |
| 08:34:58.275 / 754 | 13.064m | 20.225m | 6.070m | 10.538m |

Accepted position changed by **3.120m**, while route progress changed by **11.702m** in approximately 3.1s. This discrepancy is introduced by route projection, not the metre transformation or marker interpolation. It explains the grey completed-route section skipping forward relative to the dot.

`PhysicalWalkNavigation.project` passes the unsnapped position and previous along distance to `snapToRoute`. `snap-along-continuity.ts` adds a penalty only when the along change exceeds 12m; this 11.702m jump receives no continuity penalty. This is consistent with selection of a later leg on the pictured L-shaped route. Exact segment switching cannot be proven because this export omits route geometry, segment IDs and projected coordinates.

Recommended next fix: constrain demo progress continuity using accepted displacement/time and route-segment continuity. Preserve the unsnapped authoritative dot and production routing behavior. A fixed 12m allowance is substantial on this approximately 24.69m route.

**3. Remaining-distance formula introduces another independent discontinuity**

| Local time / event sequence | Along | Off-route | Remaining |
| --- | ---: | ---: | ---: |
| 08:35:00.177 / 800 | 23.575m | 4.357m | 5.475m |
| 08:35:02.180 / 836 | 23.231m | 3.437m | 1.462m |

Progress moves backward by 0.344m, yet remaining distance falls by 4.013m. `computeLiveRemainingMeters` adds the **entire** off-route distance only when it exceeds 4m, otherwise adds zero. Crossing that boundary removes the whole lateral component. The reverse crossing at 08:34:44–45 increases remaining distance from 20.714m to 23.979m despite forward progress.

This explains the screenshot transition from roughly 5m remaining to 1m without requiring a comparable physical step. Recommended next fix: define a continuous demo remaining-distance treatment; do not silently change production navigation policy.

**4. Green start marker, off-route blue dot and arrival have different meanings**

The green circle is the static selected-start marker (`RoutePlanner.START_MARKER`), not another live position. At startup it overlaps the blue dot; as accepted position moves away, the blue dot becomes separately visible. The blue dot is unsnapped, whereas the grey route is styled using a projected coordinate. In this capture projected off-route distance reaches 6.07m, so a dot inside a stall while progress advances down the corridor is consistent with the data reaching those two consumers.

Reported GPS uncertainty of 7–18m is larger than many observed lateral offsets. GPS drift, initial-origin bias, and a physical walking direction that differs from the venue route remain possible explanations for the accepted off-route trajectory. The log cannot separate them. Camera/map orientation also changes between screenshots and cannot be used alone to infer geographic direction.

At 08:35:11.170, event 1007 records:

- Total path approximately 24.6925m; along progress 23.9992m, leaving 0.6934m along the route.
- Off-route distance 3.9932m.
- Accepted accuracy 7.9119m.
- `arrived:true`.

This passes the existing along tolerance ≤0.75m, off-route tolerance ≤4m and demo accuracy ≤10m. Therefore the arrival dialog follows current policy, even with the dot visibly off the polyline. It does not prove precise physical arrival. The completed-route display also inherits the preceding projection jump.

Three later accepted positions have no corresponding blue-dot request. This is explained exactly by `PhysicalWalkNavigation.update` stopping render/projection publication when `metrics.arrived` is latched. It explains the 17 accepted positions versus 14 render requests; it is not three unexplained renderer losses.

**What this evidence does not support**

There is no demonstrated SDK endpoint mismatch, transformed-coordinate scale error, GPS delivery outage, degraded-recovery problem or ongoing heading disappearance. Glow becomes visible about 0.5s after startup and has no later hidden-state transition before release. The previously reproduced competing-writer and missed-frame defects remain possible in general but are not established as causes of this capture.

Prioritize demo route-progress continuity, remaining-distance continuity and explicit arrival/render-lifetime semantics before considering renderer replacement or global filter changes. For acceptance tuning, obtain timed measured walking/standing evidence. For transient rendering/writer diagnosis, use a build with `VITE_PHYSICAL_WALK_POSITION_DIAGNOSTICS=1` and `VITE_PHYSICAL_WALK_DEMO=1`; the optional overlay can remain disabled. No behavioral fix, threshold change or Phase 3 work was performed here.
