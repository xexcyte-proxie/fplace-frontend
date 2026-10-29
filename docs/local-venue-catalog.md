# Local venue catalog migration

## Existing flow (audited before replacing the datasource)

1. `ForumRemoteDatasource.listVenues(page)` called public `GET /api/forum/venues/?page=N`; `getVenue(id)` called its detail endpoint. The generic API client handled HTTP errors. Responses were typed as `PaginatedList<ForumVenue>` without a venue-specific mapper.
2. `ForumRepositoryImpl` delegated to that remote datasource. `forum-service.listAllVenues()` collected pages; `getForumVenue()` handled lookup. `ForumVenue` carries a numeric backend identity, name/location, string-or-null coordinates, map ID, notes, and timestamps.
3. `MapApp.loadOnboardingVenues()` set `authLoading`, converted records through `toVenueSummary`, preserved valid selections or chose the first venue, cleared loading, and loaded floors/sections. Empty results used the existing form message; failures used `handleAuthFailure`. Home refresh/returning-session paths also used `listAllVenues`; missing selections could use detail lookup.
4. `venue-select-data` and `venue-select-screen` rendered venue search, distance labels, and selection. Home presentation reused the summaries. The catalog lived in application state, not a persistent venue database. User venue/section preferences and recent visits had separate localStorage persistence; logout cleared those and the in-memory catalog.
5. Selection uses the numeric venue ID for backend floors, sections, posts, preferences, and venue/location WebSocket rooms. Map IDs are not substitutes for these IDs. `venueMapLoadRequest` resolves the selected map; `MapApp` reuses an already-loaded map by its load key and guards superseded initialization with a generation counter.
6. `resolveMappedinMapCredentials` gets a short-lived access token from `/api/maps/token/` for users or `/api/users/guest/` for guests. `resolveMapData` loads SDK map data and caches binary bundles in IndexedDB (`fplaces-mappedin`, `mapData`, keyed by map ID). Cache hydration and error recovery remain separate from venue metadata.
7. `show3dMap` initializes rendering. Search, floor selection, route planning, positioning providers, and AR consume the selected map, its SDK data, or generated route payloads. Their implementations are unchanged. SDK failures still reach the existing map error/retry flow; no new progress stages or delays were added.

## Implemented flow

`local-venues.json` → `VenuesLocalDatasource` → existing repository → existing services/UI.

The bundled JSON is imported once, indexed by backend ID once, and returned through the same asynchronous list/detail contracts. Returned records are copies so callers cannot mutate the shared catalog. The complete catalog fits one page (`next: null`); subsequent pages are empty. Unknown/excluded IDs reject using the existing detail error wording. Duplicate backend IDs fail explicitly; separate venues sharing a map are preserved. LTV8 is filtered from listing and lookup without deleting map files, cache entries, or backend resources.

Bundling makes metadata available again on application reload without storage reads, new browser permissions, or an initial venue API request. Offline app launch still requires that the PWA assets themselves have been installed/cached. Updating the bundled catalog requires an app build/deployment; it no longer refreshes automatically from the venue endpoint.

Only venue list/detail delegation changed. Backend datasource methods remain available for compatibility; authentication, floor/section catalogs, feeds, and WebSockets remain remote. Consequently, local listing does not imply that every subsequent venue-entry step works without network access.

## Provenance and preservation

Read the complete public `https://api.fplaces.com/api/forum/venues/` response on 2026-10-27: count 12, no next page. All 12 numeric identities, coordinates, locations, notes, and timestamps were retained. The unused backend `raw_json` field is not part of `ForumVenue` and is not bundled. The Grocery Store display name was corrected from `Grocery Store Demo|` to the supplied name. LTV8 was absent from this snapshot; the adapter also excludes it if later supplied.

Riverside Stadium (18) is the sole additional venue beyond the requested 11. It and Mall Demo - Facility (14) intentionally share a map ID, but have different backend identities. Deduplicating by map ID would incorrectly remove an existing venue.

## Final local collection

| Venue ID | Name | Mappedin map ID |
|---|---|---|
| 6 | Airport | `6686b845c9f6d600bc30300` |
| 7 | Arena Demo | `672a6f4f3a45ba000b893e1c` |
| 8 | Community Centre Demo | `660c0bb9ae0596d87766f2d9` |
| 9 | Craft Show Demo | `67bf60e9679a9d000bfacd6f` |
| 10 | Event Space Demo | `660c0c3aae0596d87766f2da` |
| 11 | Grocery Store Demo | `6679882a8298d5000b85ee89` |
| 12 | Hospital Demo | `67881b4666a208000badecc4` |
| 13 | Mall Demo - Consumer | `660c0c6e7c0c4fe5b4cc484c` |
| 14 | Mall Demo - Facility | `65c0ff7430b94e3fabd5bb8c` |
| 16 | Multifamily High-Rise | `67a6641530e940000bac3c1a` |
| 15 | Multifamily Mid-Rise | `666ca6a48dd908000bf47803` |
| 18 | Riverside Stadium | `65c0ff7430b94e3fabd5bb8c` |

