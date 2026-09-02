const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

// Auth middleware reads these at module-load time, so they must be set
// before `../src/index` (and therefore `../src/auth`) is required.
process.env.INGEST_API_KEY = "test-ingest-key";
process.env.READ_API_KEY = "test-read-key";

const app = require("../src/index");
const firestore = require("../src/firestore");

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

async function request(server, { method, path, token, body }) {
  const { port } = server.address();
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

test("POST /v1/healthkit-sync rejects a missing token", async (t) => {
  const server = await listen(app);
  t.after(() => server.close());
  const { status } = await request(server, {
    method: "POST",
    path: "/v1/healthkit-sync",
    body: { date: "2026-08-31", metrics: { vo2Max: 37.5 } },
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
    body: { date: "2026-08-31", metrics: { vo2Max: 37.5 } },
  });
  assert.equal(status, 401);
});

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
    body: { date: "2026-08-31", metrics: { vo2Max: 37.5, stepCount: 13897 } },
  });

  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.equal(stored.length, 1);
  assert.deepEqual(stored[0], { date: "2026-08-31", metrics: { vo2Max: 37.5, stepCount: 13897 } });
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
    body: { date: "2026-08-31", metrics: { vo2Max: "vo2-37.5" } },
  });

  assert.equal(status, 400);
  assert.equal(called, false);
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

test("GET /v1/healthkit-latest returns the latest day via the read token", async (t) => {
  const original = firestore.getLatestDay;
  firestore.getLatestDay = async () => ({
    date: "2026-08-31",
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
  assert.equal(json.date, "2026-08-31");
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

test("OPTIONS /v1/healthkit-latest answers the CORS preflight without auth", async (t) => {
  const server = await listen(app);
  t.after(() => server.close());
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/v1/healthkit-latest`, { method: "OPTIONS" });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("access-control-allow-origin"), "https://functionalcorefitness.github.io");
  assert.equal(res.headers.get("access-control-allow-headers"), "Authorization");
});

test("GET /v1/healthkit-latest sets Access-Control-Allow-Origin on the real response too", async (t) => {
  const original = firestore.getLatestDay;
  firestore.getLatestDay = async () => ({ date: "2026-08-31", receivedAt: null, metrics: { vo2Max: 37.5 } });
  t.after(() => { firestore.getLatestDay = original; });

  const server = await listen(app);
  t.after(() => server.close());
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/v1/healthkit-latest`, {
    headers: { authorization: "Bearer test-read-key" },
  });
  assert.equal(res.headers.get("access-control-allow-origin"), "https://functionalcorefitness.github.io");
});

test("GET /healthz needs no auth", async (t) => {
  const server = await listen(app);
  t.after(() => server.close());
  const { status } = await request(server, { method: "GET", path: "/healthz" });
  assert.equal(status, 200);
});
