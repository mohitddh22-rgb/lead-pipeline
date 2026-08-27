# Lead Pipeline — Development & Recreation Document

> **Purpose:** A single source of truth for everything built in this project — the
> automation architecture, every API/function, required tools, credentials, metrics,
> and a step-by-step rebuild guide. If you need to recreate this from scratch, follow
> the "Recreate From Scratch" section.

---

## 1. What This System Does

A **zero-cost, serverless real-estate lead-generation + cold-outreach pipeline**:

1. **Discovers** real-estate agencies from OpenStreetMap (Overpass API) in 3 regions (US / EU / AU).
2. **Extracts** name, website, phone, city, email from OSM tags.
3. **Validates** emails (regex) and **normalizes** (drops generic inboxes like info@/sales@).
4. **Deduplicates** against the Google Sheet + in-run memory.
5. **Appends** new leads to a Google Sheet (7 columns).
6. **Sends** a cold email via Resend for each new lead (from `sales@spaciab2b.com`).
7. **Marks** leads "Contacted" in the sheet.
8. **Runs automatically** daily at 09:00 UTC via a Vercel Cron, or manually via API.
9. **Dashboards** everything in a Master Control Center (`/admin/dashboard`).

**Cost:** $0 — OSM Overpass is free (no key); Google Sheets + Resend free tiers used.
(Overpass may 406 from some IPs; a seeded mock fallback keeps outreach alive.)

---

## 2. Tech Stack / Tools Used

| Layer | Tool | Why |
|-------|------|-----|
| Framework | **Next.js 14 (App Router)** | Serverless API routes + React dashboard |
| Runtime | **Vercel (Node.js 18+)** | Hosting, Cron, auto-deploy |
| Language | **JavaScript (ESM)** | No TS compile step needed |
| Sheets | **Google Sheets API** (googleapis) | Acts as the database (zero-cost DB) |
| Email | **Resend** | Transactional cold email |
| Discovery | **OSM Overpass API** | Free geo business discovery, no key |
| Queue (opt) | **Upstash QStash** | Async email fan-out (optional) |
| Suppression (opt) | **Upstash Redis** | Opt-out store (optional) |
| Auth | **CRON_SECRET** env var | Protects all cron/trigger endpoints |
| CI | **GitHub Actions** | Auto-backup `main` → `backup` branch |

**Dependencies** (`package.json`): `next`, `react`, `react-dom`, `googleapis`,
`resend`, `axios`, `cheerio`, `@upstash/qstash`, `@upstash/redis`.

---

## 3. Architecture (Data Flow)

```
                         ┌─────────────────────────────────────────┐
                         │   Vercel Cron  (daily 09:00 UTC)          │
                         │   POST /api/cron/batch-process           │
                         └───────────────────┬─────────────────────┘
                                             │  (no region = all regions)
                                             ▼
                         ┌─────────────────────────────────────────┐
                         │  lib/pipeline.js → dispatchRegions()      │
                         │  runs IN-PROCESS for us/eu/au (sequential)│
                         └───────────────────┬─────────────────────┘
                                             ▼
                  ┌──────────────────────────────────────────────┐
                  │  runRegionPipeline(region)                     │
                  │   1. scrapeLeads()  ──▶ lib/scraper.js         │
                  │        └─ OSM Overpass (or seed fallback)      │
                  │   2. getExistingKeys() ──▶ lib/sheets.js       │
                  │   3. normalizeLeads()  ──▶ lib/leads.js        │
                  │        (email regex + drop generic inboxes)    │
                  │   4. isSuppressed()  ──▶ lib/suppress.js       │
                  │   5. appendLeads()   ──▶ Google Sheet (A2:G)   │
                  │   6. sendColdEmail() ──▶ lib/email.js → Resend │
                  └──────────────────────────────────────────────┘
                                             │
                  ┌──────────────────────────┴─────────────────────┐
                  ▼                                                 ▼
        Google Sheet (DB)                              Resend (email)
        Leads!A2:G                                    sales@spaciab2b.com
                  │                                                 │
                  └──────────────▶ /api/admin/metrics ◀────────────┘
                                    │
                                    ▼
                          /admin/dashboard (polling 15s)
```

**Key design decision:** `dispatchRegions()` calls `runRegionPipeline()` **in-process**
(no internal HTTP fetch). This avoids Vercel Deployment Protection (Vercel Auth) 401s
that broke the earlier version which fetched `/api/worker` over HTTP.

---

## 4. Google Sheet Schema (the "database")

