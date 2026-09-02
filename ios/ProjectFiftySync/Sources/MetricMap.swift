import HealthKit

/// Mirrors `backend/src/metricMap.js` — the JSON key here must exactly match
/// a key in that file's METRIC_MAP, or the backend will silently drop it
/// into `ignoredKeys` instead of storing it.
///
/// Only metrics with a clean, single HealthKit source are covered. Labs,
/// sauna/cold-plunge protocols, race times, etc. stay on the manual
/// update.html console workflow — they're not HealthKit data.
enum Aggregation {
    case sum
    case average
    case mostRecent
}

struct QuantityMetricSpec {
    let key: String
    let identifier: HKQuantityTypeIdentifier
    let unit: HKUnit
    let aggregation: Aggregation
    /// Applied after the raw HealthKit value is read in `unit`. Used for the
    /// handful of metrics where the dashboard's unit differs from the
    /// HealthKit-native one (e.g. stair speed: m/s on device, ft/s on the
    /// dashboard) or where HK stores a 0–1 fraction the dashboard shows as a
    /// percentage.
    let transform: (Double) -> Double

    init(
        key: String,
        identifier: HKQuantityTypeIdentifier,
        unit: HKUnit,
        aggregation: Aggregation,
        transform: @escaping (Double) -> Double = { $0 }
    ) {
        self.key = key
        self.identifier = identifier
        self.unit = unit
        self.aggregation = aggregation
        self.transform = transform
    }
}

enum HealthMetrics {
    static let metersPerSecondToFeetPerSecond = 3.28084

    static let quantitySpecs: [QuantityMetricSpec] = [
        // Cardiovascular Engine
        QuantityMetricSpec(key: "vo2Max", identifier: .vo2Max,
                            unit: HKUnit(from: "mL/kg*min"), aggregation: .mostRecent),
        QuantityMetricSpec(key: "restingHeartRate", identifier: .restingHeartRate,
                            unit: .count().unitDivided(by: .minute()), aggregation: .average),
        QuantityMetricSpec(key: "hrvSDNN", identifier: .heartRateVariabilitySDNN,
                            unit: .secondUnit(with: .milli), aggregation: .average),
        QuantityMetricSpec(key: "walkingHeartRateAverage", identifier: .walkingHeartRateAverage,
                            unit: .count().unitDivided(by: .minute()), aggregation: .average),
        QuantityMetricSpec(key: "respiratoryRate", identifier: .respiratoryRate,
                            unit: .count().unitDivided(by: .minute()), aggregation: .average),
        QuantityMetricSpec(key: "oxygenSaturation", identifier: .oxygenSaturation,
                            unit: .percent(), aggregation: .average, transform: { $0 * 100 }),
        QuantityMetricSpec(key: "stepCount", identifier: .stepCount,
                            unit: .count(), aggregation: .sum),
        // NOTE: the dashboard labels this "min/wk" but — matching how it has
        // always been entered manually via update.html — this sends the
        // single day's Apple Exercise Time in minutes, not a weekly total.
        // Not something this feature redefines; flagging it as a pre-existing
        // dashboard label quirk.
        QuantityMetricSpec(key: "appleExerciseTime", identifier: .appleExerciseTime,
                            unit: .minute(), aggregation: .sum),
        QuantityMetricSpec(key: "activeEnergyBurned", identifier: .activeEnergyBurned,
                            unit: .kilocalorie(), aggregation: .sum),

        // Gait & Mobility (iPhone-measured walking/running metrics)
        QuantityMetricSpec(key: "walkingAsymmetryPercentage", identifier: .walkingAsymmetryPercentage,
                            unit: .percent(), aggregation: .average, transform: { $0 * 100 }),
        QuantityMetricSpec(key: "walkingDoubleSupportPercentage", identifier: .walkingDoubleSupportPercentage,
                            unit: .percent(), aggregation: .average, transform: { $0 * 100 }),
        QuantityMetricSpec(key: "walkingSpeed", identifier: .walkingSpeed,
                            unit: HKUnit(from: "mi/hr"), aggregation: .average),
        QuantityMetricSpec(key: "walkingStepLength", identifier: .walkingStepLength,
                            unit: .inch(), aggregation: .average),
        QuantityMetricSpec(key: "walkingSteadiness", identifier: .appleWalkingSteadiness,
                            unit: .percent(), aggregation: .average, transform: { $0 * 100 }),
        QuantityMetricSpec(key: "sixMinuteWalkTestDistance", identifier: .sixMinuteWalkTestDistance,
                            unit: .meter(), aggregation: .mostRecent),
        QuantityMetricSpec(key: "runningGroundContactTime", identifier: .runningGroundContactTime,
                            unit: .secondUnit(with: .milli), aggregation: .average),
        QuantityMetricSpec(key: "runningStrideLength", identifier: .runningStrideLength,
                            unit: .meter(), aggregation: .average),
        QuantityMetricSpec(key: "runningVerticalOscillation", identifier: .runningVerticalOscillation,
                            unit: HKUnit(from: "cm"), aggregation: .average),
        QuantityMetricSpec(key: "stairSpeedDown", identifier: .stairDescentSpeed,
                            unit: .meter().unitDivided(by: .second()), aggregation: .average,
                            transform: { $0 * metersPerSecondToFeetPerSecond }),

        // Body Composition
        QuantityMetricSpec(key: "bodyMass", identifier: .bodyMass,
                            unit: .pound(), aggregation: .mostRecent),
    ]

    /// Every HKObjectType this app ever reads — used for the single bulk
    /// authorization request. Sleep uses the category type below in addition
    /// to this list.
    static var allReadTypes: Set<HKObjectType> {
        var types = Set<HKObjectType>(quantitySpecs.compactMap {
            HKObjectType.quantityType(forIdentifier: $0.identifier)
        })
        if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            types.insert(sleep)
        }
        return types
    }
}