## Authentication, map loading, and missing information

No API key or secret was supplied or added. The browser continues using server-issued bearer tokens, never a new frontend key/secret exchange. Server credentials must remain in the backend's secure configuration. The backend must issue tokens authorized for these maps. No authenticated live map load was performed in this migration; metadata and mocked SDK tests do not prove map availability.

Airport uses the exact user-confirmed ID `6686b845c9f6d600bc30300` (23 characters). The live backend instead reports `6686b845c9f6d6000bc30300` (24 characters). This discrepancy is intentionally not silently corrected. Airport's supplied ID requires actual SDK validation and may fail; its real SDK error will remain visible. Other supplied IDs match the snapshot.

Several demo venues share the backend coordinates `6.615911, 3.355013`, and most location strings are empty. These are preserved values, not inferred physical locations. Any intended changes require authoritative metadata. No additional venue IDs are missing after the public-catalog audit.

Mappedin documents server-generated short-lived bearer tokens and offline hydration from previously downloaded bundles or self-hosted MVF: https://developer.mappedin.com/web-sdk/getting-started . A map ID alone contains no map geometry. The existing implementation uses `toBinaryBundle`/`hydrateMapData` with IndexedDB and prefers fresh network data when online. Even cached map loading currently resolves credentials first, so a cold/expired session may still require backend access. Remote imagery, outdoor tiles, feeds, positioning services, and other resources retain their existing network requirements. Full offline rendering was not added or claimed.

## Maintenance

Edit `mappedin-pwa/src/forum/data/local-venues.json` using authoritative backend IDs and metadata. Keep IDs stable to preserve saved selections and backend references. Never add credentials. Run the catalog and selection tests, production build, and a separate authenticated SDK smoke check for any changed map ID. No automatic backend sync is introduced.

## Changed files

- `src/forum/data/local-venues.json`: bundled catalog.
- `src/forum/data/datasources/venues-local-datasource.ts`: asynchronous list/detail adapter.
- `src/forum/data/forum-repository-impl.ts`: local venue delegation; other methods unchanged.
- `src/forum/data/datasources/venues-local-datasource.test.ts`: catalog, identity, contracts, no-network access, filtering, reload, mutation isolation, and credential-field checks.
- `src/services/local-venues.integration.test.ts`: local metadata through onboarding and selected-map configuration, loading/empty/error/retry states.
- `src/config.ts`, `src/forum/domain/venue-map-source.ts`, `.env.example`: source-description comments.
- This document: audit, final collection, authentication, limitations, and validation results.

## Verification results

### Development GPS reference

`VITE_ENABLE_VENUE_GEOLOCATION_SIMULATION=1` enables temporary GPS translation in Vite development only; production builds ignore it. It is configured in the local environment files and documented in `.env.example`.

Opening a venue captures a fresh phone GPS reference without blocking map loading. The first normal generated route supplies its start coordinate as the map anchor, avoiding an assumed walkable map center or additional setup screens. Subsequent physical movement is translated in meters before the existing route projection, blue dot, and AR position handoff. Reroutes do not recenter the reference. Switching/unloading a venue clears it; reopening the same loaded venue without an active route captures again.

Stored venue coordinates, route geometry, headings, camera tracking, and backend user coordinates are unchanged. Missing or inaccurate GPS waits for a usable location update through the existing location flow. There is no additional simulation overlay; development logs identify reference capture. This supports testing movement, not verified indoor accuracy or simulated camera poses. Device GPS and camera AR still require on-device verification.

- Production `npm run build --prefix mappedin-pwa`: passed TypeScript, Vite, and PWA precaching. Existing large-chunk warning remains.
- Focused catalog, selection lifecycle, map credentials, venue switching, logout/reload, startup, picker, routing validation, and AR tests: **17 files passed; 164 tests passed, 1 skipped**.
- Full suite (before adding the final 15 selection lifecycle cases): **141 files passed, 6 failed, 1 skipped; 873 tests passed, 13 failed, 4 skipped**. Ten failures belong to live backend/guest/routing tests in the network-restricted runner. Three failures are existing expectations in `api-backed-screens.test.ts`, `page-loaders.test.ts`, and `venue-presence.test.ts`. All three reproduced against a separate HEAD snapshot with the same environment/configuration; no unrelated fixes were made.
- Built JS/JSON/HTML assets: zero matches for Mappedin `mik_`/`mis_` credential patterns or embedded JWT patterns. Catalog schema tests also enforce metadata-only fields. Pattern scanning is not a comprehensive secret audit.
- `git diff --check`: passed.
- Real map rendering, token authorization for each map, camera AR, and positioning at a venue: **not verified**. No Mappedin secrets were supplied, and no authenticated SDK smoke result is claimed. Existing automated map configuration/AR tests use mocks or runtime harnesses.
