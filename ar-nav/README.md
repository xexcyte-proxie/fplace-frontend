# Fplaces 8th Wall AR Navigation

WebAR walker mode for the fplaces indoor navigation app. The Flutter map plans the route; this page renders turn-by-turn guidance in the camera view using the **same** route payload (path polyline + maneuvers).

## Architecture

```
Flutter (Mappedin route)  →  URL hash #route=…  →  ar-nav (8th Wall / fallback)
                              pathCoordinates
                              maneuvers
                              instructions
```

- **Map** = planner (Mappedin routing, POI selection)
- **AR** = walker (GPS progress along path, 3D arrow in SLAM space when 8th Wall is active)
- **Not** a second routing engine

## 8th Wall setup (2026 — no App Key)

As of **February 28, 2026**, the hosted platform at 8thwall.com is retired. 8th Wall continues at **[8thwall.org](https://8thwall.org)** as open source:

- **No account or App Key** required
- **SLAM / world tracking** via the free [Distributed Engine Binary](https://8thwall.org/docs/open-source) (`@8thwall/engine-binary` on npm/CDN)
- You **self-host** (e.g. Netlify) — the Cloud Editor project you may have created is not needed for this repo

This project loads the engine from jsDelivr by default (`xrMode: 'auto'` in `config.js`).

### Deploy

```bash
./deploy-ar
```

Production URL (default): `https://fplaces-test.netlify.app/`

Flutter already points there via `lib/config/app_config.dart`, or override:

```bash
flutter run --dart-define=EIGHTH_WALL_AR_URL=https://your-site.netlify.app/
```

## Testing

1. Run the Flutter app (`./run` or `./run-phone`)
2. Plan a route on the map
3. Tap **AR Guidance**
4. Allow camera + location when prompted

**Phone notes**

- Use **HTTPS** for camera + AR (Netlify is fine; plain HTTP on LAN often blocks them)
- Hard-refresh the AR tab after `./deploy-ar`

## Modes (`config.js` → `xrMode`)

| Mode       | Behavior |
|-----------|----------|
| `auto`    | `@8thwall/engine-binary` from CDN (default, no key) |
| `binary`  | Same as `auto` |
| `platform`| Legacy `apps.8thwall.com/xrweb?appKey=…` (retired; only if you still have an old key) |
| `fallback`| Camera HUD only, no SLAM |

## Route payload

Loaded from:

- `#route=<base64-json>` (Flutter web launch)
- `?fplacesRoute=<json>` (debug)
- `window.onFlutterRoute(payload)` (in-app WebView)
- `window.onFlutterPosition({ latitude, longitude, heading?, accuracy?, floorId? })` (live position)

Expected fields: `pathCoordinates`, `maneuvers`, `instructions`, `destinationName`, `distanceMeters`, `origin`, `destination`.

## Debug logging

AR debug is **on by default** when opened from Flutter (`?arDebug=1&arPanel=1`).

| Where | What you see |
|-------|----------------|
| **Phone screen** | Green debug panel at top (last ~48 log lines) |
| **Browser DevTools** | `[fplaces AR] STEP N (Xms) [Phase] message` |
| **Flutter console** | `[Fplaces/AR] STEP N (Xms) [Phase] message` (InAppBrowser + mirrored page logs) |

Disable panel: `?arPanel=0`  
Disable all: `?arDebug=0`

Phases: `Boot`, `Bridge`, `Bootstrap`, `Navigator`, `Compass`, `Arrow`, `XR`, `Fallback`, `Position`

### "Oops, something went wrong!"

That is 8th Wall's generic XR crash screen. After deploying latest `ar-nav/`, you get the **real error** in the green debug panel and a red status line, then automatic fallback to compass mode.

**Remote console on phone:** iPhone → Mac Safari → Develop → [iPhone] → AR tab. Filter for `fplaces AR` or `RuntimeError`.

**Skip XR to test arrow only:** `?xrMode=fallback`

## Limitations (POC)

- **Indoor positioning**: GPS is coarse indoors. Accurate in-mall arrows need Mappedin positioning or future VPS — not included yet.
- **SLAM path**: Path dots use a local frame anchored at the route origin; illustrative until indoor tracking is wired up.

## Files

| File | Role |
|------|------|
| `config.js` | xr mode, tuning |
| `js/route-bridge.js` | Load route from Flutter |
| `js/route-navigator.js` | GPS progress + maneuver state |
| `js/xr-nav-scene.js` | 8th Wall + Three.js arrow/path |
| `js/fallback-nav.js` | No-XR camera HUD |
| `js/bootstrap.js` | Engine load + startup |
