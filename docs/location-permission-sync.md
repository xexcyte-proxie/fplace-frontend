> Historical verification notes from the pre-existing working tree. The current behavior and test results are documented in [Location experience report](location-experience-report.md). In particular, authentication no longer runs the location gate, recovery dialogs now include actions, and unknown/prompt/denied lifecycle checks do not automatically request GPS.

# Location permission synchronization

## Root cause and implementation

The previous settings-return path set `locationGateLoading = true` before calling
`runLocationGateRequest`, whose loading guard then rejected the request. It only
handled permanently denied dialogs and polled every 750 ms. It did not subscribe
to browser permission changes, and stored grants started a watch before browser
permission was checked.

`LocationService.observePermissionChanges` now supplies event-driven observations
to the existing MapApp/store, rather than maintaining a second permission store.
It uses feature detection for Permissions API query support and PermissionStatus
change listeners (with `onchange` fallback). MapApp re-queries on focus, visible,
pageshow, and resume events. Blur, pagehide, and hidden events mark a real return
from outside the app. A one-shot 100 ms timer combines event bursts; no polling
interval remains. Listener setup and teardown cover pending asynchronous setup,
and Vite hot replacement releases the app's listeners.

A confirmed grant closes any location gate immediately. Fresh acquisition then
uses a small nonblocking status indicator. Simultaneous acquisition callers share
one pending request; settled results are not cached in the service. Permission
approval remains granted after timeout or provider-unavailable errors. A denial
from the device while the Permissions API still reports granted is described as
a device access restriction, rather than incorrectly changing the browser grant.
Standard numeric error codes also work when browser wrappers omit constants.

Permission events invalidate older queries and gate results. Foreground checks
are serialized, retaining the latest permission event. The live user-location
watch and direct map/location acquisitions guard against late results. Existing
position providers remain responsible for active navigation. Synchronization
does not rebuild maps, restart AR, replace routes, reset route progress, or start
GPS over Physical Walk/route simulation. Revocation stops the app's user-location
watch without resetting navigation or simulated position.

## Fallback and prompt limits

If the Permissions API is missing, rejects geolocation queries, or reports a stale
prompt/denied state, returning to an open location gate after an earlier user
location request allows one targeted geolocation acquisition. A successful fix is
proof of access and closes the gate. Initial unknown/prompt state never triggers
an automatic permission request. There is no continuous GPS retry loop. Normal
foreground checks without an open gate do not automatically request unknown
permission; users can request location explicitly through the existing location
control. The error/help dialogs retain **Not now** as their only button, per the
user's instruction; dismissing them leaves that location control available.

A web application cannot silently determine permission when the browser exposes
neither a trustworthy status nor an event. A targeted geolocation call can cause
the browser's own prompt if permission is actually unset. That prompt cannot be
suppressed programmatically. Native prompts, privacy restrictions, and OS settings
remain browser-controlled. A foreground check is not guaranteed if the browser
emits no lifecycle signal. No implementation can guarantee immediate recognition
in those cases.

The standard acquisition API exposes denial (1), unavailable (2), and timeout (3).
It does not expose a universally reliable separate “device Location switch off”
error. Device services, OS restrictions, provider/privacy failures, and indoor
reception may overlap; guidance mentions settings and reception without inventing
a more specific diagnosis. Unsupported geolocation retains the settings/help flow;
changing browser or device is necessary if the API itself is unavailable.

## Browser compatibility matrix

The mechanisms below are selected at runtime, with no browser-name detection.
“Conditional” means enabled only if that runtime exposes the API; it is not a
claim of tested support for every version or platform.

| Browser/platform | Permission detection | Fallback | Actually verified here |
| --- | --- | --- | --- |
| Chrome desktop/Android | Conditional query + change event | Foreground re-query; targeted gate acquisition | Mocked API/lifecycle tests only; no device run |
| Edge / other Chromium | Conditional query + change event | Same capability-based fallback | Mocked API/lifecycle tests only; no browser run |
| Brave | Conditional query + change event | Foreground re-query; acquisition may fail due to privacy/provider restrictions | Error paths tested with mocks; no Brave run |
| Firefox desktop/Android | Conditional query + change event | Foreground re-query; targeted acquisition for unsettled status | Mocked API/lifecycle tests only; no browser run |
| Safari iOS/macOS | Conditional query + change event; do not depend solely on either | Visible/focus/pageshow/resume re-query and targeted gate acquisition | Missing/rejected/stale API scenarios mocked; no Safari run |
| iOS installed PWA | Same feature detection as the installed runtime | Lifecycle return from Settings, subject to OS event delivery | Visibility/pageshow/resume simulated; no installed-device run |
| Samsung Internet / Android PWA | Conditional query + change event | Lifecycle re-query and targeted gate acquisition | Mocked API/lifecycle tests only; no device run |
| Other standards-compliant runtimes | APIs actually exposed by runtime | Explicit existing location control where silent detection is unavailable | Capability branches mocked only |

## Verification

91 tests passed across nine targeted files: service acquisition, diagnostics,
startup flow, dismissal, dialog actions, domain permission helpers, Physical Walk,
and the new synchronization integration suite. TypeScript compilation passed.

The new tests cover grant dismissal before GPS completion, acquisition codes 2/3,
revocation winning over an outstanding fix, overlapping lifecycle checks,
unknown initial permission without prompts, stale prompt/denied recovery,
grant reset to prompt, device restriction with browser permission granted,
preservation of route and Physical Walk state, missing/rejected Permissions API,
event coalescing without polling, listener disposal (including late query setup),
and shared acquisition requests. These are deterministic simulated API tests,
not real browser permission-settings tests.

A full-suite run before the final additional cases reported 1,036 passed,
13 failed, and four skipped tests. Failures were in backend-dependent guest/forum/
routing checks and venue-presence/UI-loader/comment tests outside the location
checks. The full suite is therefore not reported as passing.

Release validation still needs real Deny → Allow, Allow → Deny, temporary grants,
device location off/on, background/settings return, installed PWA restoration,
and active 2D/AR navigation checks on each supported browser/device. No deployment
was performed as part of this change.

## Platform references

- [PermissionStatus change event](https://developer.mozilla.org/en-US/docs/Web/API/PermissionStatus/change_event)
- [Permissions query](https://developer.mozilla.org/en-US/docs/Web/API/Permissions/query)
- [Page visibility changes](https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilitychange_event)
- [pageshow and page restoration](https://developer.mozilla.org/en-US/docs/Web/API/Window/pageshow_event)
- [Geolocation request options](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition)
- [WebKit report of delayed permission reflection](https://bugs.webkit.org/show_bug.cgi?id=275268)
