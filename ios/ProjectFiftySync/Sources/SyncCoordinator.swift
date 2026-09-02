import Foundation
import os

enum Logger {
    static let sync = os.Logger(subsystem: "com.functionalcorefitness.project50sync", category: "sync")
}

/// The one piece of shared logic between the background task path and the
/// foreground-fallback path (see `BackgroundSyncManager.swift`) — both call
/// this and nothing else, so "how a sync actually happens" has one
/// implementation.
enum SyncCoordinator {
    private static let lastSuccessKey = "lastSuccessfulSyncAt"
    private static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.calendar = Calendar(identifier: .gregorian)
        return formatter
    }()

    static var lastSuccessfulSyncAt: Date? {
        UserDefaults.standard.object(forKey: lastSuccessKey) as? Date
    }

    static var isStale: Bool {
        guard let last = lastSuccessfulSyncAt else { return true }
        return Date().timeIntervalSince(last) > 20 * 3600
    }

    /// Syncs *yesterday's* data (device-local calendar day). Returns true on
    /// success. Never throws — callers (a BGTask handler, a SwiftUI view)
    /// just need a bool to report completion/status; the underlying error is
    /// still logged for on-device debugging via os_log.
    @discardableResult
    static func syncYesterday(health: HealthKitManager) async -> Bool {
        guard let yesterday = Calendar.current.date(byAdding: .day, value: -1, to: Date()) else {
            return false
        }
        let dateString = dateFormatter.string(from: yesterday)
        let metrics = await health.fetchDailyMetrics(for: yesterday)

        guard !metrics.isEmpty else {
            Logger.sync.log("No HealthKit data found for \(dateString) — skipping upload.")
            return false
        }

        do {
            try await APIClient.sync(date: dateString, metrics: metrics)
            UserDefaults.standard.set(Date(), forKey: lastSuccessKey)
            Logger.sync.log("Synced \(metrics.count) metrics for \(dateString).")
            return true
        } catch {
            Logger.sync.log("Sync failed for \(dateString): \(String(describing: error))")
            return false
        }
    }
}
