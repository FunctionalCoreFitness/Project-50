const express = require("express");
const { requireBearerToken } = require("./auth");
const syncRoute = require("./routes/sync");
const latestRoute = require("./routes/latest");

const INGEST_API_KEY = process.env.INGEST_API_KEY;
const READ_API_KEY = process.env.READ_API_KEY;

const app = express();

// Structured, payload-free request logging. No middleware here ever touches
// req.body — only method/path/status/latency, which is safe to keep in
// Cloud Run's log sink indefinitely.
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on("finish", () => {
    console.log(JSON.stringify({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
    }));
  });
  next();
});

app.get("/healthz", (req, res) => res.status(200).send("ok"));

// Each route gets its own auth middleware instance scoped to just that path,
// so the ingest and read tokens are never checked against the wrong route.
app.post("/v1/healthkit-sync", requireBearerToken(INGEST_API_KEY, "ingest"));
app.use(syncRoute);

app.get("/v1/healthkit-latest", requireBearerToken(READ_API_KEY, "read"));
app.use(latestRoute);

app.use((req, res) => res.status(404).json({ error: "not found" }));

// Error handler: never echoes err.message that could contain payload
// fragments (e.g. a JSON parse error from express.json() includes a snippet
// of the offending body) back to the client or into logs.
app.use((err, req, res, next) => {
  console.error("unhandled error", { path: req.path, name: err.name });
  res.status(400).json({ error: "bad request" });
});

const PORT = process.env.PORT || 8080;
if (require.main === module) {
  if (!INGEST_API_KEY || !READ_API_KEY) {
    console.error("INGEST_API_KEY and READ_API_KEY must both be set — refusing to start.");
    process.exit(1);
  }
  app.listen(PORT, () => console.log(`project50-healthkit-backend listening on ${PORT}`));
}

module.exports = app;
