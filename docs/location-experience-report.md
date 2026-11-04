> **Current dialog copy — 4 November 2026:** The title is “Location Services” and the message is “Enabling Location Services can enhance your navigation experience. To re-enable this feature, please adjust the relevant settings on your device.” The compact Device, Browser, Finish instructions remain underneath, ending with “Return to Fplaces and refresh.” CLOSE remains the single button. This supersedes the shorter introductory message described in earlier notes.

> **Copy update — 4 November 2026:** At the user's request, the device-location recovery dialog now uses the reference screenshot verbatim: **Location Services**; “Enabling Location Services can enhance your navigation experience. To re-enable this feature, please adjust the relevant settings on your device.” Its single action is **CLOSE**, using the existing dismissal behavior. This replaces the earlier recovery-copy/action recommendations below for that dialog. It applies to the location-required dialog and non-timeout positioning failures with an existing location grant. This copy change does not add an OS master-switch detection API. Focused verification: 43 tests passed across dialog rendering, startup-screen contracts, and dismissal behavior. Earlier full-suite results below are historical, not a new full-suite run for this copy update.

# Location experience implementation and device verification

Date: 3 November 2026. Implementation is available locally. **Release validation is outstanding:** no real mobile browser, OS settings, installed PWA, or native permission prompt was exercised in this environment. Do not treat mocked tests or a successful build as device certification. No deployment was performed.

## A. Architecture audit and changes

The application is a TypeScript PWA with a single `MapApp` and `AppStore`. It already had `LocationService`, permission-choice persistence, a three-screen location gate, a live user-position watch, SDK blue-dot sensors, and independent navigation position providers. This work extends those mechanisms; it does not introduce another permission store or dependency.

| Area / file under `mappedin-pwa/src` | Finding and implementation |
| --- | --- |
| `services/map-app.ts`: constructor | Restored permission choice is a preference, not proof of current browser access. Initial observation is passive. No watch starts solely from that restored choice. |
| `services/map-app.ts`: `beginLocationPermissionGate` | Authentication and venue-entry call sites now continue onboarding without querying or acquiring GPS and without presenting the location gate. The former startup-gate implementation was removed. |
| `services/map-app.ts`: `maybeAutoStartBlueDot`, `startLiveUserLocationWatch` | Require location intent in this session. A passive grant after login is insufficient. A stored grant cannot start tracking after logout. Active Physical Walk and simulation retain position ownership. |
| `services/map-app.ts`: contextual location actions | My Location, venue-presence checks used by navigation/AR, and route movement use the existing gate. The original action can await a permission result and continue on acquisition; Not Now resolves it as cancelled. Existing route identity checks protect a route replaced while the user was deciding. Rapid location taps are ignored while acquiring. |
| `services/location-service.ts` | Missing/rejected Permissions API queries return `unknown`, distinct from `prompt`. Insecure contexts or missing geolocation return unsupported. Concurrent one-shot acquisitions share a pending promise. High-accuracy acquisition retains one relaxed-accuracy fallback for codes 2/3. Each attempt also has an application deadline (`timeout + 1 second`) for browsers that never call back. Late callbacks are ignored; settled requests are not cached. An application deadline does not start the fallback because a native permission prompt may still be open. |
| `location/domain/geolocation-permission.ts` | Added unknown permission and typed failure classification. Browser denial is only confirmed by a denied permission query. Code 1 with granted/unknown permission is restricted/uncertain access; code 2 never means the device switch is known to be off. Timeout remains distinct. |
| `types.ts`, `location/domain/location-gate.ts` | Permission preference remains separate from acquisition (`locationGateLoading`), position (`userLocation`), and typed failure (`locationFailure`). These can coexist; a GPS timeout does not erase a confirmed grant. |
| `services/map-app.ts`: lifecycle refresh | Reuses event-driven service observations and request generations. Fresh queries on foreground return; permission status change events where available; no polling. Confirmed grant dismisses stale permission UI and can acquire for a requested action. Confirmed denial does not trigger another native prompt. Unknown/prompt on return offers an explicit action instead of speculatively prompting. |
| `ui/location-permission-screen.ts` | Contextual copy for initial access, blocked access, uncertain restrictions, unavailable location, timeout, and unsupported context. Retry for acquisition failures. Help expands only on request. Not Now is always available. Raw provider errors are not interpolated into HTML. |
| `location/domain/location-help.ts` (new) | OS/browser-specific help and installed-app caveats. Browser identity affects copy only. Brave can expose its brand capability; browsers that conceal it may receive equivalent Chromium guidance with an explicit Brave caveat. |
| `ui/location-dialog-focus.ts` (new), `ui/ui-root.ts`, `ui/ui-root-events.ts` | Capture/restore opener focus, focus modal controls, preserve expanded help across full rendering, trap Tab/Shift+Tab, Escape dismissal, inert background siblings. Screen-reader title/description/modal/busy semantics. |
| `styles.css` | Safe-area-aware modal already existed; added location symbol, expandable primary help control, visible focus styling, and fixed viewport backdrop. Existing bounded dialog scrolling retained. |
| `location/domain/location-diagnostics.ts` | Existing bounded diagnostic buffer now records only in development. Includes request source, physical/simulated intent, permission/lifecycle transitions, dialog dismissal, deadline, and retry events. Service success console logs omit precise coordinates. |
| Tests | Updated service, synchronization, dialog, startup-screen, classification, and Physical Walk integration coverage. See actual execution results below. |

