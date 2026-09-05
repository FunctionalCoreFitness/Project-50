const test = require("node:test");
const assert = require("node:assert/strict");
const { validateSyncPayload, isPlausibleDate } = require("../src/validate");

// Dates are derived from the clock, never hardcoded. validateSyncPayload
// rejects anything more than a year old, so a literal date silently expires —
// and because the date is checked *before* the metrics, the rejection tests
// below would keep passing for the wrong reason (the stale date, not the bad
// metric) rather than failing loudly. Each rejection test also asserts on the
// specific error message, so it can't pass on the wrong rejection either.
function daysFromNow(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
const YESTERDAY = daysFromNow(-1);

test("isPlausibleDate accepts a well-formed recent date", () => {
  assert.equal(isPlausibleDate(YESTERDAY), true);
  assert.equal(isPlausibleDate(daysFromNow(0)), true);
});

test("isPlausibleDate rejects garbage formats", () => {
  assert.equal(isPlausibleDate("08/31/2026"), false);
  assert.equal(isPlausibleDate("not-a-date"), false);
  assert.equal(isPlausibleDate(""), false);
});

test("isPlausibleDate rejects dates more than a year old", () => {
  assert.equal(isPlausibleDate(daysFromNow(-400)), false);
});

test("isPlausibleDate rejects dates far in the future", () => {
  assert.equal(isPlausibleDate(daysFromNow(30)), false);
});

test("validateSyncPayload accepts a well-formed payload with known metrics", () => {
  const result = validateSyncPayload({
    date: YESTERDAY,
    metrics: { vo2Max: 37.5, stepCount: 13897 },
  });
  assert.equal(result.ok, true);
  assert.equal(result.date, YESTERDAY);
  assert.deepEqual(result.metrics, { vo2Max: 37.5, stepCount: 13897 });
  assert.deepEqual(result.unknownKeys, []);
});

test("validateSyncPayload rejects a missing date", () => {
  const result = validateSyncPayload({ metrics: { vo2Max: 37.5 } });
  assert.equal(result.ok, false);
  assert.match(result.error, /date must be/);
});

test("validateSyncPayload rejects metrics that aren't an object", () => {
  const result = validateSyncPayload({ date: YESTERDAY, metrics: "not-an-object" });
  assert.equal(result.ok, false);
  assert.match(result.error, /metrics must be an object/);
});

test("validateSyncPayload rejects a non-numeric metric value", () => {
  // This is exactly the corruption class the update.html parser bug produced
  // (a string like "vo2-37.5" landing in a numeric field) — the backend must
  // never accept it either, regardless of what the client sends.
  const result = validateSyncPayload({
    date: YESTERDAY,
    metrics: { vo2Max: "vo2-37.5" },
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /finite number/);
});

test("validateSyncPayload rejects NaN and Infinity", () => {
  for (const bad of [NaN, Infinity, -Infinity]) {
    const result = validateSyncPayload({ date: YESTERDAY, metrics: { vo2Max: bad } });
    assert.equal(result.ok, false, `expected ${bad} to be rejected`);
    assert.match(result.error, /finite number/);
  }
});

test("validateSyncPayload drops unknown keys but keeps the known ones, reporting which were dropped", () => {
  const result = validateSyncPayload({
    date: YESTERDAY,
    metrics: { vo2Max: 37.5, someFutureHealthKitField: 12 },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.metrics, { vo2Max: 37.5 });
  assert.deepEqual(result.unknownKeys, ["someFutureHealthKitField"]);
});

test("validateSyncPayload rejects a payload with only unknown keys", () => {
  const result = validateSyncPayload({
    date: YESTERDAY,
    metrics: { totallyMadeUpField: 1 },
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /no recognized keys/);
});
