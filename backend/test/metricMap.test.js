const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { METRIC_MAP } = require("../src/metricMap");

// The metric map is duplicated in three places by necessity — the backend
// (this module), the dashboard (index.html has no build step, so it can't
// import), and the iOS app (a different language entirely). Until now the
// only thing keeping them aligned was a comment.
//
// Drift here fails silently and expensively: a key the app sends but the
// backend doesn't know lands in `ignoredKeys` and is dropped, and a key the
// backend stores but index.html doesn't map never reaches the dashboard. No
// error is raised anywhere in either case — the metric just quietly stops
// showing up. These tests turn that into a loud failure.

const REPO_ROOT = path.join(__dirname, "..", "..");
const INDEX_HTML = path.join(REPO_ROOT, "index.html");
const SWIFT_METRIC_MAP = path.join(REPO_ROOT, "ios/ProjectFiftySync/Sources/MetricMap.swift");
const SWIFT_HEALTHKIT = path.join(REPO_ROOT, "ios/ProjectFiftySync/Sources/HealthKitManager.swift");

// These files live outside backend/, so a partial checkout (or the Docker
// build context, which only copies src/) legitimately won't have them. Skip
// rather than fail in that case — but say so, so a skip is never mistaken
// for a pass.
const filesPresent = [INDEX_HTML, SWIFT_METRIC_MAP, SWIFT_HEALTHKIT].every(fs.existsSync);
const skip = filesPresent
  ? false
  : "dashboard/iOS sources not present in this checkout — drift check skipped";

function parseDashboardMap() {
  const html = fs.readFileSync(INDEX_HTML, "utf8");
  const block = html.match(/const HEALTHKIT_METRIC_MAP = \{([\s\S]*?)\n\};/);
  assert.ok(block, "could not find HEALTHKIT_METRIC_MAP in index.html — has it been renamed?");

  const entries = {};
  for (const m of block[1].matchAll(
    /^\s*([A-Za-z0-9_]+):\s*\{\s*categoryId:\s*"([^"]+)",\s*name:\s*"([^"]+)"\s*\}/gm
  )) {
    entries[m[1]] = { categoryId: m[2], name: m[3] };
  }
  // A regex that silently matches nothing would make every assertion below
  // vacuously true, so refuse to proceed on an empty parse.
  assert.ok(Object.keys(entries).length > 0, "parsed zero entries from index.html — the regex is stale");
  return entries;
}

function parseSwiftKeys() {
  const specs = fs.readFileSync(SWIFT_METRIC_MAP, "utf8");
  const quantityKeys = [...specs.matchAll(/key:\s*"([^"]+)"/g)].map((m) => m[1]);

  // Sleep isn't a quantity type, so its two keys are assigned directly in
  // HealthKitManager rather than declared in quantitySpecs.
  const manager = fs.readFileSync(SWIFT_HEALTHKIT, "utf8");
  const sleepKeys = [...manager.matchAll(/result\["([^"]+)"\]\s*=/g)].map((m) => m[1]);

  const all = [...new Set([...quantityKeys, ...sleepKeys])];
  assert.ok(all.length > 0, "parsed zero keys from the Swift sources — the regex is stale");
  return all;
}

function describeDrift(a, b, aName, bName) {
  const onlyA = a.filter((k) => !b.includes(k));
  const onlyB = b.filter((k) => !a.includes(k));
  const parts = [];
  if (onlyA.length) parts.push(`only in ${aName}: ${onlyA.join(", ")}`);
  if (onlyB.length) parts.push(`only in ${bName}: ${onlyB.join(", ")}`);
  return parts.join(" | ");
}

test("the dashboard's metric map has exactly the same keys as the backend's", { skip }, () => {
  const backend = Object.keys(METRIC_MAP).sort();
  const dashboard = Object.keys(parseDashboardMap()).sort();
  assert.deepEqual(
    dashboard,
    backend,
    `index.html and backend/src/metricMap.js have drifted — ${describeDrift(backend, dashboard, "backend", "index.html")}`
  );
});

test("the dashboard maps every metric to the same category and name as the backend", { skip }, () => {
  const dashboard = parseDashboardMap();
  for (const [key, spec] of Object.entries(METRIC_MAP)) {
    assert.deepEqual(
      dashboard[key],
      { categoryId: spec.categoryId, name: spec.name },
      `"${key}" points at a different category/name in index.html than in the backend — ` +
        `the dashboard would silently fail to find the metric in data.json`
    );
  }
});

test("the iOS app sends exactly the keys the backend accepts", { skip }, () => {
  const backend = Object.keys(METRIC_MAP).sort();
  const ios = parseSwiftKeys().sort();
  assert.deepEqual(
    ios,
    backend,
    `the iOS app and the backend have drifted — ${describeDrift(backend, ios, "backend", "iOS")}. ` +
      `Keys only in iOS are silently dropped into ignoredKeys; keys only in the backend are never sent.`
  );
});
