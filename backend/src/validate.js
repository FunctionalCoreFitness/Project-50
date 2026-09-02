const { VALID_KEYS } = require("./metricMap");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Yesterday's date, in the sync's own timezone convention: the iOS app sends
// the calendar date the data covers (device-local), so we only sanity-check
// shape/format/range here — we don't recompute "yesterday" server-side,
// since the phone and server can legitimately be in different timezones.
function isPlausibleDate(dateStr) {
  if (!DATE_RE.test(dateStr)) return false;
  const d = new Date(dateStr + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return false;
  const now = Date.now();
  const oneYearMs = 366 * 24 * 60 * 60 * 1000;
  // Reject anything absurdly old or more than a day in the future — this
  // catches clock-skew bugs and malformed payloads without hardcoding an
  // assumption about which timezone "today" means.
  return d.getTime() > now - oneYearMs && d.getTime() < now + 2 * 24 * 60 * 60 * 1000;
}

// Validates and sanitizes a sync payload. Returns { ok:true, date, metrics }
// or { ok:false, error } — never throws, so route handlers can respond
// cleanly without a try/catch around business logic.
function validateSyncPayload(body) {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "body must be a JSON object" };
  }
  const { date, metrics } = body;
  if (typeof date !== "string" || !isPlausibleDate(date)) {
    return { ok: false, error: "date must be a YYYY-MM-DD string within the last year" };
  }
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) {
    return { ok: false, error: "metrics must be an object" };
  }

  const clean = {};
  const unknownKeys = [];
  for (const [key, value] of Object.entries(metrics)) {
    if (!VALID_KEYS.has(key)) {
      unknownKeys.push(key);
      continue;
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return { ok: false, error: `metrics.${key} must be a finite number` };
    }
    clean[key] = value;
  }

  if (Object.keys(clean).length === 0) {
    return { ok: false, error: "metrics contained no recognized keys" };
  }

  return { ok: true, date, metrics: clean, unknownKeys };
}

module.exports = { validateSyncPayload, isPlausibleDate };
