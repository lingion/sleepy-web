# Web portable import parity with Android v1.0.64

Reference: immutable Android checkout `android-v1064-reference`, commit `77b878fd5c8903a3f201ea938b3b152de4c4fbc0`. This work changes the Web import and export paths. Main owns the shared model, database migration, settings, backups, and deployment.

## WakeUP share codes

The online path uses the Android v6.1.70 protocol: antispam POST, private DES signB decoding, signed share POST, RC4 payload decoding, and five-part shareData conversion. Bare codes and labelled 分享口令 text enter it. JSON, native text, CSV, HTML, and ICS remain local. Cancellation stops the request chain; each POST has a 15 second deadline. Codes and signatures are not logged.

The crypto module is adapted from the MIT licensed Android bundled `third_party/shiguang/js/GLOBAL_TOOLS/wake_up.js`. Its reference SHA-256 is `63b97fb525f604dfd7b227f4a68c8290390d2224543ce5cba83d1ccb2bf998b8`. The exact Android golden vectors in `app/src/test/resources/jw/wakeup/vectors.json` have SHA-256 `812e11dd84a97d91a2e86c75ad695fd49fc9b3764c216940e122d11efa9749ed`. Attribution and license are retained beside the Web crypto module. The private DES and native hex functions must not be replaced with standard library DES.

The worker relays only POSTs to the two exact official paths on `https://api.wakeup.fun`. It rejects academic URLs, other hosts, credentials, queries, fragments, methods, and redirects. It does not forward cookies or authorization. Request bodies are bounded at 64 KiB and responses at 8 MiB while streaming. `VITE_WAKEUP_PROXY_BASE` can select a deployed instance of this worker; the default is the existing Sleepy relay.

Verification on November 10, 2026: `npm test -- src/domain/import/wakeupShare.test.ts src/domain/import/wakeupRelay.test.ts` passed 9 tests, including the complete encrypted request chain against an in-process server mock, exact Android vectors, date conversion, cancellation and relay restrictions. This proves offline protocol equivalence, not a successful import of a live valid share code.

The existing deployed relay returned HTTP 204 for a real browser-style CORS preflight on November 10, 2026. Its advertised methods are still GET, POST, HEAD, OPTIONS. Main must deploy the restricted worker before claiming that its academic URL guard is active on the server. No worker was deployed by this task.

## Export fields and ICS dates

Both the export screen and top-bar share sheet serialize fixedDate and raw importSourceJson. Share text uses the sleepy-v1 marker format, preserving aliases, groups, notes, own times and the bound period-table block. The bound period table supplies the effective timing before JSON, native text or ICS serialization. Clipboard rejection produces a failure message.

Recurring ICS retains compact RRULEs when no transfers apply. When transfers apply, it projects concrete events through `src/domain/courseOccurrence.ts` coursesForDate. Dated ICS uses the same projector. Cross-week transfers read the source week's parity and range, suppress the source date, and include exceptional destinations outside the ordinary semester boundary. Fixed-date courses remain on their own dates. Sleepy extension fields preserve fixed dates, own times, semester start and maximum week on ICS reimport; external ICS retains its existing grouping behavior. The parser does not mistake braces inside calendar text for a JSON wrapper.

The date projection depends on main's domain commit `b6c4902` (equivalent local cherry-pick `5059b1d`). Main already has it and should skip the duplicate dependency.

## Import policy and persistence

New-table imports and explicit-target appends are separate actions. New imports create an independent period table from the confirmed rows, including old files with no P block, or bind the explicitly selected existing period table. They preserve the current default; only the first timetable becomes default. The confirmed date, original source JSON, maximum week and fixed dates are persisted atomically with courses and period binding, with one undo snapshot. A write failure rolls back both database changes and undo history.

Append compares actual overlapping weeks and clock times. It leaves a bound shared period table unchanged and rejects missing occupied nodes before writing. Pre-import backups freeze the effective schedule, detach the period binding, clear its old binding snapshot, and disable reminders. Incoming groups receive fresh IDs while their internal partitions remain distinct. Empty accepted imports do not create a backup. The main task still owns general backup settings and repository behavior outside this importer.
