const express = require("express");
const firestore = require("../firestore");

const router = express.Router();

// This endpoint is called via browser fetch() from the dashboard's origin,
// which differs from wherever this API is deployed — that makes it a
// cross-origin request, and the Authorization header on it triggers a CORS
// preflight (OPTIONS) that the browser requires an explicit allow-list
// response for. Restricted to exactly one configured origin — the ingest
// route doesn't need this at all, since native URLSession calls from the
// iOS app aren't subject to CORS.
const DASHBOARD_ORIGIN = process.env.DASHBOARD_ORIGIN || "https://functionalcorefitness.github.io";

router.options("/v1/healthkit-latest", (req, res) => {
  res.set({
    "Access-Control-Allow-Origin": DASHBOARD_ORIGIN,
    "Access-Control-Allow-Methods": "GET",
    "Access-Control-Allow-Headers": "Authorization",
  });
  res.status(204).end();
});

// GET /v1/healthkit-latest
// Auth: Authorization: Bearer <READ_API_KEY> — a separate, read-only token
// from the ingest one (this endpoint is called from public client-side JS).
router.get("/v1/healthkit-latest", async (req, res) => {
  res.set("Access-Control-Allow-Origin", DASHBOARD_ORIGIN);
  try {
    const latest = await firestore.getLatestDay();
    if (!latest) {
      return res.status(404).json({ error: "no data synced yet" });
    }
    res.status(200).json(latest);
  } catch (err) {
    console.error("healthkit-latest: Firestore read failed", { message: err.message });
    res.status(502).json({ error: "storage read failed" });
  }
});

module.exports = router;
