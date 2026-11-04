> Historical verification notes from the pre-existing working tree. The current behavior and test results are documented in [Location experience report](location-experience-report.md). In particular, authentication no longer runs the location gate, recovery dialogs now include actions, and unknown/prompt/denied lifecycle checks do not automatically request GPS.

# Location release verification — 2026-11-01

The public page at https://fplaces.netlify.app/ loaded `/assets/index-DkHdXaKk.js`
when inspected during this session. That bundle still contains the 750 ms location
permission polling loop and the loading guard deadlock: the settings-return helper
sets locationGateLoading before calling a request helper that refuses requests
while loading. It contains the old diagnostic dialog and does not contain
observePermissionChanges or locationSyncGeneration. This verifies that the live
site has not received the local location synchronization fix. It does not prove
that this is the only cause of the user's Safari symptom.

A location-only release was prepared from committed base f7570fc, applying only
the location patches and excluding pending navigation, AR and unrelated UI changes.

- Artifact: `/private/tmp/fplaces-location-release-52c3a56v/mappedin-pwa/dist`
- Manifest: `/private/tmp/fplaces-location-release-52c3a56v/release-verification.json`
- Built entry: `/assets/index-CQQKR7Ra.js`
- Verification: 89 tests passed across nine targeted files in the isolated release.
- Production build: passed TypeScript, AR syntax checks, Vite and PWA generation.
- Bundle inspection: observer and generation guards included; old technical dialog
  and the loading deadlock removed.
- Real Safari settings/OS testing: not yet performed.
- Deployment: not performed; publishing this artifact needs user approval.

The immediate next step is to deploy this prepared artifact, verify the public
bundle changes, and then reproduce Deny → Allow in Safari. If the symptom remains
on the updated bundle, capture the browser/device version and distinguish stale
permission UI from an unavailable GPS fix before making further changes.
