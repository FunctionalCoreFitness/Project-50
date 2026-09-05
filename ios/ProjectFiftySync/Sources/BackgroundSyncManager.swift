import BackgroundTasks
import Foundation
import os

/// Background sync strategy, and what it actually guarantees:
///
/// `BGAppRefreshTask` is the standard iOS mechanism for "wake my app briefly,
/// periodically, to fetch small amounts of data" — the right primitive here.
/// But it comes with NO time guarantee whatsoever:
///   - `earliestBeginDate` sets a floor, not a target. iOS decides the actual
///     run time based on the user's app-usage patterns, battery level, Low
///     Power Mode, and system load. It is common for a refresh task to run
///     hours after its earliest begin date, or not at all that day.
///   - The OS can and does skip scheduled refreshes entirely for apps it
///     judges low-priority for the user, especially in the first weeks after
///     install before it has a usage pattern to go on.
///   - Total execution budget per wake is short (Apple doesn't publish an
///     exact number; historically well under a minute) — this is why the
///     sync itself is a handful of aggregate HealthKit queries plus one
///     small HTTP POST, not a bulk historical export.
///
/// Because of that, this is deliberately a best-effort *plus* a real
/// fallback, not a "6am cron job":
///   1. Request a `BGAppRefreshTask` with `earliestBeginDate` = next 6am
///      device-local time. This is the "try to do it quietly overnight" path.
///   2. On every foreground launch, check `SyncCoordinator.isStale` (>20h
///      since last success) and sync immediately if so. This is the actual
///      reliability backstop — it guarantees a sync happens within ~20h of
///      the last one as long as the user opens the app at least that often,
///      independent of whatever the OS did with the background task.
enum BackgroundSyncManager {
    static let taskIdentifier = "com.functionalcorefitness.project50sync.refresh"

    /// Call once from the App's `init` or `didFinishLaunching`, before the
    /// app finishes launching — BGTaskScheduler requires registration at
    /// startup, not on demand.
    static func registerTask() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: taskIdentifier, using: nil) { task in
            guard let refreshTask = task as? BGAppRefreshTask else {
                task.setTaskCompleted(success: false)
                return
            }
            handle(refreshTask)
        }
    }

    /// Schedules the next attempt for ~6am device-local time (tomorrow, if
    /// it's already past 6am today). Call this after registering and again
    /// at the end of every task execution — BGAppRefreshTaskRequest is
    /// one-shot, it does not repeat itself.
    static func scheduleNextRefresh() {
        let request = BGAppRefreshTaskRequest(identifier: taskIdentifier)
        request.earliestBeginDate = nextSixAM()
        do {
            try BGTaskScheduler.shared.submit(request)
        } catch {
            Logger.sync.log("Failed to schedule background refresh: \(String(describing: error))")
        }
    }

    private static func nextSixAM() -> Date {
        let calendar = Calendar.current
        let now = Date()
        var components = calendar.dateComponents([.year, .month, .day], from: now)
        components.hour = 6
        components.minute = 0
        let todaySixAM = calendar.date(from: components) ?? now
        if todaySixAM > now {
            return todaySixAM
        }
        return calendar.date(byAdding: .day, value: 1, to: todaySixAM) ?? now.addingTimeInterval(86_400)
    }

    private static func handle(_ task: BGAppRefreshTask) {
        // Always schedule the next attempt before doing any work — if the
        // task is expired/killed mid-run, we still want tomorrow's attempt
        // on the calendar rather than silently going dark.
        scheduleNextRefresh()

        let health = HealthKitManager()
        let work = Task {
            let success = await SyncCoordinator.syncYesterday(health: health)
            task.setTaskCompleted(success: success)
        }

        task.expirationHandler = {
            work.cancel()
            task.setTaskCompleted(success: false)
        }
    }
}
