const test = require("node:test");
const assert = require("node:assert/strict");

// Auth middleware reads these at module-load time, so they must be set
// before `../src/index` (and therefore `../src/auth`) is required.
process.env.INGEST_API_KEY = "test-ingest-key";
process.env.READ_API_KEY = "test-read-key";

const app = require("../src/index");
const firestore = require("../src/firestore");

// Never hardcode a date: validateSyncPayload rejects anything more than a
// year old, so a literal date would quietly start failing (or worse, make the
// rejection tests pass for the wrong reason). See validate.test.js.
function daysFromNow(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
const YESTERDAY = daysFromNow(-1);

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

async function request(server, { method, path, token, body, rawBody, contentType }) {
  const { port } = server.address();
  const headers = { "content-type": contentType || "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;

  let payload;
  if (rawBody !== undefined) payload = rawBody;
  else if (body !== undefined) payload = JSON.stringify(body);

  const res = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not every response is JSON (e.g. /healthz) */
  }
  return { status: res.status, json, text, headers: res.headers };
}

// ---- auth / scope separation ----

test("POST /v1/healthkit-sync rejects a missing token", async (t) => {
  const server = await listen(app);
  t.after(() => server.close());
  const { status } = await request(server, {
    method: "POST",
    path: "/v1/healthkit-sync",
    body: { date: YESTERDAY, metrics: { vo2Max: 37.5 } },
  });
  assert.equal(status, 401);
});

test("POST /v1/healthkit-sync rejects the read token (wrong scope)", async (t) => {
  const server = await listen(app);
  t.after(() => server.close());
  const { status } = await request(server, {
    method: "POST",
    path: "/v1/healthkit-sync",
    token: "test-read-key",
    body: { date: YESTERDAY, metrics: { vo2Max: 37.5 } },
  });
  assert.equal(status, 401);
});

test("GET /v1/healthkit-latest rejects the ingest token (wrong scope)", async (t) => {
  const server = await listen(app);
  t.after(() => server.close());
  const { status } = await request(server, {
    method: "GET",
    path: "/v1/healthkit-latest",
    token: "test-ingest-key",
  });
  assert.equal(status, 401);
});

// ---- ingest happy path + validation ----

test("POST /v1/healthkit-sync stores a valid payload via the ingest token", async (t) => {
  const stored = [];
  const original = firestore.upsertDay;
  firestore.upsertDay = async (date, metrics) => { stored.push({ date, metrics }); };
  t.after(() => { firestore.upsertDay = original; });

  const server = await listen(app);
  t.after(() => server.close());

  const { status, json } = await request(server, {
    method: "POST",
    path: "/v1/healthkit-sync",
    token: "test-ingest-key",
    body: { date: YESTERDAY, metrics: { vo2Max: 37.5, stepCount: 13897 } },
  });

  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.stored, 2);
  assert.equal(stored.length, 1);
  assert.deepEqual(stored[0], { date: YESTERDAY, metrics: { vo2Max: 37.5, stepCount: 13897 } });
});

test("POST /v1/healthkit-sync reports unknown keys it ignored rather than rejecting the batch", async (t) => {
  const stored = [];
  const original = firestore.upsertDay;
  firestore.upsertDay = async (date, metrics) => { stored.push({ date, metrics }); };
  t.after(() => { firestore.upsertDay = original; });

  const server = await listen(app);
  t.after(() => server.close());

  const { status, json } = await request(server, {
    method: "POST",
    path: "/v1/healthkit-sync",
    token: "test-ingest-key",
    body: { date: YESTERDAY, metrics: { vo2Max: 37.5, someFutureHealthKitField: 12 } },
  });

  assert.equal(status, 200);
  assert.deepEqual(json.ignoredKeys, ["someFutureHealthKitField"]);
  // The recognized metric still lands in storage; only the unknown one is dropped.
  assert.deepEqual(stored[0].metrics, { vo2Max: 37.5 });
});

test("POST /v1/healthkit-sync returns 400 for a malformed payload and never reaches storage", async (t) => {
  let called = false;
  const original = firestore.upsertDay;
  firestore.upsertDay = async () => { called = true; };
  t.after(() => { firestore.upsertDay = original; });

  const server = await listen(app);
  t.after(() => server.close());

  const { status } = await request(server, {
    method: "POST",
    path: "/v1/healthkit-sync",
    token: "test-ingest-key",
    body: { date: YESTERDAY, metrics: { vo2Max: "vo2-37.5" } },
  });

  assert.equal(status, 400);
  assert.equal(called, false);
});

// ---- error paths ----

