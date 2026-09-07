# Cloud Run redeploy

For pushing backend changes to the live server. Nothing here touches secrets,
IAM, Firestore or the service URL — those were all set up once and stay as
they are. You are only replacing the running code.

Expect 5–10 minutes, most of it waiting on the build.

---

## Why this one matters

`/v1/healthkit-history` shipped with no auth on it. Auth is bound per-path in
`index.js`, and adding a second read route left the new one uncovered:

```
/v1/healthkit-latest    no token → 401 unauthorized  ✅
/v1/healthkit-history   no token → 200 + your data   ❌
```

Anyone with the URL could pull up to 180 days of health data with no token at
all. The fix is committed and tested, but **the live server keeps serving the
open version until it is redeployed.** That is what this does.

---

## The details you need

| | |
|---|---|
| Project | `galvanized-env-507400-g6` |
| Service | `project50-healthkit` |
| Region | `us-central1` |
| URL | `https://project50-healthkit-98049860738.us-central1.run.app` |

---

## 1. Open Cloud Shell

Go to **https://console.cloud.google.com** and click the **terminal icon**
(`>_`) in the top-right toolbar. A shell opens at the bottom of the page.

Make sure it is pointed at the right project:

```bash
gcloud config set project galvanized-env-507400-g6
```

---

## 2. Prove the hole is real first

Worth doing, so you can see the fix land rather than take it on faith:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://project50-healthkit-98049860738.us-central1.run.app/v1/healthkit-history?days=5"
```

**Expect `200`.** That is the bug — no token was sent and it answered anyway.

For contrast, the route that is guarded correctly:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://project50-healthkit-98049860738.us-central1.run.app/v1/healthkit-latest"
```

**Expect `401`.** That is what the other one should be doing.

---

## 3. Get the fixed code

If you have never cloned the repo in Cloud Shell:

```bash
cd ~
git clone https://github.com/FunctionalCoreFitness/project-50.git
cd project-50
```

If it is already there from the first setup:

```bash
cd ~/project-50
git pull origin main
```

Either way, confirm you have the fix:

```bash
grep -n "healthkit-history" backend/src/index.js
```

You should see a line binding `requireBearerToken` to that route. If nothing
prints, the pull did not work — stop and check.

---

## 4. Deploy

Same command as the original deploy. The secrets are re-pinned deliberately:
`:latest` is resolved once at revision creation, so passing them again keeps
the new revision reading the current values.

```bash
gcloud run deploy project50-healthkit \
  --source backend \
  --region us-central1 \
  --allow-unauthenticated \
  --set-secrets=INGEST_API_KEY=healthkit-ingest-key:latest,READ_API_KEY=healthkit-read-key:latest
```

It will ask to enable APIs or confirm the source upload the first time —
answer `y`. Then it builds the container and rolls out a new revision. A few
minutes is normal.

Finish on `Service [project50-healthkit] revision [...] has been deployed`.

`--allow-unauthenticated` stays on by design: it is Cloud Run's own IAM
layer, and the bearer tokens are the real access control here. Removing it
would break the iOS app and the dashboard.

---

## 5. Prove the fix landed

The same two commands from step 2:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://project50-healthkit-98049860738.us-central1.run.app/v1/healthkit-history?days=5"
```

**Now expect `401`.** If it still says `200`, the old revision is still
serving — check the deploy output for an error.

And confirm the dashboard can still read with its token, so you know the fix
closed the hole without closing the door:

```bash
TOKEN=$(gcloud secrets versions access latest --secret=healthkit-read-key)
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" \
  "https://project50-healthkit-98049860738.us-central1.run.app/v1/healthkit-history?days=5"
```

**Expect `200`.**

Three results, and all three have to be right:

| Request | Expected |
|---|---|
| history, no token | `401` |
| history, read token | `200` |
| latest, no token | `401` |

---

## 6. Check the dashboard still works

Open the dashboard and confirm the nutrition charts still load. They read
through `/v1/healthkit-history` with the read token, so if step 5's second
command returned `200`, this will work — but look anyway.

---

## If the deploy fails

**Permission errors naming a role** — the first-time IAM grants are in
`backend/README.md`. They were already run once, so this is unlikely now.

**Build failures** — read the last 20 lines of the build log; it names the
failing step. `cd ~/project-50 && git status` to confirm you are on a clean
checkout of `main`.

**Rolling back** — Cloud Run keeps every revision. In the console, under
Cloud Run → project50-healthkit → Revisions, you can route traffic back to
the previous one instantly.
