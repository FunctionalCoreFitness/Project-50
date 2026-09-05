const { Firestore, FieldPath } = require("@google-cloud/firestore");

const COLLECTION = "healthkit_days";

// Firestore project/credentials come from the Cloud Run service's default
// runtime environment (Application Default Credentials) — no key file
// checked into the repo. Locally, set GOOGLE_APPLICATION_CREDENTIALS or run
// against the Firestore emulator (FIRESTORE_EMULATOR_HOST).
const db = new Firestore();

// Upserts one day's metrics. Uses set({merge:true}) so a same-day resync
// (e.g. the >20h foreground fallback firing after a background task already
// landed partial data) fills in additional fields instead of clobbering them.
async function upsertDay(date, metrics) {
  const doc = db.collection(COLLECTION).doc(date);
  await doc.set(
    {
      ...metrics,
      date,
      receivedAt: Firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

// Firestore document IDs here are YYYY-MM-DD strings, which sort correctly
// as plain strings — so "most recent day" is just the max document ID, no
// separate index or timestamp field needed for the query itself.
async function getLatestDay() {
  const snap = await db
    .collection(COLLECTION)
    .orderBy(FieldPath.documentId(), "desc")
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  const data = doc.data();
  const { date, receivedAt, ...metrics } = data;
  return {
    date: date || doc.id,
    receivedAt: receivedAt ? receivedAt.toDate().toISOString() : null,
    metrics,
  };
}

// Returns up to `days` most-recent days, oldest-first, for charting a daily
// series. Same documentId ordering trick as getLatestDay — descending for the
// limit, then reversed so callers get chronological order without re-sorting.
async function getRecentDays(days = 30) {
  const limit = Math.min(Math.max(Number(days) || 30, 1), 180);
  const snap = await db
    .collection(COLLECTION)
    .orderBy(FieldPath.documentId(), "desc")
    .limit(limit)
    .get();
  if (snap.empty) return [];
  return snap.docs
    .map((doc) => {
      const { date, receivedAt, ...metrics } = doc.data();
      return { date: date || doc.id, metrics };
    })
    .reverse();
}

module.exports = { db, upsertDay, getLatestDay, getRecentDays, COLLECTION };
