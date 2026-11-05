# Mappedin PWA - Fplaces Indoor Nav

For creating a venue map with AI and connecting it to the current app, see [Mappedin Map Maker: getting started with Fplaces](../docs/mappedin-map-maker-getting-started.md).

PRD implementation using **Mappedin JS v6** the [official way](https://developer.mappedin.com/web-sdk/getting-started):

- Vite + TypeScript
- `@mappedin/mappedin-js` - map, search, routing
- `vite-plugin-pwa` - installable web app shell
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
| **1 - Map shell** | 3D map, loading/error overlay, 45s timeout toast, floor list | Done |
| **2 - Search** | Query bar, results panel, map highlights, focus POI as destination | Done |
| **3 - Route planning** | Tap start/end, green/red markers, auto-route, animated path, bottom sheet | Done |
| **4 - Navigation UX** | Multi-leg prev/next, focus start/end, reset points, one-shot My Location | Done |
| **5 - AR handoff** | Route JSON → hosted `ar-nav` in fullscreen iframe, back to map | Done |

### Explicitly excluded (PRD non-goals)

- Continuous GPS / live blue dot tracking
- Route-anchored simulation
- Live ETA / progress bars from device movement

Future: Mappedin official `@mappedin/blue-dot` + venue IPS.

## Configuration

For local development, copy `.env.example` to `.env` and set `VITE_API_URL`
and `VITE_WS_URL`. Production builds load the public settings in `.env.production`;
Netlify environment variables override those values. Backend URLs and demo flags
are configured in the environment, not `netlify.toml`. Rebuild after changing them.

`VITE_API_URL` is the upstream backend origin without `/api`. With
`VITE_API_PROXY=1`, the browser calls same-origin `/api` and the build generates
`dist/_redirects` pointing to that upstream. Netlify and Vite development/preview
proxy to the same environment-defined destination. This avoids browser CORS and
allows an HTTP upstream behind Netlify HTTPS. No backend URL is in `netlify.toml`.
Set `VITE_API_PROXY=0` only for direct HTTPS API calls with backend CORS configured.
`VITE_WS_URL` configures WebSockets separately. Rebuild after environment changes.
Never put private credentials in `VITE_*` variables: they are public build settings.

Mappedin **key/secret are not used in the client**. Map credentials come from the backend:
- guests: `POST /api/users/guest/` → `mappedin.token`
- signed-in users: `GET /api/maps/token/`

## User flows

1. **Search** - type a store name → tap result → sets destination
2. **Route** - tap map for start (green) → tap map or search for end (red) → route draws automatically
3. **Navigate** - bottom sheet shows turn-by-turn; use Step X/Y for multi-floor legs
4. **My location** - ⊕ FAB requests one GPS fix and sets start point
5. **AR** - with active route, tap **AR Guidance** (requires HTTPS on phone for camera)

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

## Vercel deployment

Use Node.js 22 or newer. The build copies AR assets with Node; `rsync` is not needed.
Vercel configuration is included for either repository root or `mappedin-pwa` as
Root Directory. With `mappedin-pwa` selected, enable **Include source files outside
of the Root Directory in the Build Step** so the sibling `ar-nav` folder is available.
The repository-root configuration includes the entire source tree automatically.

Set `VITE_API_URL` to your backend origin (without `/api`) and `VITE_API_PROXY=1`
in Vercel. Set `VITE_WS_URL` to the actual WebSocket backend origin separately.
The configuration reads `.env.production` defaults and lets hosting environment
variables override them. It creates the API rewrite and SPA fallback for Vercel;
Netlify continues using the build-generated `_redirects` file.

Vercel uses `vercel.json` in the selected Root Directory. Its build command runs
`prepare-vercel-output.mjs` after Vite, producing `.vercel/output/static` and a
Build Output API `config.json` with the environment-based API proxy, real static
file routing, and SPA fallback. Keep dashboard Build Command overrides disabled
so this packaging step runs. Do not set Output Directory to the repository root;
Vercel consumes the generated Build Output API directory automatically.
