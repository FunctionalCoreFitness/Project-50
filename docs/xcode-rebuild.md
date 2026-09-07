# Xcode rebuild checklist

For updating the app you already have on your phone. This is **not** the
first-time setup (that's `ios/README.md`) — you are only replacing Swift
files. Nothing about signing, capabilities, entitlements or Info.plist changes.

Expect 10–15 minutes.

---

## What changed and why you need this

| File | What was added |
|---|---|
| `Sources/MetricMap.swift` | `.mindfulSession` read type + 12 dietary quantity types |
| `Sources/HealthKitManager.swift` | `fetchMindfulMinutes()` and its result key |
| `Sources/SyncCoordinator.swift` | Multi-day catch-up, replacing the single-day sync |
| `Sources/ContentView.swift` | "Sync Now" + "Re-sync Last 14 Days", and a real result message |
| `Sources/ProjectFiftySyncApp.swift` | Foreground catch-up now triggers on unsynced days |
| `Sources/BackgroundSyncManager.swift` | Calls the catch-up; doc comment corrected |

Six files, all replacements. Copy each one whole.

Without the rebuild the dashboard's Nutrition and Auto-Recovery sections stay
empty — they're wired up and waiting, but the phone isn't sending the data yet.

### Why the sync files changed

The old app synced exactly one day — yesterday — and only bothered if more
than 20 hours had passed since the last successful run. Both halves lost data:

- A sync at 5pm marked the app "fresh" until 1pm the next day, so opening it
  over breakfast did nothing while yesterday sat unsent.
- Because a run only ever covered one day, anything the background task
  skipped was never picked up again. It was gone.

Now the app asks the right question — *is there a day I have not uploaded
yet?* — and walks every pending day up to yesterday, oldest first, capped at
14 days. A failed upload stops the run and leaves the marker where it is, so
the next attempt retries that day instead of stepping over it.

**Use "Re-sync Last 14 Days" once after this rebuild.** Days already marked
done are skipped by the normal button, and the days from before you granted
the nutrition permissions are marked done — the forced re-sync is what pulls
them in now that Health will actually hand them over.

---

## 1. Get the new code onto the Mac

Terminal, in wherever you cloned Project-50:

```
git pull origin main
```

If you get merge complaints, you have local edits. `git stash` first, then pull.

---

## 2. Replace the two files in Xcode

You copied `Sources/` into the Xcode project when you first set this up, so the
project has its **own copies**. Pulling the repo does not update them.

For each of `MetricMap.swift` and `HealthKitManager.swift`:

1. Open the file in Xcode (⌘⇧O, type the name)
2. Open the same file from the freshly pulled repo in any text editor
3. Select all in Xcode (⌘A), paste the repo version over it (⌘V)
4. Save (⌘S)

Copy-paste rather than dragging files in — dragging risks adding a second copy
to the target, which produces "invalid redeclaration" errors.

**Sanity check:** `MetricMap.swift` should now contain `dietaryFiber`, and
`HealthKitManager.swift` should contain `fetchMindfulMinutes`. Search (⌘F) for
both before continuing.

---

## 3. Build to the phone

1. Plug the iPhone in
2. Pick it as the run destination (top bar, next to the scheme name)
3. ⌘R

If the build fails, read the **first** error — the rest are usually noise from
it. Last time the failure was a missing `import os`; the fix is normally one
line, so send me the error text rather than guessing.

---

## 4. Grant the new HealthKit permissions

This is the step that's easy to miss, and everything downstream depends on it.

1. In the app, tap **Grant HealthKit Access** again
2. iOS shows a permission sheet listing only the **new** types
3. **Turn them all on.** Fastest is "Turn On All" if offered

The new types: Mindful Minutes, Fiber, Protein, Sugar, Saturated Fat, Water,
Vitamin D, Folate, B12, Magnesium, Zinc, Potassium, Sodium.

> **HealthKit read permissions are opaque by design.** If you skip one, the app
> cannot tell the difference between "denied" and "no data" — it just gets
> nothing forever, silently. If a metric never fills in, check here first:
> Settings → Health → Data Access & Devices → Project 50 Sync.

---

## 5. Check the nutrition app is actually writing

The dashboard can only show what Apple Health holds, and Apple Health only holds
what your nutrition app writes to it.

Health app → Browse → Nutrition → tap **Fiber**. If today's log is there, the
chain works. If it's empty, your nutrition app has Health **write** permission
switched off for that field — some apps default to sharing calories and macros
only, and leave fiber and micronutrients off.

Check the same for Protein, Sugar and Water.

---

## 6. Force a sync and confirm

Don't wait for the 6am background task.

1. Open the app and pull to refresh / tap sync (whatever triggers the foreground
   path — the >20h staleness fallback also fires on launch)
2. Open the dashboard
3. **Nutrition** → the four charts should show at least one bar
4. **Auto-Recovery** → if you logged a Mindfulness session today of 10 min or
   more, Wim Hof and Red Light tick themselves

Nothing appearing? In order: was the sync actually triggered, are the
permissions on (step 4), is the nutrition app writing (step 5).

---

## If it goes wrong

- **Build errors** — send the first one. Two files changed; the blast radius is small.
- **Charts stay empty but the engine metrics update** — permissions or the
  nutrition app, not the sync. Steps 4 and 5.
- **Nothing updates at all** — the sync itself. Check the engine metrics'
  dates on the dashboard; if they're stale too, it's the background task, not
  this change.
- **Phone won't verify the developer app** — Date & Time on auto, Wi-Fi off/on,
  VPN off, restart. That fixed it last time.
