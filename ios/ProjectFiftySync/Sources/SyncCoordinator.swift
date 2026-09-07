import Foundation
import os

enum Logger {
    static let sync = os.Logger(subsystem: "com.functionalcorefitness.project50sync", category: "sync")
}

/// What one sync pass actually did. A bool was too coarse: "false" covered
/// both "the upload failed" and "there was simply nothing to send", which are
/// opposite situations and were reported to the user with the same sentence.
struct SyncOutcome {
    var uploaded: [String] = []
    var empty: [String] = []
    var failedDay: String?

    var isSuccess: Bool { failedDay == nil }

    var summary: String {
        if let failedDay {
            return "Upload failed on \(failedDay). Check the token is saved, then try again."
        }
        if uploaded.isEmpty && empty.isEmpty {
            return "Already up to date."
        }
        if uploaded.isEmpty {
            let n = empty.count
            return "Nothing to send — Apple Health had no data for \(n) day\(n == 1 ? "" : "s")."
        }
        let n = uploaded.count
        var text = "Synced \(n) day\(n == 1 ? "" : "s")"
        if let first = uploaded.first, let last = uploaded.last {
            text += n == 1 ? " (\(first))" : " (\(first) to \(last))"
        }
        text += "."
        if !empty.isEmpty {
            text += " \(empty.count) had no data."
        }
        return text
    }
}

/// The one piece of shared logic between the background task path and the
/// foreground-fallback path (see `BackgroundSyncManager.swift`) — both call
/// this and nothing else, so "how a sync actually happens" has one
/// implementation.
enum SyncCoordinator {
    private static let lastSuccessKey = "lastSuccessfulSyncAt"
    private static let lastSyncedDayKey = "lastSyncedDay"

    /// How far back a catch-up will reach. Two weeks is enough to cover a
    /// holiday or a stretch of missed background runs without ever making the
    /// first sync on a new install scan months of history.
    static let backfillWindowDays = 14

    private static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.calendar = Calendar(identifier: .gregorian)
        return formatter
    }()

    static func dayString(_ day: Date) -> String { dateFormatter.string(from: day) }

    static var lastSuccessfulSyncAt: Date? {
        UserDefaults.standard.object(forKey: lastSuccessKey) as? Date
    }

    /// The most recent calendar day whose data actually reached the server.
    /// This, not a wall-clock timestamp, is what decides whether there is work
    /// to do.
    static var lastSyncedDay: Date? {
        guard let stored = UserDefaults.standard.string(forKey: lastSyncedDayKey) else { return nil }
        return dateFormatter.date(from: stored)
    }

    /// Only ever moves forward. A forced re-sync starts from the oldest day in
    /// the window, and must not drag the cursor backwards as it walks.
    private static func advanceLastSyncedDay(to day: Date) {
        if let current = lastSyncedDay, current >= day { return }
        UserDefaults.standard.set(dateFormatter.string(from: day), forKey: lastSyncedDayKey)
    }

    private static var yesterday: Date? {
        let calendar = Calendar.current
        return calendar.date(byAdding: .day, value: -1, to: calendar.startOfDay(for: Date()))
    }

    /// True when at least one day up to and including yesterday has never been
    /// uploaded.
    ///
    /// This replaced a 20-hour staleness clock, which asked the wrong question.
    /// A sync at 5pm marked the app "fresh" until 1pm the next day, so opening
    /// it over breakfast did nothing at all while yesterday sat unsent — and
    /// since the sync only ever covered a single day, whatever the background
    /// task missed was never picked up again.
    static var hasUnsyncedDays: Bool {
        guard let yesterday = yesterday else { return false }
        guard let last = lastSyncedDay else { return true }
        return last < yesterday
    }

    /// Uploads every day from the one after `lastSyncedDay` through yesterday,
    /// oldest first, capped at `backfillWindowDays`.
    ///
    /// Pass `force` to ignore the cursor and re-send the whole window. That
    /// matters after granting HealthKit permissions late: days that read as
    /// empty beforehand become readable afterwards, and the ordinary
    /// incremental path has already stepped past them.
    @discardableResult
    static func syncPendingDays(health: HealthKitManager,
                                force: Bool = false) async -> SyncOutcome {
        var outcome = SyncOutcome()
        let calendar = Calendar.current
        guard let yesterday = yesterday,
              let earliest = calendar.date(byAdding: .day,
                                           value: -(max(1, backfillWindowDays) - 1),
                                           to: yesterday) else {
            return outcome
        }

        var day: Date
        if force {
            day = earliest
        } else if let last = lastSyncedDay,
                  let next = calendar.date(byAdding: .day, value: 1, to: last) {
            day = max(next, earliest)
        } else {
            day = earliest
        }

        while day <= yesterday {
            let dateString = dateFormatter.string(from: day)
            let metrics = await health.fetchDailyMetrics(for: day)

            if metrics.isEmpty {
                // Nothing to send, but the day is still "done" — otherwise a
                // single dataless day would block the cursor forever.
                Logger.sync.log("No HealthKit data for \(dateString) — nothing to upload.")
                outcome.empty.append(dateString)
                advanceLastSyncedDay(to: day)
            } else {
                do {
                    try await APIClient.sync(date: dateString, metrics: metrics)
                    Logger.sync.log("Synced \(metrics.count) metrics for \(dateString).")
                    outcome.uploaded.append(dateString)
                    advanceLastSyncedDay(to: day)
                    UserDefaults.standard.set(Date(), forKey: lastSuccessKey)
                } catch {
                    // Stop on the first upload error and leave the cursor where
                    // it is, so the next run retries this day rather than
                    // silently stepping over it.
                    Logger.sync.log("Sync failed for \(dateString): \(String(describing: error))")
                    outcome.failedDay = dateString
                    return outcome
                }
            }

            guard let next = calendar.date(byAdding: .day, value: 1, to: day) else { break }
            day = next
        }

        return outcome
    }
}