The working tree contained pre-existing edits to location, AR, navigation, social UI, configuration, and tests. Those were preserved. Git diff includes work predating this request; this report lists this task's incremental changes, not ownership of every dirty line.

### Position owners and error behavior

- One-shot/current-user GPS: `LocationService`, consumed by `MapApp`.
- Idle blue dot: `map/markers.ts` SDK sensor. It is allowed to start after a location action; navigation providers remain responsible during navigation.
- Navigation: `position/providerRegistry.ts`, `position/providers/*`, and `MapApp` route progress.
- Physical Walk: `position/physical-walk/*` owns its transformed GPS session. Permission changes do not inject unrelated fixes into that session.
- AR: `services/ar-service.ts`, the position bridge, and `ar-nav/js/route-navigator.js` retain heading, calibration, route handoff, and standalone AR GPS behavior. Standalone AR now uses friendly unavailable/timeout copy instead of displaying raw GPS errors; `ui/live-navigation-ui.ts` also uses neutral recovery copy. These requests occur in a launched AR workflow, not sign-in.
- Simulation: existing injected positions are retained on permission revocation. My Location focuses the simulated position rather than requesting physical GPS while route simulation owns position. A late gate result cannot replace a position after simulation/Physical Walk starts.

Navigation, SDK sensors, and AR may legitimately have their own streaming subscriptions. The shared promise deduplicates one-shot reads, not all streams across every provider/iframe. Their existing ownership boundaries were preserved.

### Deliberate restrictions

There is **no device-location-off dialog** because none of the current web integrations supplies a reliable OS master-switch signal. A failed GPS request, code 1, or code 2 does not prove that switch is off. Ambiguous failures use Location Unavailable and troubleshooting.

There is **no Open Settings deep link**. The reviewed web/native documentation did not establish a reliable supported system/browser/site-settings shortcut for these ordinary web/PWA environments. Apple’s settings-opening API is UIKit, not a web capability. Chrome's intent launch mechanism requires a resolvable browser-launchable activity and does not establish support for arbitrary system settings. Help labels promise instructions, not a settings launch.

## B. Compatibility assessment

All rows: geolocation must be available in a secure context; Permissions API query/change are used only if exposed and successful. Every row uses focus, pageshow, visible/resume events with a coalesced check. A queried grant can resume pending location work; unknown/prompt requires a tap. A queried denial stays in recovery help. No row has a universal master-location-switch detector or a settings-opening link.