Tab name: **`Leads`** (set by `SHEET_NAME`). Columns `A2:G`:

| Col | Field | Source |
|-----|-------|--------|
| A | Company | OSM `name` / seed |
| B | Website | OSM `website` |
| C | Location | OSM `addr:city` / region |
| D | Email | OSM `email` / seed |
| E | Status | `contacted` / `pending` |
| F | Date Added | ISO timestamp |
| G | Last Emailed | ISO timestamp |

Dedup keys: website (`w:...`) + email (`e:...`), both lowercased.

---

## 5. API Endpoints / Functions

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/cron/batch-process` | POST/GET | `CRON_SECRET` | Cron entry — runs all 3 regions in-process. Called daily by Vercel. |
| `/api/manual?region=us` | POST | `CRON_SECRET` | Manual single-region trigger (body or query). |
| `/api/worker` | POST | `CRON_SECRET` | Single-region pipeline (legacy HTTP path; `region` required in body). |
| `/api/email/send` | POST | `CRON_SECRET` | Send one email (`{lead}`). |
| `/api/queue/email` | POST | `CRON_SECRET` | QStash consumer — sends queued email. |
| `/api/queue/worker` | POST | `CRON_SECRET` | QStash consumer — runs one region. |
| `/api/unsubscribe` | GET | public | Opt-out (`?email=`). |
| `/api/admin/metrics?key=...` | GET | `CRON_SECRET` (header or `?key=`) | Backend metrics for dashboard. |
| `/admin/dashboard?key=...` | GET | `CRON_SECRET` (in URL) | Master Control Center UI. |
| `/dashboard` | GET | public | Basic lead monitor (legacy). |

**Auth scheme:** `Authorization: Bearer <CRON_SECRET>` header OR `?key=<CRON_SECRET>` query.
Vercel's live `CRON_SECRET` = `Mohit810986@` (with `@`).

---

## 6. Required Credentials / Env Vars

Set in **Vercel Project → Settings → Environment Variables** (Production):

| Var | Required | Notes |
|-----|----------|-------|
| `GOOGLE_SHEETS_CREDENTIALS` | ✅ | JSON service-account key (from Google Cloud). |
| `SPREADSHEET_ID` | ✅ | ID from the sheet URL. |
| `SHEET_NAME` | ⬜ | Default `Leads`. |
| `RESEND_API_KEY` | ✅ | `re_...` from Resend. |
| `FROM_EMAIL` | ⬜ | Default `sales@spaciab2b.com`. Must be a verified Resend domain. |
| `CRON_SECRET` | ✅ | Protects all trigger endpoints. Live value `Mohit810986@`. |
| `EMAIL_SUBJECT` | ⬜ | Template w/ `{{company}}` etc. |
| `EMAIL_BODY_TEMPLATE` | ⬜ | Plain-text template. |
| `UNSUBSCRIBE_URL` | ⬜ | For List-Unsubscribe header. |
| `QSTASH_TOKEN` | ⬜ | Enables async queue mode (optional). |
| `UPSTASH_REDIS_REST_URL/TOKEN` | ⬜ | Opt-out store (optional). |
| `BATCH_SIZE` | ⬜ | Default 50. |

**Resend test-mode note:** blocks unverified `to` domains (e.g. `example.com`).
Real agency domains send fine. Verify your domain in Resend to email anyone.

---

## 7. Google Cloud Setup (Sheets)

1. Google Cloud Console → new project.
2. Enable **Google Sheets API**.
3. IAM → Service Accounts → create → download JSON key.
4. Share your Sheet with the service account's `client_email` (Editor).
5. Paste the JSON into `GOOGLE_SHEETS_CREDENTIALS`.

---

## 8. Metrics Captured

`/api/admin/metrics` returns:
- **Tech:** Overpass / Sheets / Resend health + latency (ms).
- **Business:** total / contacted / pending leads, cost-per-lead ($0.00),
  regional breakdown, Resend delivery/bounce rates.
- **Architecture:** fallback mode (Primary OSM vs Mock), dedup counts.
- **Cron:** schedule `0 9 * * *`, next-run countdown (ms).

Dashboard polls this every **15s**.

---

## 9. Git Workflow (professional)

Branches:
- **`main`** — production/live (protected, merge-only).
- **`testing`** — dev work happens here.
- **`backup`** — auto-mirrors `main` on every push (GitHub Action).

```
git checkout testing
# ... edit, commit, push ...
git push origin testing
# when happy:
git checkout main && git merge testing && git push origin main
# → .github/workflows/backup.yml fires → backup synced to main automatically
```

`.github/workflows/backup.yml`: on `push` to `main`, force-syncs `backup`
to `main` using `GITHUB_TOKEN` (contents: write).

---

## 10. Recreate From Scratch (fast path)

```bash
# 1. Scaffold
npx create-next-app@14 lead-pipeline --js --app
cd lead-pipeline
npm i googleapis resend axios cheerio @upstash/qstash @upstash/redis

