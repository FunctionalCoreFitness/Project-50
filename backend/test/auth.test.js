const test = require("node:test");
const assert = require("node:assert/strict");
const { safeEqual, requireBearerToken } = require("../src/auth");

test("safeEqual matches identical strings", () => {
  assert.equal(safeEqual("abc123", "abc123"), true);
});

test("safeEqual rejects a wrong token of the same length", () => {
  assert.equal(safeEqual("abc123", "abc124"), false);
});

test("safeEqual rejects a different-length token without throwing", () => {
  assert.equal(safeEqual("short", "a-much-longer-token"), false);
});

test("requireBearerToken throws at construction if no secret is configured", () => {
  assert.throws(() => requireBearerToken(undefined, "ingest"));
});

function fakeReqRes(authHeader) {
  const req = { get: (name) => (name.toLowerCase() === "authorization" ? authHeader : undefined) };
  let statusCode = null;
  let body = null;
  const res = {
    status(code) { statusCode = code; return this; },
    json(payload) { body = payload; return this; },
  };
  return { req, res, result: () => ({ statusCode, body }) };
}

test("middleware rejects a missing Authorization header", () => {
  const mw = requireBearerToken("secret-token", "ingest");
  const { req, res, result } = fakeReqRes(undefined);
  let nextCalled = false;
  mw(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(result().statusCode, 401);
});

test("middleware rejects the wrong token", () => {
  const mw = requireBearerToken("secret-token", "ingest");
  const { req, res, result } = fakeReqRes("Bearer wrong-token");
  let nextCalled = false;
  mw(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(result().statusCode, 401);
});

test("middleware calls next() for the correct token", () => {
  const mw = requireBearerToken("secret-token", "ingest");
  const { req, res } = fakeReqRes("Bearer secret-token");
  let nextCalled = false;
  mw(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test("the ingest token and read token middlewares are independent", () => {
  const ingestMw = requireBearerToken("ingest-secret", "ingest");
  const { req, res } = fakeReqRes("Bearer read-secret");
  let nextCalled = false;
  ingestMw(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false, "a read token must never authorize the ingest route");
});
