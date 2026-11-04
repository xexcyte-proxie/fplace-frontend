# Social demo data

Demo social content is enabled by default on the public app. No query parameter
is required. `?socialDemo=1` explicitly enables it in a browser tab. Open `?socialDemo=0` to return to
real social feeds. Reloading resets local sample interactions and regenerates
the sample content. This does not skip the application's sign-in or venue setup.

The demo uses the actual read-only venue, section, and category catalogs. For each
opened venue it generates four posts per active category, two comments per post,
and varied authors, timestamps and upvotes. Food, crowd, fan-vibe and Alerts posts
use category-specific content. Opening a map conversation generates three starter
messages scoped to that venue and map location.

Sample authors use a shared pool of ten pseudonymous usernames, mixing merged
names, nicknames, initials, and number suffixes. Eight are international-style
and two are African-inspired (an 80/20 mix) across posts, comments,
and map conversations. The public UI does
not include a demo banner or demo prefixes, per the requested presentation.
Alerts are general planning reminders, not simulated live emergencies or venue
announcements. There is no fake online-presence WebSocket connection.

The repository routes social reads and mutations to an in-memory dataset while
this mode is active. Only the explicitly allowlisted catalog reads can reach the
normal repository; unhandled social operations fail locally rather than falling
through to production. Posts, comments, reactions and conversation messages are
never sent to the forum backend. The normal app's authentication, maps and other
non-social services remain unchanged.

Verification: 142 targeted tests covering social demo, feed rendering, location,
navigation, and AR passed. Production compilation and build passed. Tests cover default-on behavior and explicit opt-out,
tab-scoped exit, blocked storage, venue/category isolation, concurrent seed reuse,
content length, author names, comments, local mutations, map conversations, socket
isolation, and returned-data copies. Deployed to https://fplaces.netlify.app/ on 2026-11-01.
Netlify deployment: `6ae7591e96d8ce24286872c6`. Public HTML and service worker
reference `/assets/index-CnabI9sm.js`; its downloaded bytes match the tested build.
Browser visual verification was unavailable because the browser connection failed.
