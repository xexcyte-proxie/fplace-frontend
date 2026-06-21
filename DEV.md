# Local development (PWA)

## Reset from scratch

1. In the terminal where Flutter is running, press **`q`** to quit.
2. From the project folder:

```bash
cd /Users/mac/fplaces
flutter clean
flutter pub get
chmod +x run run-phone
./run
```

3. **Let Flutter open Chrome** — do not open `localhost:8080` in a separate window yourself for day-to-day dev.

## Two ways to run

| Script | Use when | Hot reload | AR debug logs |
|--------|----------|------------|---------------|
| `./run` | Developing on your Mac (Chrome) | Yes | Browser DevTools + on-screen panel |
| `./run-phone` | Testing PWA in phone Chrome | No — hard-refresh | Phone DevTools only (not Flutter terminal) |
| `./run-native` | **Native iOS/Android app on device** | Yes | **Flutter terminal** `[Fplaces/AR]` + on-screen AR panel |

### Native mobile (recommended for AR debugging)

The native app uses an embedded WebView for AR so Flutter receives every debug event from `ar-nav`:

```bash
chmod +x run-native   # once
./run-native
```

1. Connect iPhone (USB) or Android (USB debugging).
2. Wait for the app to install and launch on the device.
3. Draw a route → tap **AR Guidance**.
4. Watch this terminal for lines like:

```text
[Fplaces/AR] STEP 12 (3401ms) [Navigator] State notify | {instruction: …, targetBearingDegrees: …}
```

AR JavaScript changes still load from Netlify (`fplaces-test.netlify.app`) unless you override:

```bash
./run-native --dart-define=EIGHTH_WALL_AR_URL=https://your-site.netlify.app/
```

After editing files under `ar-nav/`, deploy with `./deploy-ar` before testing on device.

## Why you see "No client connected"

That only appears with **`web-server`** (`./run-phone` or `flutter run -d web-server`).

A normal Chrome tab you opened yourself is **not** linked to Flutter’s debugger. That is expected, not a bug.

- **Fix for Mac dev:** use `./run` (Chrome device).
- **Fix for phone:** ignore the message; pull-to-refresh or reload the page after changes.

## After changing map HTML

Files under `assets/mappedin/` or `web/mappedin/` need a full restart:

```bash
# press q, then:
./run
```

Hot reload does not reload the iframe map reliably.

## AR navigation data (Mappedin → AR)

When a route is drawn, the map sends to Flutter:

- **Path polyline** (`pathCoordinates`) — every point along the blue route
- **Maneuvers** — each turn with `instruction`, `actionType`, `bearing`, `distanceMeters`
- **Origin / destination** coordinates and total distance

Tapping **AR Guidance** passes that JSON to `ar-nav/index.html`, which:

1. Shows the same turn text as the map (e.g. “Turn left in 10m”)
2. Uses **GPS** to track progress along the polyline and advance steps

**Deploy AR page from this repo:**

```bash
# One-time (browser login + link to fplaces-test site)
cd ar-nav
npx netlify-cli login
npx netlify-cli link

# Every deploy after ar-nav/index.html changes
./deploy-ar
```

CI / no browser: create a [Netlify personal access token](https://app.netlify.com/user/applications), then:

```bash
export NETLIFY_AUTH_TOKEN=your_token
export NETLIFY_SITE_ID=your_site_id   # Netlify → Site configuration → Site ID
./deploy-ar
```

Or set `EIGHTH_WALL_AR_URL` to another host if you do not use Netlify.

**Limits:** Outdoor GPS does not match indoor Mappedin coordinates well inside a mall. Production AR needs Mappedin positioning + a real 8th Wall scene that anchors arrows in 3D; this repo wires the **data** correctly for that integration.
