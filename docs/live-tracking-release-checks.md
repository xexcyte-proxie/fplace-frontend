# Live tracking release checks

Navigation rejects fixes older than 15 seconds, coordinate values outside WGS84 bounds,
reported accuracy worse than 30 m, and route projections farther than 30 m from the fix.
Rejected fixes leave the last accepted progress unchanged and display a signal warning.
Arrival additionally requires accuracy of 10 m or better and a position within 4 m of
the route and 0.75 m of its end. These thresholds are conservative defaults; verify them
at the actual venue before changing them.

Browser geolocation is reported as GPS, including on Apple devices and indoor-provider
fallbacks. An iPhone user agent alone does not establish indoor positioning capability.
Venue-specific beacon and floor mappings use the loaded map ID. BLE readings expire
after 5 seconds. Compass updates preserve the timestamp of the underlying location fix.

## Automated checks

Run from `mappedin-pwa`:

- `npm test -- --exclude '**/*.e2e.test.ts'` for local tests.
- `npm test -- src/guest/guest-backend.e2e.test.ts src/routing/guest-indoor-routing.e2e.test.ts`
  for network integration tests. These create isolated guest sessions and update trial flags.
- `npm run build` for TypeScript, bundled AR assets, and the production PWA build.

The separate forum live suite publishes a post; use an explicitly approved test environment
for that suite. Routing integration reads a map ID from the live venue catalog rather than
assuming that the old demo map remains accessible.

## On-site release gate

1. Correct LTV-8's backend venue pin. Confirm that the Mappedin geometry also aligns with
   LTV-8's real coordinates; correcting only the catalog pin cannot fix misplaced geometry.
2. On both iOS Safari and Android Chrome, walk a known route, pause, turn the phone while
   stationary, walk backward, leave the route, and approach the destination. Confirm the
   marker, remaining distance, and arrival match actual movement.
3. Deny/revoke location permission, lose signal, background the app for more than 15 seconds,
   and recover. Confirm warnings appear and stale fixes never advance progress or arrive.
4. Change venues and repeatedly start/stop navigation. Confirm the correct map and floor
   mapping are used and no stopped provider resumes after an asynchronous permission prompt.
5. If using IndoorAtlas or BLE, validate the installed SDK/beacons and floor mappings on-site.
   Browser GPS alone may not provide accuracy sufficient for room-level indoor navigation.

The placeholder IndoorAtlas floor map has been removed. IndoorAtlas now remains disabled
for a venue until `src/position/config/indoor-atlas-floor-map.json` contains its verified,
one-to-one level mappings. Production pages also refuse insecure `ws://`; configure a
certificate-valid `VITE_WS_URL=wss://...` after TLS is enabled on the live socket endpoint.

Passing unit tests and producing a build do not establish on-site positioning accuracy.

## Positioning acceptance targets

Do not advertise room-level live tracking until a physical walk test records at least 95%
accepted fixes on the correct floor, a 95th-percentile horizontal error of 5 m or less,
floor changes within 5 seconds of leaving a connector, and zero false arrivals across ten
complete routes per supported device/browser combination. Browser GPS is fallback-only and
does not qualify, even when it happens to pass a small indoor sample.
