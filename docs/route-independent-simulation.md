# Route-independent venue GPS simulation

## Root cause and correction

The physical origin was captured when the venue opened, but the map origin was set only by `startPositionProvider(path)` or My Location using the route's first point. Without a route the transform correctly returned null, but the initialization policy was wrong for development simulation. The earlier verification accepted this limitation; it is now removed.

On venue-map opening, `initializeVenueGpsReference` creates the session reference and initializes its map origin from loaded SDK geometry. `resolveVenueSimulationAnchor` chooses, on the opening floor:

1. The already-selected forum section's mapped location/space, when that association exists.
2. An exterior entrance's SDK center.
3. A mapped space's SDK center.

Fallback objects are ordered by stable SDK id. This defines a repeatable **simulation origin**, not a claim that GPS detected the user inside that particular room. Both coordinate and floor come from real loaded map objects. Catalog geographic pins, camera centers, synthetic numeric coordinates and route points are not origin sources. Missing/invalid/off-floor geometry produces an unavailable-map-reference explanation; selecting a route is never required to repair it.

The first accepted physical GPS fix is paired with that map origin, and can immediately feed the existing blue-dot pipeline. Subsequent real GPS displacement is translated in local metres and then stabilized/projected/rendered by the existing positioning pipeline. The same accepted map coordinate is shared with AR. My Location can initialize a pending map origin, center a translated fix, and restart continuous GPS tracking without route points.

The reference pair is write-once for the loaded venue session. Route creation, rerouting, clearing, My Location, camera changes, and returning to the same already-loaded venue do not recenter it. Unloading/switching venue creates a new reference; async callbacks check reference identity. The previous route-dependent capture code and same-loaded-venue reset were removed.

`VenueGpsReference.translate` converts physical coordinates to map coordinates; `toPhysical` provides the inverse using the same reference pair and metre-preserving math. Both return new coordinate objects and preserve input metadata. Original venue/map data are not changed or persisted. Physical user-location publishing still uses physical GPS coordinates.

## Diagnostics and precision

The diagnostic snapshot includes `physical`, `mapAnchor` (including its SDK floor), `mapAnchorInfo` (source, object id and name), session revision, and capture time. Existing copyable reports contain transforms, raw fixes, filter holds, blue-dot status and location-button events. The button identifies the development simulation and mapped reference; its uncertainty is explicitly GPS uncertainty, not indoor positioning accuracy.

GPS noise can still exceed reported accuracy. The map anchor is a chosen simulation reference, not evidence of actual indoor presence, room identity or floor detection. Existing provider quality gates and movement filtering remain in place. This remains Vite-development-only and requires `VITE_ENABLE_VENUE_GEOLOCATION_SIMULATION=1`.

## Verification

Focused positioning/AR regression: **324 passed, 1 skipped across 29 files**. Additional final targeted run: **27 passed across four files**. Coverage includes selection priority, deterministic fallback, SDK prototype getters, invalid/missing/off-floor geometry, immediate venue-opening display with no route/markers, physical walking before navigation, My Location centering/stream restoration, unchanged reference after route selection, loaded-venue reopening, unchanged source coordinates, inverse conversion, and existing AR/progress/lifecycle behavior.

TypeScript, production Vite/PWA build and `git diff --check` pass. The broad offline suite reports **939 passed, 3 failed, 4 skipped across 153 files**. The same previously documented failures remain in `ui/api-backed-screens.test.ts`, `ui/page-loaders.test.ts` and `location/domain/venue-presence.test.ts`; no new failures were introduced. Live backend e2e tests were excluded from this offline run. Physical-device verification remains required: open a simulated venue with no route, grant location, observe the dot, tap My Location, walk and stop, then create/clear/regenerate a route and reopen the loaded venue. The origin must stay fixed and GPS displacement must remain consistent. Test venue replacement while a GPS request is pending, denied permission, weak signal, background recovery and missing map geometry. No physical-device result is claimed.

For a per-button developer-console trace with precise coordinates and a copyable summary, see [Get Current Location console diagnostics](location-button-console-diagnostics.md).
