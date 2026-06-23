# Product Requirements Document — Fplaces Indoor Navigation (PWA)

**Version:** 1.1  
**Status:** Active  
**Last updated:** June 2026  
**Product:** Indoor wayfinding PWA for mapped venues (Demo Mall default)

---

## 1. Overview

Fplaces is a **Progressive Web App** that helps visitors orient themselves inside complex venues (malls, campuses, airports) using interactive 3D floor plans, search, static wayfinding, and optional camera-based AR guidance.

The product uses **Mappedin JS v6** directly (Vite + TypeScript) — no native shell or WebView bridge. Users can search for places, pick start and end points on the map, view turn-by-turn directions, switch floors, and open AR guidance that follows the same planned route.

---

## 2. Problem Statement

Visitors inside large indoor venues often lack intuitive wayfinding. Paper maps and static signage do not adapt to the user's chosen destination, floor changes, or multi-stop journeys. Outdoor navigation apps lose accuracy indoors and do not understand venue floor plans.

The product combines Mappedin indoor maps with a mobile-first **web/PWA** experience: search, visual routing on the correct floor, and optional AR turn hints — installable from the browser without an app store.

---

## 3. Goals

| Goal | Description |
|------|-------------|
| **Orient** | Show an interactive 3D indoor map with floor awareness and POI labels |
| **Discover** | Search and highlight points of interest (stores, amenities) |
| **Plan** | Let users define where they are and where they are going |
| **Guide** | Draw a walking path with textual turn-by-turn instructions |
| **Extend** | Hand off the same route to AR for camera-based guidance (POC) |
| **Ship as PWA** | Single web codebase, installable on phone/desktop |

---

## 4. Non-Goals

- Custom real-time GPS streaming or route-anchored simulation
- Live navigation progress (ETA, travelled-fraction from device movement)
- Production indoor positioning (beacons, Apple IMDF) — future phase
- Venue CMS / map authoring (Mappedin Maker is external)
- User accounts, analytics dashboard
- Native iOS/Android apps (Flutter removed)

---

## 5. Platforms & Delivery

| Surface | Implementation |
|---------|----------------|
| **Web / PWA** | `mappedin-pwa/` — Vite build, `vite-plugin-pwa` |
| **AR module** | `ar-nav/` — self-hosted static site, linked via `VITE_AR_URL` |

**Default venue:** Mappedin Demo Mall (free-tier credentials in `.env.example`).  
**Production:** Set `VITE_MAPPEDIN_*` in `mappedin-pwa/.env`.

---

## 6. Core User Flows

### 6.1 First open — map load

1. User opens the PWA.
2. Loading overlay shows map initialization.
3. On success, map is interactive; location labels appear after load.
4. On failure or timeout (~45s), user sees error or toast.

### 6.2 Search & select a place

1. User searches (e.g. "Gymnasium").
2. Results list appears; map highlights hits.
3. User taps a result → map focuses POI and sets route destination.

### 6.3 Plan a route (tap-to-route)

1. User taps map for **start** (green marker).
2. User taps map or selects POI for **end** (red marker).
3. Route hint bar guides the two-step flow.
4. When both points are set, route auto-generates.
5. Bottom sheet shows turn-by-turn instructions.

### 6.4 Multi-floor routing

1. Multi-leg routes show **Step X of Y** in bottom sheet.
2. User navigates legs with prev/next controls.
3. Mappedin handles floor connection tooltips on the map.

### 6.5 My location (one-shot)

1. User taps ⊕ FAB.
2. Browser requests single GPS fix.
3. Map centers and sets start point.

### 6.6 AR guidance (POC)

1. User has an active route.
2. User taps **AR Guidance**.
3. Route JSON opens hosted `ar-nav` in fullscreen iframe.
4. User returns via **Back to map**.

---

## 7. Technical Architecture

```
mappedin-pwa/
  src/services/map-app.ts      orchestration
  src/services/route-planner.ts   getDirections, markers
  src/services/search-service.ts  Mappedin Search
  src/services/labels-service.ts  POI labels
  src/services/ar-service.ts      route → ar-nav URL
  src/ui/ui-root.ts            overlays

ar-nav/  ← deployed separately (Netlify), loaded by VITE_AR_URL
```

**Stack:** `@mappedin/mappedin-js`, Vite, TypeScript, `vite-plugin-pwa`.

---

## 8. Configuration

| Setting | Env var | Default |
|---------|---------|---------|
| API key | `VITE_MAPPEDIN_KEY` | Demo key |
| API secret | `VITE_MAPPEDIN_SECRET` | Demo secret |
| Map ID | `VITE_MAPPEDIN_MAP_ID` | Demo Mall |
| AR host | `VITE_AR_URL` | fplaces-test.netlify.app |

---

## 9. Future Considerations

- Official `@mappedin/blue-dot` + venue IPS
- Offline map (Mappedin TMVF / hydrate)
- Accessible routing toggle
- Deploy map PWA + AR on same origin

---

## 10. AR payload

Route handoff includes: `pathCoordinates`, `maneuvers`, `origin`, `destination`, `legs`, optional `userPosition`. AR does not recompute routing.