| Environment | Permission detection | Recovery shown | Lifecycle and limits | Verification |
| --- | --- | --- | --- | --- |
| Safari / iOS | Conditional query/change; unknown fallback | iOS Location Services, Safari Websites, Safari Page Menu / Website Settings if available | Native decisions and event delivery vary by version | Documentation assessment + generic mocks; device pending |
| Chrome / iOS | Same feature detection | iOS Location Services / Chrome app permission; site controls if available | Do not show Android Site settings path | Documentation assessment + generic mocks; device pending |
| Brave / iOS | Same; brand may be concealed | iOS Location Services / Brave app permission; browser controls if available | Privacy restrictions may prevent acquisition despite permission | Generic platform assessment/mocks; exact menus need device verification |
| Firefox / iOS | Same | iOS Location Services / Firefox app permission; browser controls if available | Unknown state requires explicit tap | Generic platform assessment/mocks; exact menus need device verification |
| Chrome / Android | Conditional query/change | Device Location, app permission, site information / Permissions or Site settings / Location | Approximate permission and provider availability affect accuracy | Official documentation assessment + mocks; device pending |
| Brave / Android | Conditional query/change | Device/app permissions and Brave Settings / Site settings / Location or All sites | May identify as Chrome; equivalent Chromium controls are explained | Official Brave Android documentation + mocks; device pending |
| Firefox / Android | Conditional query/change | Device/app permission; browser Site permissions / Location and blocked decision if available | Temporary decisions and UI labels vary | Mozilla permission behavior assessment + mocks; exact Exceptions path needs device verification |
| Installed iOS PWA | Runtime API capability, not assumed tab equivalence | Check Fplaces entry if listed plus installation browser settings | Permission may differ from browser tab; process may be killed; pending actions are intentionally not persisted across reload | Mocks only; installed-device verification pending |
| Installed Android PWA | Runtime API capability | Fplaces app entry if listed or installation browser; site controls | Installation packaging can change permission ownership; foreground events not guaranteed | Mocks only; installed-device verification pending |

Safari on Android has no supported Apple distribution and is not a release target. No claim of support for an unspecified older browser version is made. Establish minimum versions after device verification. Private/restricted contexts may expose APIs but prevent fixes; use the neutral help flow.

### Sources reviewed

