# Dashboard in the app

Turns the Project 50 Sync app on your phone into the Project 50 app: open it
and the dashboard is the first thing you see, exactly as it looks on the web,
with every feature it has there. The sync screen moves to a second tab.

Expect 10–15 minutes. Nothing about signing, capabilities, entitlements or
Info.plist changes.

---

## What changed and why

| File | What changed |
|---|---|
| `Sources/DashboardView.swift` | **New.** The dashboard, full-screen |
| `Sources/ProjectFiftySyncApp.swift` | Two tabs: Dashboard, then Sync. Reloads the dashboard after a sync |
| `Sources/ContentView.swift` | Title is now "Sync"; reloads the dashboard after Sync Now |

The Dashboard tab loads the live GitHub Pages dashboard, not a copy. That
keeps it identical to the web version, and it has to: the backend only hands
HealthKit data to pages served from `functionalcorefitness.github.io`. So:

- Training log updates, data.json edits and dashboard changes show up in the
  app on the next load. Nothing in Xcode needs rebuilding for them.
- Health cards show the synced values, same as in Safari.
- Pull down to refresh. Returning to the app after 10+ minutes reloads it, and
  so does a sync that uploads new days.
- Links to the dashboard's own pages (update, workout, PDFs) stay in the app.
  Everything else (YouTube, race sign-ups, trails) opens in Safari or its app.
- It needs a connection. Offline, it says so; pull down to retry.

---

## 1. Get the new code onto the Mac

```
git pull origin main
```

## 2. Add the new file

1. In Finder, open the pulled repo's `ios/ProjectFiftySync/Sources/`.
2. Drag **`DashboardView.swift`** into the Xcode project navigator, next to
   the other Swift files.
3. In the dialog: **Copy items if needed** checked, your app target checked.

This is the one file to drag. It is new, so there is no duplicate to collide
with.

## 3. Replace the two changed files

For `ProjectFiftySyncApp.swift` and `ContentView.swift`, the same copy-paste as
before:

1. Open the file in Xcode (⌘⇧O, type the name)
2. Open the same file from the pulled repo in any text editor
3. Select all in Xcode (⌘A), paste the repo version over it (⌘V)
4. Save (⌘S)

**Sanity check:** `ProjectFiftySyncApp.swift` should contain `TabView`, and
`ContentView.swift` should contain `dashboardShouldReload`.

## 4. Name and icon (optional, 2 minutes)

- **Name under the icon:** target → **General** → **Display Name** →
  `Project 50`.
- **Icon:** open `Assets` → `AppIcon` and drop in `icons/icon-512.png` from
  the repo. Xcode asks for 1024×1024; the 512 works for a personal build and
  only looks soft on the largest sizes.

## 5. Build to the phone

Same as always: phone plugged in, select it as the destination, ⌘R.

---

## Check it worked

1. The app opens on the **Dashboard** tab and shows the dashboard.
2. The health cards (VO2 Max, Resting HR, Steps, Nutrition) show the same
   values and dates as the dashboard in Safari.
3. Tap the **Sync** tab: the familiar sync screen, now titled "Sync".
4. **Sync Now**, then back to Dashboard: it has reloaded.

If the dashboard tab is blank or says it didn't load, open
https://functionalcorefitness.github.io/Project-50/ in Safari on the phone. If
Safari can't load it either, the problem is the connection or GitHub Pages,
not the app.

The 7-day expiry from `xcode-rebuild.md` still applies on a free account:
on the paid Developer Program, this build lasts a year.
