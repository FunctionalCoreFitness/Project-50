# HealthKit → GCloud → Dashboard sync

Three pieces, each independently testable, wired together by one shared
contract (`backend/src/metricMap.js`, mirrored in `index.html`'s
`HEALTHKIT_METRIC_MAP` and in the iOS app's `MetricMap.swift`):

```
iPhone (HealthKit) --BGAppRefreshTask/foreground fallback--> Cloud Run --Firestore--> dashboard read-path
        ios/                                          backend/                index.html
```

## Status of each piece

- **Backend** (`backend/`): fully implemented, 29 tests passing (`npm test`
  in that folder), verified end-to-end over real HTTP including the CORS
  preflight the browser read-path needs. Not deployed — that requires your
  own GCP project; exact commands are in `backend/README.md`.
- **Web read-path** (`index.html`): implemented and verified against a live
  local server serving fake HealthKit data — the overlay correctly replaces
  `data.json`'s stored values for VO2 Max, Resting HR, Steps, etc. with the
  synced values, and the rest of the dashboard (bars, hero stats, hover
  states) works on them unmodified. Currently pointed at placeholder
  constants (`HEALTHKIT_API_BASE`, `HEALTHKIT_READ_TOKEN`) — fill those in
  once the backend is deployed.
- **iOS app** (`ios/`): complete Swift source, reasoned through against the
  real HealthKit/BackgroundTasks/SwiftUI APIs, but **not compiled** — this
  sandbox has no macOS/Xcode, which is required to build any iOS app
  regardless of who writes the source. `ios/README.md` covers the ~10
  minutes of Xcode project setup and exactly what to verify once it builds.

## The background-sync guarantee, restated plainly

`BGAppRefreshTask` requested for ~6am gives **no execution-time guarantee** —
iOS treats `earliestBeginDate` as a floor, not a schedule, and decides actual
run time (or whether to run it at all that day) based on usage patterns,
battery, and system load. The real reliability mechanism is the foreground
check: every time the app is opened, if the last successful sync is >20h old,
it syncs immediately. Between the two, a sync will happen either quietly
overnight (best case) or the next time the phone is picked up and the app is
opened (worst case, bounded by however often that naturally happens).

## What was deliberately left out (per scope)

- No user accounts / multi-tenant auth — one long-lived bearer token for
  writes, a separate one for reads.
- No backfill beyond yesterday — a missed sync is simply not backfilled;
  the next sync only ever looks at "yesterday" relative to when it runs.
- No historical sync of the read-path — the dashboard overlays only the
  *current* value/date for each metric, not a merged history array. Trend
  arrows and sparklines keep using `data.json`'s manually-curated history
  until/unless that's explicitly extended later.
- No Apple Watch complication — see the separate conversation; that's a
  distinct project (a real watchOS target, or a much simpler Shortcuts-based
  readout), not an extension of this feature.
