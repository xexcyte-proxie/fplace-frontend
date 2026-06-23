# Fplaces — Indoor Navigation PWA

Indoor wayfinding for mapped venues, built with [Mappedin JS v6](https://developer.mappedin.com/web-sdk/getting-started) (Vite + TypeScript + PWA).

## Quick start

```bash
chmod +x run-mappedin-pwa   # once
./run-mappedin-pwa
```

Or:

```bash
cd mappedin-pwa
npm install
npm run dev
```

Open **http://localhost:5173** (LAN URL printed for phone testing).

## Production build

```bash
cd mappedin-pwa
npm run build
npm run preview
```

Deploy the `mappedin-pwa/dist/` folder to any static host with **HTTPS** (required for PWA install and AR camera).

## Configuration

Copy `mappedin-pwa/.env.example` → `mappedin-pwa/.env`:

| Variable | Purpose |
|----------|---------|
| `VITE_MAPPEDIN_KEY` | Mappedin API key |
| `VITE_MAPPEDIN_SECRET` | Mappedin API secret |
| `VITE_MAPPEDIN_MAP_ID` | Venue map ID |
| `VITE_AR_URL` | Hosted AR page (see below) |

Defaults use Mappedin **Demo Mall** (free tier).

## AR guidance

The map app hands off routes to the **`ar-nav/`** module (8th Wall / compass fallback).

Deploy AR to Netlify:

```bash
./deploy-ar
```

Default AR URL: `https://fplaces-test.netlify.app/` (override with `VITE_AR_URL`).

## Repository layout

```
mappedin-pwa/   Main PWA (map, search, routing, labels)
ar-nav/         AR walker module (deploy separately)
docs/PRD.md     Product requirements
deploy-ar       Deploy ar-nav to Netlify
run-mappedin-pwa  Dev server launcher
```

## Docs

- [mappedin-pwa/README.md](mappedin-pwa/README.md) — implementation details
- [docs/PRD.md](docs/PRD.md) — product spec
