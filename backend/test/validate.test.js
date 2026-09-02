const test = require("node:test");
const assert = require("node:assert/strict");
const { validateSyncPayload, isPlausibleDate } = require("../src/validate");

test("isPlausibleDate accepts a well-formed recent date", () => {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  assert.equal(isPlausibleDate(yesterday), true);
});

test("isPlausibleDate rejects garbage formats", () => {
  assert.equal(isPlausibleDate("08/31/2026"), false);
  assert.equal(isPlausibleDate("not-a-date"), false);
  assert.equal(isPlausibleDate(""), false);
});

test("isPlausibleDate rejects dates more than a year old", () => {
  assert.equal(isPlausibleDate("2000-01-01"), false);
});

test("isPlausibleDate rejects dates far in the future", () => {
  assert.equal(isPlausibleDate("2099-01-01"), false);
});

test("validateSyncPayload accepts a well-formed payload with known metrics", () => {
  const result = validateSyncPayload({
    date: "2026-08-31",
    metrics: { vo2Max: 37.5, stepCount: 13897 },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.metrics, { vo2Max: 37.5, stepCount: 13897 });
  assert.deepEqual(result.unknownKeys, []);
});

test("validateSyncPayload rejects a missing date", () => {
  const result = validateSyncPayload({ metrics: { vo2Max: 37.5 } });
  assert.equal(result.ok, false);
});

test("validateSyncPayload rejects metrics that aren't an object", () => {
  const result = validateSyncPayload({ date: "2026-08-31", metrics: "not-an-object" });
  assert.equal(result.ok, false);
});

test("validateSyncPayload rejects a non-numeric metric value", () => {
  // This is exactly the corruption class the update.html parser bug produced
  // (a string like "vo2-37.5" landing in a numeric field) — the backend must
  // never accept it either, regardless of what the client sends.
  const result = validateSyncPayload({
    date: "2026-08-31",
    metrics: { vo2Max: "vo2-37.5" },
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /finite number/);
});

test("validateSyncPayload rejects NaN and Infinity", () => {
  assert.equal(validateSyncPayload({ date: "2026-08-31", metrics: { vo2Max: NaN } }).ok, false);
  assert.equal(validateSyncPayload({ date: "2026-08-31", metrics: { vo2Max: Infinity } }).ok, false);
});

test("validateSyncPayload drops unknown keys but keeps the known ones, reporting which were dropped", () => {
  const result = validateSyncPayload({
    date: "2026-08-31",
    metrics: { vo2Max: 37.5, someFutureHealthKitField: 12 },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.metrics, { vo2Max: 37.5 });
  assert.deepEqual(result.unknownKeys, ["someFutureHealthKitField"]);
});

test("validateSyncPayload rejects a payload with only unknown keys", () => {
  const result = validateSyncPayload({
    date: "2026-08-31",
    metrics: { totallyMadeUpField: 1 },
  });
  assert.equal(result.ok, false);
});
