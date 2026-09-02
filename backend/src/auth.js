const crypto = require("crypto");

// Constant-time compare so a timing attack can't be used to guess the token
// byte-by-byte. Falls back to `false` on any length mismatch without ever
// branching on *which* byte differed.
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Builds an Express middleware that requires `Authorization: Bearer <token>`
// to match the given expected secret. Two independent instances of this are
// used — one for the write (ingest) route, one for the read route — so a
// leaked read token (it lives in public client-side JS) can never be used
// to write fake data.
function requireBearerToken(expectedToken, label) {
  if (!expectedToken) {
    throw new Error(`Missing required token for ${label} auth — check env/secret config.`);
  }
  return function bearerAuthMiddleware(req, res, next) {
    const header = req.get("authorization") || "";
    const match = /^Bearer (.+)$/.exec(header);
    if (!match || !safeEqual(match[1], expectedToken)) {
      return res.status(401).json({ error: "unauthorized" });
    }
    next();
  };
}

module.exports = { safeEqual, requireBearerToken };
