# Project 50 HealthKit backend

A single-user ingest + read API: the iOS app uploads yesterday's HealthKit
summary once a day; the dashboard (`index.html`) reads the latest day back.

- **Cloud Run** (this Express app) over Cloud Functions — one service, two
  routes sharing auth middleware and a Firestore client.
- **Firestore** over BigQuery/Cloud SQL — one document per day
  (`healthkit_days/{YYYY-MM-DD}`), upserted daily and read back by "latest
  document ID." No time-series analytics are needed at this volume (~20
  numbers, once a day, one user), so BigQuery's streaming-insert cost and
  query surface would be pure overhead here.

## Local development

```bash
cd backend
npm install
INGEST_API_KEY=dev-ingest READ_API_KEY=dev-read npm start
```

Firestore calls need credentials even locally. Either:
- point at a real (dev) Firestore project: `gcloud auth application-default login`, or
- run against the [Firestore emulator](https://firebase.google.com/docs/emulator-suite): set
  `FIRESTORE_EMULATOR_HOST=localhost:8080` before starting the app.

Run the test suite (pure logic + full HTTP round-trips with Firestore calls
substituted — no live GCP project needed):

```bash
npm test
```

## Deploying to GCloud

Replace `PROJECT_ID` and `REGION` (e.g. `us-central1`) below.

```bash
# One-time setup
gcloud config set project PROJECT_ID
gcloud services enable run.googleapis.com firestore.googleapis.com \
  secretmanager.googleapis.com

# Firestore in Native mode, once per project
gcloud firestore databases create --location=REGION

# Generate and store the two long-lived tokens. Keep the ingest one for the
# iOS app's Keychain only — never put it in the web app or the repo.
openssl rand -hex 32 | gcloud secrets create healthkit-ingest-key --data-file=-
openssl rand -hex 32 | gcloud secrets create healthkit-read-key --data-file=-

# Deploy
gcloud run deploy project50-healthkit \
  --source backend \
  --region REGION \
  --no-allow-unauthenticated=false \
  --set-secrets=INGEST_API_KEY=healthkit-ingest-key:latest,READ_API_KEY=healthkit-read-key:latest
```

`--allow-unauthenticated` (Cloud Run's own IAM layer, distinct from our
bearer-token check) is left on because both routes are public endpoints
guarded by their own token — the ingest and read tokens are the actual
access control here, not Cloud IAM. If you'd rather stack Cloud Run's IAM in
front too, switch to `--no-allow-unauthenticated` and have the iOS app fetch
an identity token via a service account key instead of a bearer secret; that
adds real complexity (service account key management on-device) for a
single-user app that doesn't need it.

Grant the Cloud Run service's runtime service account access to Firestore
(the default compute service account has this by default in most projects
via the Editor role; if you've locked that down, grant `roles/datastore.user`
explicitly instead of a broader role).

Read the two secret values back out to configure the iOS app and the web
app respectively:

```bash
gcloud secrets versions access latest --secret=healthkit-ingest-key
gcloud secrets versions access latest --secret=healthkit-read-key
```

## API

### `POST /v1/healthkit-sync`

`Authorization: Bearer <INGEST_API_KEY>`

```json
{
  "date": "2026-08-31",
  "metrics": { "vo2Max": 37.5, "stepCount": 13897, "...": "see src/metricMap.js for all keys" }
}
```

Unknown metric keys are accepted and ignored (reported back in
`ignoredKeys`) rather than rejecting the whole payload — lets the iOS app
send a superset of HealthKit types without breaking on backend/app version
skew.

### `GET /v1/healthkit-latest`

`Authorization: Bearer <READ_API_KEY>`

Returns the most recently synced day, or `404` if nothing has synced yet.

## What "no payload logging" means here

The request logger in `src/index.js` only ever logs method/path/status/
latency. No middleware logs `req.body`, and error handlers log `err.name`
rather than `err.message` (which for a JSON parse error can contain a
fragment of the raw body). Cloud Run's own platform request logs record
metadata, not bodies, by default.
