# Project 50 Sync (iOS companion app)

Reads yesterday's HealthKit data once a day and uploads it to the backend in
`../backend`. No user accounts, no UI beyond a single status screen — see
scope notes in the repo root for why.

## Why this is source files, not a `.xcodeproj`

An iOS app can only be built and signed with Xcode on macOS — that's true no
matter who writes the code, this repo has no macOS environment available to
build or verify one, and a hand-authored `.xcodeproj`/`.pbxproj` risks
subtle corruption that's hard to diagnose without Xcode to open it. So
`Sources/` below is complete, real Swift — every file compiles against
public HealthKit/BackgroundTasks/SwiftUI APIs — but you'll create the Xcode
project shell yourself and drop these files in. That's ~10 minutes, and it's
the same 10 minutes you'd spend regardless of how the source was produced.

## Setup

1. **New Xcode project** → iOS → App. Interface: SwiftUI. Name it
   `ProjectFiftySync` (or whatever you like — nothing here hardcodes the
   product name except the bundle identifier convention below, which you can
   also change freely as long as it's consistent everywhere it appears).
2. **Delete** the template's generated `ContentView.swift` and
   `ProjectFiftySyncApp.swift` (or whatever Xcode named your `@main` file),
   then **add all files in `Sources/`** to the target.
3. **Signing & Capabilities tab:**
   - Add capability **HealthKit**. Check "Background Delivery" if offered.
   - Add capability **Background Modes**. Check "Background fetch" and
     "Background processing."
   - These two capabilities write to an entitlements file automatically —
     `ProjectFiftySync.entitlements` in this folder shows what that should
     contain if you want to compare, but let Xcode manage its own file.
4. **Info tab:** add the three keys from `Info-additions.plist` (Xcode's Info
   tab UI, or switch to "Open As > Source Code" and paste the `<key>` pairs
   into the generated Info.plist's `<dict>`).
5. **`APIClient.swift`:** replace `REPLACE_WITH_YOUR_CLOUD_RUN_URL` with your
   deployed backend URL (see `../backend/README.md`).
6. Build and run on a **physical iPhone** — HealthKit data (especially gait
   metrics, which require an iPhone's motion sensors) is far more meaningful
   on-device than in the Simulator, and BGTaskScheduler's real scheduling
   behavior can't be observed in the Simulator at all.
7. On first launch, tap **Grant HealthKit Access**, approve the system
   prompt, then paste the ingest token (`gcloud secrets versions access
   latest --secret=healthkit-ingest-key`) into the token field and save it —
   this is a one-time manual step, matching "no auth flow" from the brief.

## Testing the background task without waiting for 6am

Pause at a breakpoint or add this in the debugger console after the app has
been backgrounded once (so the task is already scheduled):

```
e -l objc -- (void)[[BGTaskScheduler sharedScheduler] _simulateLaunchForTaskWithIdentifier:@"com.functionalcorefitness.project50sync.refresh"]
```

This is Apple's own documented technique for exercising a `BGAppRefreshTask`
handler on demand in a debug build — it does not change the guarantee (or
lack of one) in production, only lets you verify the handler logic runs.

## What's deliberately not here

- No retry/backoff queue for failed uploads — the next scheduled attempt (or
  the next app foreground) naturally retries by re-fetching "yesterday,"
  which for a daily aggregate is equivalent to a retry.
- No local cache of historical days — this app only ever looks at
  "yesterday" relative to when it runs, per the "no backfill" scope note.
- No watch app / complication — see the separate conversation about Apple
  Watch; that would be a distinct project (a real watchOS target or a
  Shortcuts-based readout), not an extension of this one.
