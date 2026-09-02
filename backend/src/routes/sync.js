const express = require("express");
const { validateSyncPayload } = require("../validate");
const firestore = require("../firestore");

const router = express.Router();

// POST /v1/healthkit-sync
// Body: { date: "YYYY-MM-DD", metrics: { <metricMap key>: number, ... } }
// Auth: Authorization: Bearer <INGEST_API_KEY> (checked by middleware in index.js)
router.post("/v1/healthkit-sync", express.json({ limit: "64kb" }), async (req, res) => {
  const result = validateSyncPayload(req.body);
  if (!result.ok) {
    // Never log req.body here — validation errors still must not leak payload
    // content into logs. The error message describes the *shape* problem only.
    return res.status(400).json({ error: result.error });
  }

  try {
    await firestore.upsertDay(result.date, result.metrics);
  } catch (err) {
    // Log the failure, not the payload that triggered it.
    console.error("healthkit-sync: Firestore write failed", { date: result.date, message: err.message });
    return res.status(502).json({ error: "storage write failed" });
  }

  const response = { ok: true, date: result.date, stored: Object.keys(result.metrics).length };
  if (result.unknownKeys.length) {
    // Surface unrecognized keys back to the client (not logged server-side)
    // so the iOS app can flag a schema drift instead of silently dropping data.
    response.ignoredKeys = result.unknownKeys;
  }
  res.status(200).json(response);
});

module.exports = router;
