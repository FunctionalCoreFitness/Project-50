import HealthKit
import Foundation

enum HealthKitError: Error {
    case notAvailable
    case authorizationFailed(Error)
}

/// Reads yesterday's aggregated HealthKit data into the flat JSON shape the
/// backend expects (see `MetricMap.swift` / `backend/src/metricMap.js`).
final class HealthKitManager {
    private let store = HKHealthStore()

    var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    func requestAuthorization() async throws {
        guard isAvailable else { throw HealthKitError.notAvailable }
        do {
            try await store.requestAuthorization(toShare: [], read: HealthMetrics.allReadTypes)
        } catch {
            throw HealthKitError.authorizationFailed(error)
        }
    }

    /// Returns the flat metrics dictionary for the given calendar day, using
    /// the device's current calendar/timezone for day boundaries. Metrics
    /// with no samples in the window are simply absent from the result
    /// (never sent as 0 or null) — matching the backend's "absence means no
    /// data" contract.
    func fetchDailyMetrics(for day: Date, calendar: Calendar = .current) async -> [String: Double] {
        let dayStart = calendar.startOfDay(for: day)
        guard let dayEnd = calendar.date(byAdding: .day, value: 1, to: dayStart) else { return [:] }
        let dayPredicate = HKQuery.predicateForSamples(withStart: dayStart, end: dayEnd, options: .strictStartDate)

        var result: [String: Double] = [:]

        await withTaskGroup(of: (String, Double?).self) { group in
            for spec in HealthMetrics.quantitySpecs {
                group.addTask { [weak self] in
                    guard let self else { return (spec.key, nil) }
                    let value = await self.fetchQuantity(spec: spec, predicate: dayPredicate)
                    return (spec.key, value)
                }
            }
            for await (key, value) in group {
                if let value { result[key] = value }
            }
        }

        // Sleep: attribute the overnight session that *ended* the morning of
        // `day` to `day`'s sync, since "last night's sleep" is what a
        // 6am-ish sync for "yesterday" actually means to a human reading the
        // dashboard. Window: 6pm the evening before `day` through noon on
        // `day`, comfortably covering any normal bedtime/wake time.
        if let eveningBefore = calendar.date(byAdding: .hour, value: 18, to: dayStart),
           let noonOfDay = calendar.date(byAdding: .hour, value: 12, to: dayStart),
           let windowStart = calendar.date(byAdding: .day, value: -1, to: eveningBefore) {
            if let sleep = await fetchSleep(windowStart: windowStart, windowEnd: noonOfDay) {
                result["sleepDurationHours"] = sleep.durationHours
                result["deepSleepPercentage"] = sleep.deepPercentage
            }
        }

        return result
    }

    private func fetchQuantity(spec: QuantityMetricSpec, predicate: NSPredicate) async -> Double? {
        guard let type = HKObjectType.quantityType(forIdentifier: spec.identifier) else { return nil }

        switch spec.aggregation {
        case .sum, .average:
            let options: HKStatisticsOptions = spec.aggregation == .sum ? .cumulativeSum : .discreteAverage
            return await withCheckedContinuation { continuation in
                let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: options) { _, stats, _ in
                    let quantity = spec.aggregation == .sum ? stats?.sumQuantity() : stats?.averageQuantity()
                    guard let quantity else { continuation.resume(returning: nil); return }
                    continuation.resume(returning: spec.transform(quantity.doubleValue(for: spec.unit)))
                }
                self.store.execute(query)
            }
        case .mostRecent:
            return await withCheckedContinuation { continuation in
                let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
                let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: 1, sortDescriptors: [sort]) { _, samples, _ in
                    guard let sample = samples?.first as? HKQuantitySample else { continuation.resume(returning: nil); return }
                    continuation.resume(returning: spec.transform(sample.quantity.doubleValue(for: spec.unit)))
                }
                self.store.execute(query)
            }
        }
    }

    private func fetchSleep(windowStart: Date, windowEnd: Date) async -> (durationHours: Double, deepPercentage: Double)? {
        guard let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else { return nil }
        let predicate = HKQuery.predicateForSamples(withStart: windowStart, end: windowEnd, options: .strictStartDate)

        return await withCheckedContinuation { continuation in
            let query = HKSampleQuery(sampleType: sleepType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, _ in
                guard let samples = samples as? [HKCategorySample], !samples.isEmpty else {
                    continuation.resume(returning: nil)
                    return
                }

                let asleepValues: Set<Int> = [
                    HKCategoryValueSleepAnalysis.asleepCore.rawValue,
                    HKCategoryValueSleepAnalysis.asleepDeep.rawValue,
                    HKCategoryValueSleepAnalysis.asleepREM.rawValue,
                    HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue,
                ]
                let deepValue = HKCategoryValueSleepAnalysis.asleepDeep.rawValue

                var totalAsleepSeconds: TimeInterval = 0
                var deepSeconds: TimeInterval = 0
                for sample in samples where asleepValues.contains(sample.value) {
                    let duration = sample.endDate.timeIntervalSince(sample.startDate)
                    totalAsleepSeconds += duration
                    if sample.value == deepValue { deepSeconds += duration }
                }

                guard totalAsleepSeconds > 0 else {
                    continuation.resume(returning: nil)
                    return
                }
                let durationHours = totalAsleepSeconds / 3600
                let deepPercentage = (deepSeconds / totalAsleepSeconds) * 100
                continuation.resume(returning: (durationHours, deepPercentage))
            }
            self.store.execute(query)
        }
    }
}