# 2. Create files (copy from this repo):
#    lib/config.js  lib/scraper.js  lib/sheets.js  lib/email.js
#    lib/leads.js   lib/pipeline.js lib/queue.js   lib/suppress.js
#    lib/authApp.js lib/dashboard.js
#    app/api/manual/route.js          app/api/cron/batch-process/route.js
#    app/api/worker/route.js          app/api/email/send/route.js
#    app/api/queue/email/route.js     app/api/queue/worker/route.js
#    app/api/unsubscribe/route.js     app/api/admin/metrics/route.js
#    app/admin/dashboard/page.js      app/dashboard/page.js
#    vercel.json  .github/workflows/backup.yml  .env.example

# 3. Google Sheet: tab "Leads", cols A-G (Company,Website,Location,Email,Status,DateAdded,LastEmailed)
#    Share with service-account email.

# 4. Vercel env vars (section 6). Deploy:
vercel --prod

# 5. Cron auto-runs daily 09:00 UTC. Manual test:
curl -X POST "https://lead-pipeline-gilt.vercel.app/api/manual?region=us" \
  -H "Authorization: Bearer Mohit810986@"

# 6. Dashboard:
open "https://lead-pipeline-gilt.vercel.app/admin/dashboard?key=Mohit810986@"
```

**Critical gotchas (learned the hard way):**
- ❌ Never have BOTH `api/X.js` (Pages Router) and `app/api/X/route.js` for the same
  path — Vercel serves the stale `api/` file. Delete `api/*.js` if migrating to App Router.
- ❌ Don't fetch your own `/api/worker` over HTTP from a serverless function — Vercel
  Deployment Protection returns 401. Call the function in-process instead.
- ❌ `vercel.json` `functions` block must reference `app/api/.../route.js` paths, not
  deleted `api/*.js` files (deploy fails otherwise).
- ❌ Overpass 406s from some IPs — always keep the seed fallback so the pipeline still
  produces output.

---

## 11. File Map

```
lead-pipeline/
├── app/
│   ├── layout.js                     Root layout
│   ├── dashboard/page.js            Basic lead monitor (legacy)
│   ├── admin/dashboard/page.js      ★ Master Control Center (4 views, polling)
│   └── api/
│       ├── manual/route.js          Manual region trigger
│       ├── worker/route.js          Single-region pipeline (HTTP)
│       ├── cron/batch-process/route.js  ★ Cron entry (all regions, in-process)
│       ├── email/send/route.js      Send one email
│       ├── queue/email/route.js     QStash email consumer
│       ├── queue/worker/route.js    QStash region consumer
│       ├── unsubscribe/route.js     Opt-out
│       └── admin/metrics/route.js   ★ Metrics API for dashboard
├── lib/
│   ├── config.js        Constants, SOURCES, regex, generic-inbox set
│   ├── scraper.js       ★ OSM Overpass discovery + seed fallback
│   ├── sheets.js        ★ Google Sheets read/append/dedup
│   ├── email.js         ★ Resend send + template rendering
│   ├── leads.js         normalizeLeads (email regex + generic filter)
│   ├── pipeline.js      ★ dispatchRegions + runRegionPipeline (in-process)
│   ├── queue.js         QStash enqueue (optional)
│   ├── suppress.js      opt-out store (optional)
│   ├── authApp.js       isAuthorized (Bearer check)
│   └── dashboard.js     getLeadStats (sheet read)
├── .github/workflows/backup.yml   ★ Auto-backup main→backup
├── vercel.json         Cron schedule + function config
├── .env.example        All env vars documented
└── DEVELOPMENT.md      This file
```

★ = core to the automation.

---

## 12. Current Live State (as of build)

- Repo: `github.com/mohitddh22-rgb/lead-pipeline`
- Vercel: `lead-pipeline-gilt.vercel.app`
- Live `CRON_SECRET`: `Mohit810986@`
- Cron: daily 09:00 UTC → runs us/eu/au, writes Sheet, sends Resend emails.
- Dashboard: `/admin/dashboard?key=Mohit810986@`
- Backup branch auto-syncs on every `main` push (verified).
```
