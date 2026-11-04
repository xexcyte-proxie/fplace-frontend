# Navigation UX audit — 31 October 2026

## Findings and implementation

The route sheet required Begin even after route selection. Route readiness now calls the existing movement lifecycle after calculation completes. Physical Walk retains its running guard, permissions and venue gates still apply, and permission completion cannot restart a replaced or cleared route. Reset, arrival, route geometry, heading, arrow rendering, and alignment implementations remain intact.

AR lacked a reusable concise safety introduction. A native dialog now opens on direct launch and warm-iframe activation, with immediate dismissal, Escape support, focus placement and restoration. A separate top chrome cell holds the info button. Opening guidance makes no navigation, camera, or recalibration calls.

The 37-word AR map tour was excessive. All 12 product-tour entries were reviewed and shortened; each heading is at most five words and each description at most 15. The initial tour remains two steps. Navigate hub instructions no longer refer to Begin. Onboarding, feature and AR teaser placeholders, location permission/error dialogs, route recovery, and AR status/alignment messages were inspected. Existing concise messages and detailed diagnostic recovery text remain where useful.

## Before and after copy

| Surface | Before | After |
| --- | --- | --- |
| Tour title | See AR and the map together | Show AR with the map |
| Tour body | Tap the map icon at the top of AR to minimize the camera view. You can then view AR and the 2D map at the same time. Tap the small AR view to expand it again. | Tap Map to minimize AR. Tap the small AR view to expand it. |
| Tour body | Here’s a 30-second look at the controls you’ll use most. Skip anytime. | Explore the main controls. Skip anytime. |
| Tour body | Set a route first, then use camera guidance when it helps. | Choose a route, then open AR for camera guidance. |
| Tour body | Search for a stadium, mall, or campus to jump back in. | Search for a stadium, mall, or campus. |
| Tour body | Tap a venue you already know to open it again. | Tap a venue to reopen it. |
| Tour body | Open the indoor map to search places and plan a walking route. | Find places and plan a walking route. |
| Tour body | Look up a store or amenity, then tap the map to set start and destination. | Search places or tap the map to choose your start and destination. |
| Tour body | Center the map on you and use it as the start of a route. | Center the map on your location to set your route’s start. |
| Tour body | The venue feed is where fans share what’s happening in real time. | See what fans are sharing at your venue. |
| Tour body | Post a quick update to your section. Keep it to 140 characters. | Share an update with your section, up to 140 characters. |
| Tour body | Your pseudo-name, venue, and account live here. | Manage your display name, venue, and account. |
| Tour body | Change notifications, turn this tour on or off, or switch venues anytime. | Manage notifications, tours, and your venue. |
| Route action | Begin | Removed; route tracking starts when ready |
| Route recovery | Reset & start over | Reset route |
| Navigate hub | Begin on the 2D map, then switch to AR when camera guidance helps. | Choose a route on the map, then switch to AR. |
| Location tip | Use your current position as the start point when you begin a route. | Use your location as your route’s start. |
| AR lighting | This spot is too dark for camera tracking. Keep the camera on the path and wait for AR to recover. | Too dark for camera tracking. Keep the camera on the path while AR recovers. |
| AR guidance (new) | — | AR positioning may be inaccurate. Arrows may drift or disappear. |
| AR guidance (new) | — | Watch your surroundings. Don’t rely only on AR. |
| AR guidance (new) | — | Facing the right way but arrows missing? Tap Align route. |

## Audit checklist

- [x] Trace Begin rendering, event delegation, route generation and movement start.
- [x] Remove duplicate start action; retain loading, failure and Reset states.
- [x] Add wrapping route actions and 44px minimum action height.
- [x] Inspect AR launch, preload/activation, top controls and Align route behavior.
- [x] Add dismissible guidance and info reopening without navigation mutation.
- [x] Preserve arrow positioning, recalibration, independent heading and route geometry.
- [x] Review all product-tour entries; retain the short initial tour.
- [x] Audit onboarding, contextual tips, navigation hub, permission/recovery and AR lighting copy.
- [x] Provide named dialog, descriptive info label, decorative icon hiding and focus restoration.
- [x] Use 44px info/dismiss targets, visible focus outlines and high-contrast dialog text.
- [x] Remove AR viewport zoom restriction; constrain dialog height with scrolling.
- [x] Guidance has no animation, forced delay or color-only warning.
- [ ] Verify device layout, 200% text scaling, contrast of all inherited controls and screen-reader announcements.
- [ ] Verify browser focus confinement, Escape and focus restoration with a real browser.
- [ ] Exercise GPS unavailable/denied recovery, camera initialization failure, alignment and progress on hardware.
- [ ] Exercise 2D/AR switching, arrival, reset and active-rendering continuity end to end on hardware.

## Validation

Production TypeScript/Vite build and AR classic-script syntax checks pass. Focused tests cover route-ready start, route failure recovery, Physical Walk integration, navigation presence, tour rendering and guidance preload/dismiss/reopen behavior. Full-suite live API tests cannot resolve the backend hostname. The non-live suite has three remaining failures: API comments venue copy, venue-entry loader copy and the remote-AR default flag. Browser setup failed before connecting because its tool reported missing sandbox metadata; no browser or hardware claims are made.

## Files and follow-up

Modified route UI/event handling (`ui-root.ts`, `ui-root-events.ts`, `styles.css`), route start wiring (`map-app.ts`), tour and hub copy (`tour/domain/entities.ts`, `navigate-hub-screen.ts`), AR document/styles/activation (`ar-nav/index.html`, `css/ar.css`, `js/bootstrap.js`) and new `js/ar-guidance.js`. Updated tour assertions and added guidance/lifecycle regression coverage.

Complete the unchecked browser and device audit before release. Native dialogs place the background UI outside keyboard interaction while open; dismissal is immediate, and rendering is not paused by this implementation. Other permission, lighting or arrival overlays can still require device-level coordination checks. Feature and AR teaser onboarding screens remain placeholders and should receive a separate product review. Build output also retains existing bundle-size warnings.
