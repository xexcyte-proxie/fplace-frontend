# Mappedin PWA — Fplaces Indoor Nav

PRD implementation using **Mappedin JS v6** the [official way](https://developer.mappedin.com/web-sdk/getting-started):

- Vite + TypeScript
- `@mappedin/mappedin-js` — map, search, routing
- `vite-plugin-pwa` — installable web app shell
- No Flutter / WebView bridge
- No custom live GPS tracking (per PRD non-goals)

## Quick start

```bash
chmod +x ../run-mappedin-pwa   # once, from repo root
../run-mappedin-pwa
```

Or:

```bash
npm install
npm run dev      # http://localhost:5173
npm run build && npm run preview
```

## Implementation phases (PRD)

| Phase | Features | Status |
|-------|----------|--------|
| **1 — Map shell** | 3D map, loading/error overlay, 45s timeout toast, floor list | Done |
| **2 — Search** | Query bar, results panel, map highlights, focus POI as destination | Done |
| **3 — Route planning** | Tap start/end, green/red markers, auto-route, animated path, bottom sheet | Done |
| **4 — Navigation UX** | Multi-leg prev/next, focus start/end, reset points, one-shot My Location | Done |
| **5 — AR handoff** | Route JSON → hosted `ar-nav` in fullscreen iframe, back to map | Done |

### Explicitly excluded (PRD non-goals)

- Continuous GPS / live blue dot tracking
- Route-anchored simulation
- Live ETA / progress bars from device movement

Future: Mappedin official `@mappedin/blue-dot` + venue IPS.

## Configuration

Copy `.env.example` → `.env`:

```
VITE_MAPPEDIN_KEY=...
VITE_MAPPEDIN_SECRET=...
VITE_MAPPEDIN_MAP_ID=...
VITE_AR_URL=https://fplaces-test.netlify.app/
```

## User flows

1. **Search** — type a store name → tap result → sets destination
2. **Route** — tap map for start (green) → tap map or search for end (red) → route draws automatically
3. **Navigate** — bottom sheet shows turn-by-turn; use Step X/Y for multi-floor legs
4. **My location** — ⊕ FAB requests one GPS fix and sets start point
5. **AR** — with active route, tap **AR Guidance** (requires HTTPS on phone for camera)

## Repository layout

```
mappedin-pwa/       Main PWA (map, search, routing, labels)
ar-nav/             AR walker module (deploy with ./deploy-ar)
docs/PRD.md         Product requirements
deploy-ar           Deploy ar-nav to Netlify
run-mappedin-pwa    Dev server launcher
```

## Phone testing

1. `npm run dev` (binds `0.0.0.0:5173`)
2. Open `http://<your-mac-ip>:5173` on phone Chrome
3. For AR camera: deploy `dist/` to HTTPS or use `npm run preview` over LAN with caution

See also: [docs/PRD.md](../docs/PRD.md)
