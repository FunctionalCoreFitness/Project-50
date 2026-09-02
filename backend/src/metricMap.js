// Single source of truth mapping a HealthKit-derived metric key (sent by the
// iOS app) to where it lives in the dashboard's data.json:
// { category id in data.json, exact metric "name" string, unit — for validation only }
//
// Kept intentionally narrow: only metrics with a clean, unambiguous HealthKit
// source. Manual/subjective entries (labs, sauna, BJJ rounds, etc.) are not
// part of this sync and stay on the update.html console workflow.
//
// IMPORTANT: this must stay in sync with the copy in index.html's
// <script> block (HEALTHKIT_METRIC_MAP) — the web app has no build step to
// import this file directly.
const METRIC_MAP = {
  vo2Max:                          { categoryId: "engine", name: "VO2 Max" },
  restingHeartRate:                { categoryId: "engine", name: "Resting HR" },
  hrvSDNN:                         { categoryId: "engine", name: "HRV (SDNN)" },
  walkingHeartRateAverage:         { categoryId: "engine", name: "Walking HR" },
  respiratoryRate:                 { categoryId: "engine", name: "Respiratory Rate" },
  oxygenSaturation:                { categoryId: "engine", name: "Blood Oxygen" },
  stepCount:                       { categoryId: "engine", name: "Steps" },
  appleExerciseTime:               { categoryId: "engine", name: "Exercise" },
  activeEnergyBurned:              { categoryId: "engine", name: "Active Calories" },

  walkingAsymmetryPercentage:      { categoryId: "gait", name: "Walking Asymmetry" },
  walkingDoubleSupportPercentage:  { categoryId: "gait", name: "Double Support Time" },
  walkingSpeed:                    { categoryId: "gait", name: "Walking Speed" },
  walkingStepLength:               { categoryId: "gait", name: "Step Length" },
  walkingSteadiness:               { categoryId: "gait", name: "Walking Steadiness" },
  sixMinuteWalkTestDistance:       { categoryId: "gait", name: "Six-Minute Walk" },
  runningGroundContactTime:        { categoryId: "gait", name: "Ground Contact Time" },
  runningStrideLength:             { categoryId: "gait", name: "Running Stride Length" },
  runningVerticalOscillation:      { categoryId: "gait", name: "Vertical Oscillation" },
  stairSpeedDown:                  { categoryId: "gait", name: "Stair Speed Down" },

  bodyMass:                        { categoryId: "body", name: "Weight" },

  sleepDurationHours:              { categoryId: "recovery", name: "Sleep Duration" },
  deepSleepPercentage:             { categoryId: "recovery", name: "Deep Sleep" },
};

const VALID_KEYS = new Set(Object.keys(METRIC_MAP));

module.exports = { METRIC_MAP, VALID_KEYS };