- [W3C Geolocation](https://www.w3.org/TR/geolocation/) — error codes, secure-context permission and acquisition model; the current specification is a draft. It offers no master-switch-state API.
- [Apple location privacy and settings](https://support.apple.com/en-us/102515) — OS Location Services and per-app controls.
- [Apple iPhone location controls](https://support.apple.com/en-euro/guide/iphone/iph3dd5f9be/ios) — Privacy & Security / Location Services.
- [Chrome location on Android](https://support.google.com/chrome/answer/142065?co=GENIE.Platform%3DAndroid&hl=en) — site information / Permissions and Site settings / Location.
- [Chrome location on iOS](https://support.google.com/chrome/answer/142065?co=GENIE.Platform%3DiOS&hl=en) — Chrome's iOS app location controls.
- [Mozilla Android app permissions](https://support.mozilla.org/en-US/kb/how-firefox-android-use-permissions-it-requests) and [Mozilla location permission](https://support.mozilla.org/en-US/kb/does-firefox-share-my-location-websites) — app versus website consent, temporary grants.
- [Brave Android site permissions](https://support.brave.app/hc/en-us/articles/35849239473037-How-do-I-change-or-manage-site-permissions-Android) — Settings / Site settings, permission categories and All sites.
- [Brave site permissions](https://support.brave.app/hc/en-us/articles/360018205431-How-do-I-change-site-permissions) — confirms permission model; this article primarily documents desktop, not every mobile menu.
- [Chrome Android intents](https://developer.chrome.com/docs/android/intents) — intent restrictions. A native Android settings intent is not evidence of a reliable web shortcut.
- [Apple UIKit settings URL](https://developer.apple.com/documentation/uikit/uiapplication/opensettingsurlstring) — native API, not PWA API.

Menu labels depend on OS/browser releases. Exact iOS third-party browser, Firefox Android Exceptions, Brave iOS, and installed-PWA paths still require manual confirmation; help includes conditional language rather than claiming universal paths.

## C. Reproducible manual checklist

### Test setup

Use a staging HTTPS deployment of this working tree with the correct backend and venue credentials. Record URL, commit/worktree revision, device model, OS version, browser version, browser tab versus installed app, and approximate versus precise location setting. Keep current simulation/demo flags recorded: the existing working tree enables development behavior that can affect venue restrictions. Use a physical-location configuration for GPS/venue tests and a separate simulation workflow for simulation tests.

To reset permission, use site controls to change Fplaces Location to Ask/reset the blocked decision, if offered. If your browser cannot reset one site, use a clean test profile or its documented site-data reset; this may sign you out. Do not reset all device privacy settings just for this test. iOS Settings can place app controls under Settings → Apps → browser on newer versions; Privacy & Security → Location Services is the preferred common path. Android vendor labels vary.

Run tests 1–18 in **each** of these environments, tracking a separate result per row. Run AR tests only where camera/orientation AR is supported; record unsupported separately, not passed.

| Result | Device/browser |
| --- | --- |
| ☐ Pass ☐ Fail ☐ Blocked | iPhone Safari tab |
| ☐ Pass ☐ Fail ☐ Blocked | iPhone Chrome tab |
| ☐ Pass ☐ Fail ☐ Blocked | iPhone Brave tab |
| ☐ Pass ☐ Fail ☐ Blocked | iPhone Firefox tab |
| ☐ Pass ☐ Fail ☐ Blocked | Android Chrome tab |
| ☐ Pass ☐ Fail ☐ Blocked | Android Brave tab |
| ☐ Pass ☐ Fail ☐ Blocked | Android Firefox tab |
| ☐ Pass ☐ Fail ☐ Blocked | iPhone installed Fplaces (record installing browser) |
| ☐ Pass ☐ Fail ☐ Blocked | Android installed Fplaces (record installing browser) |

In a development build, inspect `[IndoorNav/LocationService]`, `[IndoorNav/LocationGate]`, and the existing location diagnostic report. `recordLocationDiagnostic` retains up to 40 events. Relevant events are listed below; absence of development logging in a production build is expected. Never send precise coordinates or credentials in a bug report.

| Result / test | Prerequisites | Exact actions | Expected result | Failure signal / diagnostic |
| --- | --- | --- | --- | --- |
| ☐ 1. Sign-in isolation | Location reset to Ask; device Location on | Open app; sign in; select venue if asked; wait 35 seconds; reload; background and return | No location modal, native GPS prompt, or GPS acquisition solely from auth, reload or focus | Any `position-request` without a location action; any auth-triggered modal |
| ☐ 2. Returning grant | Grant site access first, close app fully | Reopen authenticated app without touching location; wait 35 seconds | Passive permission detection only; no new acquisition | `position-request` before contextual feature use |
| ☐ 3. First request | Device on; site Ask | Open map; dismiss product tour if shown; tap My Location; tap Allow Location; accept native request | One app modal; native request originates from Allow; fix/blue dot and original action continue | Settings help shown before trying first request, duplicate native requests; `contextual-action`, `gate-attempt`, `position-success` |
| ☐ 4. Not Now | Site Ask | Tap My Location; tap Not Now; switch apps and return | Map stays usable; no unsolicited reopened modal or GPS; tap My Location again to request anew | Reopened modal, stuck loading, route reset; `dialog-dismissed` |
| ☐ 5. Native denial | Site Ask | Request location and select Deny in native prompt | Confirmed denied query shows Allow Location Access / How to Allow Access. If status cannot confirm denial, neutral Location Unavailable | “Device services are off” claim; endless prompt retry; `position-failed` code 1 and fresh `permission` |
| ☐ 6. Already blocked | Deny Fplaces in site controls | Reload; sign in if needed; tap My Location; expand How to Allow Access | No GPS request for a confirmed block; correct platform help; Not Now remains available | Repeated native prompt attempts or Android help on iOS |
| ☐ 7. Denied → granted | Open blocked recovery dialog | Leave Fplaces; allow site and browser app location; return | Fresh check; queried grant closes stale dialog; position acquisition resumes pending action. If status unknown/stale, explicit Allow Location is available; tap it | Requires reload on a runtime reporting fresh grant; stale blocked-only UI after reset; `lifecycle-refresh`, `position-success` |
| ☐ 8. Granted → denied | Active acquired user location | Leave for settings; deny site permission; return | User-position watch stops on detectable denial; current route/AR selection preserved; next location action offers recovery | Continued user-position publication from old watch or route cleared; `permission` denied |
| ☐ 9. Device Location off → on | Site/browser app permission allowed | iOS: Settings → Privacy & Security → Location Services off. Android: Settings → Location → Use location off. Open Fplaces; tap My Location; inspect dialog and expand help; turn services on; return; retry if necessary | Neutral restriction/unavailable/timeout based on evidence, never an unverified device-off diagnosis. Help matches OS. Return/retry obtains a fix when provider recovers | Confirmed “services off” diagnosis solely from code 2; no retry; persistent loader. Inspect error category and fresh permission |
| ☐ 10. Browser app permission off | Site allowed; device Location on | OS app settings: deny location for browser (or installed app if listed); return and request location; expand help; restore While Using; return | Restricted or confirmed browser-denied flow according to available evidence; no unsupported settings launch | False claim about master switch; help names wrong platform; code 1 classification |
| ☐ 11. Dismiss native decision | Site Ask | Tap Allow Location; dismiss native request if browser permits; otherwise leave it unanswered; wait approximately 32 seconds in foreground | Provider returns an error or application deadline ends loading; retry is bounded; app dialog remains dismissible. Browser-owned prompt may remain and cannot be closed by Fplaces | Endless app loader or repeated unbounded requests; `position-deadline`, at most one relaxed fallback |
| ☐ 12. Rapid taps and late completion | Site Ask or granted; slow reception | Tap My Location five times quickly; start request then tap Not Now before it completes | One app gate/acquisition sequence; late result cannot reopen UI, replace cancelled state, or start blue-dot tracking | Multiple dialogs, cancelled result accepted; request IDs and `dialog-dismissed` |
| ☐ 13. Weak signal / timeout | Permission granted | Request location indoors with weak reception; if it still succeeds use deterministic mocked timeout test instead of claiming a timeout was tested; retry near a window | Unavailable and timeout are distinct from denied; one relaxed fallback; Try Again works; grant retained | “Allow permission” diagnosis for known grant; loader beyond deadline; `retry-relaxed-accuracy` |
| ☐ 14. 2D navigation | At selected venue with supported positioning and a route | Tap My Location; walk a short safe path; select destination; start route; follow turns; pause/resume as supported | Blue-dot updates, accuracy behavior, route progress, destination and alignment retained | Frozen dot, unexpected route reset, jumping position; provider/BlueDot logs |
| ☐ 15. AR regression | Supported camera/orientation; valid route | Launch AR; grant requested media/orientation permissions; calibrate; walk; recalibrate; minimize and reopen AR | Position initializes; heading, arrows, route alignment, progress and calibration behave as before | Misaligned route, missing heading, unexpected location prompt when simulated; AR/provider logs |
| ☐ 16. Simulation isolation | Existing supported simulation workflow active | Start simulation; deny browser location in settings; return; tap My Location; continue simulated route; use AR if supported; switch back to physical workflow | Simulated coordinates/progress preserved, focus uses simulated dot; no physical GPS demand from My Location; physical workflow requests access contextually | GPS overwrites simulated position, route reset, unexpected native prompt |
| ☐ 17. Background/suspension | Active route or open recovery UI | Background for two minutes; return; repeat via settings; force OS to evict app if possible; relaunch | Delivered lifecycle events refresh access. Process reload starts without unsolicited GPS; user restarts action as needed. No promise of restoring in-memory pending actions after process death | Old permission modal reappears spontaneously after dismissal or auth starts GPS; `lifecycle-refresh` |
| ☐ 18. Accessibility/small screen | Small display, large text; VoiceOver/TalkBack or hardware keyboard | Open each dialog; expand help; Tab/Shift+Tab; Escape; dismiss; rotate screen | Title/description announced; background inert; focus stays in modal and returns to opener when present; content scrolls above safe areas; Not Now visible | Focus behind dialog, clipped actions, help closes during unrelated rerender |
| ☐ 19. Installed app settings ownership | Each installed PWA; installing browser known | Deny location in installed app; change browser permission only; return; then change installed app permission if listed; return | Treat app/tab permissions as potentially separate; help identifies both; fresh grant resumes only a requested action | Assuming browser grant always grants installed app; app starts GPS on cold launch |
| ☐ 20. Restrictive/private mode | Each browser's private mode if available | Open HTTPS Fplaces privately; sign in if supported; request location; deny or observe restriction; expand help | Neutral fallback where status is unknown; supported manual map browsing remains possible | Unsupported privacy diagnosis asserted as fact; repeated prompts |
| ☐ 21. Network interruption | Existing route loaded; permission granted | Turn network off; request location; navigate if cached route supports it; restore network and retry | Provider may succeed via GPS or return bounded unavailable/timeout; no permission denial inferred from network failure | Permissions changed to denied because GPS/network failed |
| ☐ 22. Permission change during navigation | Active 2D then AR route | Revoke permission in settings while route is active; return; restore permission; return | Route selection/progress not reset by permission management; detectable access state updates; positioning recovers through existing provider/action flow | Simulation overwritten or route reset; provider health and lifecycle logs |

Tests 1–12 and 17–22 require real devices for native decisions, OS settings, and lifecycle claims. Mock tests directly cover failure codes, query rejection, coalescing, request sharing, deadlines, late callbacks, and simulation guards; they do not prove browser internals. Test 13 may be nondeterministic on physical hardware. Test 14/15 require the venue and appropriate hardware/provider setup.

## D. Automated verification

Actual results from this session:

| Check | Result |
| --- | --- |
| Full Vitest suite | **1,078 passed, 13 failed, 4 skipped; 1,095 total tests**. 166 test files: 159 passed, 6 failed, 1 skipped. |
| Focused location/navigation checks | **119 passed, 0 failed, 0 skipped** across nine files; rerun after final recovery and help changes. |
| Production build | TypeScript, AR script verification/copy, Vite production build and PWA generation passed. Existing large-bundle warning remains. |
| Static repository detector | `npm run slop --prefix mappedin-pwa`: 0 errors, 6 existing duplicate-helper warnings. |
| Whitespace check | `git diff --check`: passed. |
| Browser/device checks | Not executed successfully; see limitation below. |

Commands executed:

```sh
npm test --prefix mappedin-pwa -- --reporter=dot
npm test --prefix mappedin-pwa -- --reporter=json --outputFile=/tmp/fplaces-location-release-results.json
npm run build --prefix mappedin-pwa
npm run slop --prefix mappedin-pwa
git diff --check
```

The focused run used `vitest run` with these nine files explicitly selected:

| Test file under `src` | Passed cases | Coverage added, updated, or retained |
| --- | ---: | --- |
| `services/location-service.test.ts` | 12 | Unknown vs prompt, unsupported/insecure context, high/relaxed accuracy, shared requests, bounded nonresponsive browser, late callback ignored, deduplication released |
| `services/location-permission-sync.integration.test.ts` | 22 | Passive grant does not acquire, auth bypass, pending action resolution/cancellation, unknown/prompt/denied return does not prompt, grant recovery, revocation race, lifecycle coalescing/cleanup, missing/rejected API, simulation preservation |
| `services/location-gate-dismiss.integration.test.ts` | 10 | Every gate dismisses, late success/failure ignored, preflight invalidation, direct user-gesture acquisition |
| `services/startup-location-flow.integration.test.ts` | 6 | Domain flow and service grant/deny/fallback contracts; actual auth-bypass regression is in the synchronization suite |
| `services/physical-walk.integration.test.ts` | 15 | Existing physical-provider behavior plus user-intent gating for idle sensor startup and physical ownership retained after a late permission result |
| `ui/location-permission-screen.test.ts` | 17 | Correct initial/blocked/uncertain/timeout/unavailable/unsupported copy/actions, hidden help, no raw error injection, per-platform browser guidance, dismissal |
| `ui/startup-flow-screens.test.ts` | 12 | Existing auth markup plus new contextual dialog action/copy contracts |
| `services/location-diagnostics.test.ts` | 3 | Existing lifecycle diagnostics, accuracy without coordinates, error/fallback categories |
| `location/domain/geolocation-permission.test.ts` | 22 | Eight added typed failure-classification cases plus existing permission/gate helpers |

Failures retained and reported:

| File | Failed cases | Observed cause |
| --- | ---: | --- |
| `guest/guest-backend.e2e.test.ts` | 5 | Backend hostname DNS lookup failed (`ENOTFOUND`) |
| `routing/guest-indoor-routing.e2e.test.ts` | 2 | Same unavailable backend/token prerequisite |
| `forum/data/datasources/fplaces-backend-live.e2e.test.ts` | 3 | Same unavailable backend |
| `ui/api-backed-screens.test.ts` | 1 | Remote-comment copy expectation differs from current development behavior |
| `ui/page-loaders.test.ts` | 1 | Expected “Entering venue…” loader copy differs from current markup |
| `location/domain/venue-presence.test.ts` | 1 | Test expects remote AR disabled, while existing development configuration enables it |

The last three discrepancies are outside this permission change and match issues already noted in the pre-existing verification notes. They were not hidden or fixed by changing unrelated expectations. Network-dependent test success still requires a reachable backend. Four skips: three pointer-DOM camera-follow cases in `map/camera-follow-release.test.ts` and the real-Three.js frustum case in `ar/trail-stability.test.ts`. Their required DOM/Three capabilities are absent in this test runtime.

One intermediate full run overlapped AR public-asset copying and reported an AR asset suite read failure; rerunning after the copy finished removed that artifact. The final full-suite numbers above exclude that transient failure. After that full run, the final help-copy clarification was covered by the focused rerun and production build.

Live-backend failures were not silently skipped. Browser rendering could not be exercised: browser control failed at startup with missing sandbox metadata; starting Vite also failed with `listen EPERM` on localhost. No browser/device pass is claimed. Keyboard/focus handling is implemented but still requires the explicit real-DOM/accessibility checks in test 18.

## E. Remaining limits and fallback

1. No universal OS switch detection → neutral troubleshooting, never fabricated device-off diagnosis.
2. No established reliable cross-browser settings shortcut → expandable manual OS/browser instructions.
3. No trustworthy permission API → explicit native request through Allow Location. Returning from settings alone does not probe unknown/prompt/denied states and risk another native prompt. This deliberately favors user control over pretending silent detection is possible.
4. A stale denied query can persist on some runtimes → blocked help remains until runtime updates, site reset/reopen, or user-triggered permission flow becomes available. Immediate silent recovery cannot be guaranteed.
5. Browser process death loses pending in-memory work → cold launch stays passive; user restarts the feature. Navigation persistence is unchanged.
6. Web geolocation requests cannot be aborted → late callbacks are ignored. Application deadlines do not close native prompts or guarantee browser-internal work stops; one bounded fallback is retained.
7. Provider hardware, approximate permission and indoor reception constrain accuracy → existing accuracy/positioning and venue checks retained; retry does not promise a fix.
8. Exact mobile menus and visual/screen-reader behavior require device validation. Some installed-PWA permission ownership is version-dependent.
9. Existing independent streaming providers/AR are preserved; this is not a rewrite of their error/health protocols or a guarantee of uninterrupted GPS after OS suspension.

## F. Device evidence needed

Please run the checklist on your iPhone and Android, recording each environment separately. For a failure, provide test number, device/OS/browser version, tab versus installed app and installing browser, permission state before/after, expected versus observed dialog/action, and a screenshot of that dialog or settings path. In development, include the last location diagnostic events with precise coordinates, tokens, and account details removed. Start with 1, 3, 6, 7, 9, 14, 15, 16 and 19 on both devices before release approval. No minimum browser-version certification or production readiness is claimed until this evidence is reviewed.