test("POST /v1/healthkit-sync returns 502 when the storage write fails", async (t) => {
  const original = firestore.upsertDay;
  firestore.upsertDay = async () => { throw new Error("firestore unavailable"); };
  t.after(() => { firestore.upsertDay = original; });

  const server = await listen(app);
  t.after(() => server.close());

  const { status, json } = await request(server, {
    method: "POST",
    path: "/v1/healthkit-sync",
    token: "test-ingest-key",
    body: { date: YESTERDAY, metrics: { vo2Max: 37.5 } },
  });

  assert.equal(status, 502);
  assert.deepEqual(json, { error: "storage write failed" });
});

test("GET /v1/healthkit-latest returns 502 when the storage read fails", async (t) => {
  const original = firestore.getLatestDay;
  firestore.getLatestDay = async () => { throw new Error("firestore unavailable"); };
  t.after(() => { firestore.getLatestDay = original; });

  const server = await listen(app);
  t.after(() => server.close());

  const { status, json } = await request(server, {
    method: "GET",
    path: "/v1/healthkit-latest",
    token: "test-read-key",
  });

  assert.equal(status, 502);
  assert.deepEqual(json, { error: "storage read failed" });
});

test("a malformed JSON body gets a 400 that never echoes the body back", async (t) => {
  const server = await listen(app);
  t.after(() => server.close());

  // express.json() throws a SyntaxError whose message normally quotes a chunk
  // of the offending body. The error handler must not pass that through — no
  // payload content may reach the client or the logs.
  const { status, json, text } = await request(server, {
    method: "POST",
    path: "/v1/healthkit-sync",
    token: "test-ingest-key",
    rawBody: '{"vo2Max": 37.5, "distinctivePayloadMarker": ',
  });

  assert.equal(status, 400);
  assert.deepEqual(json, { error: "bad request" });
  assert.ok(
    !text.includes("distinctivePayloadMarker"),
    "the 400 response leaked a fragment of the request body"
  );
});

test("an unknown path gets a JSON 404", async (t) => {
  const server = await listen(app);
  t.after(() => server.close());
  const { status, json } = await request(server, { method: "GET", path: "/v1/nope" });
  assert.equal(status, 404);
  assert.deepEqual(json, { error: "not found" });
});

// ---- read path ----

test("GET /v1/healthkit-latest returns the latest day via the read token", async (t) => {
  const original = firestore.getLatestDay;
  firestore.getLatestDay = async () => ({
    date: YESTERDAY,
    receivedAt: "2026-09-01T06:00:00.000Z",
    metrics: { vo2Max: 37.5 },
  });
  t.after(() => { firestore.getLatestDay = original; });

  const server = await listen(app);
  t.after(() => server.close());

  const { status, json } = await request(server, {
    method: "GET",
    path: "/v1/healthkit-latest",
    token: "test-read-key",
  });

  assert.equal(status, 200);
  assert.equal(json.date, YESTERDAY);
  assert.equal(json.metrics.vo2Max, 37.5);
});

test("GET /v1/healthkit-latest returns 404 when nothing has synced yet", async (t) => {
  const original = firestore.getLatestDay;
  firestore.getLatestDay = async () => null;
  t.after(() => { firestore.getLatestDay = original; });

  const server = await listen(app);
  t.after(() => server.close());

  const { status } = await request(server, {
    method: "GET",
    path: "/v1/healthkit-latest",
    token: "test-read-key",
  });

  assert.equal(status, 404);
});

// ---- CORS (the dashboard reads this cross-origin) ----

test("OPTIONS /v1/healthkit-latest answers the CORS preflight without auth", async (t) => {
  const server = await listen(app);
  t.after(() => server.close());
  const { status, headers } = await request(server, {
    method: "OPTIONS",
    path: "/v1/healthkit-latest",
  });
  assert.equal(status, 204);
  assert.equal(headers.get("access-control-allow-origin"), "https://functionalcorefitness.github.io");
  assert.equal(headers.get("access-control-allow-headers"), "Authorization");
});

test("GET /v1/healthkit-latest sets Access-Control-Allow-Origin on the real response too", async (t) => {
  const original = firestore.getLatestDay;
  firestore.getLatestDay = async () => ({ date: YESTERDAY, receivedAt: null, metrics: { vo2Max: 37.5 } });
  t.after(() => { firestore.getLatestDay = original; });

  const server = await listen(app);
  t.after(() => server.close());
  const { headers } = await request(server, {
    method: "GET",
    path: "/v1/healthkit-latest",
    token: "test-read-key",
  });
  assert.equal(headers.get("access-control-allow-origin"), "https://functionalcorefitness.github.io");
});

test("GET /healthz needs no auth", async (t) => {
  const server = await listen(app);
  t.after(() => server.close());
  const { status, text } = await request(server, { method: "GET", path: "/healthz" });
  assert.equal(status, 200);
  assert.equal(text, "ok");
});
