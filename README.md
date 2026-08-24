# Lead Pipeline (Vercel Serverless)

Automated real-estate lead generation + cold outreach:

1. Cron (0 9 * * *) hits /api/cron/batch-process.
2. The cron route fans out one /api/worker per region (us/eu/au) so no single
   function does all the scraping — keeps work inside the 60s serverless timeout.
3. Each worker scrapes via Browserless (external Chrome -> just an HTTP call),
   filters/normalises/dedupes the leads, then appends them to Google Sheets.
4. The worker fans out one /api/email/send per new lead; each send fires a
   Resend cold email and stamps the sheet (Status=Contacted, Last Emailed=today).

## Setup
1. npm install (installs googleapis + resend).
2. cp .env.example .env.local and fill in every value.
   - Google Sheets: create a service account, share the sheet with its client_email,
     put the JSON in GOOGLE_SHEETS_CREDENTIALS.
   - Resend: verify your sending domain, set RESEND_API_KEY + FROM_EMAIL.
   - Browserless: get a token, set BROWSERLESS_API_KEY and SOURCES_*.
3. npm run smoke — exercises mock scrape + filtering with no external deps.
4. vercel dev then POST /api/manual (with Authorization: Bearer <CRON_SECRET>).
5. vercel deploy --prod.

## Avoiding timeouts
- The dispatcher never scrapes itself; it delegates per region to /api/worker.
- Each worker caps output at BATCH_SIZE (default 50); a single scrape call is
  hard-capped at 25s via AbortSignal.timeout.
- For very large jobs, replace the in-memory fan-out with a queue
  (Upstash QStash / Vercel KV) and have each worker page through sources.

## Compliance (US / EU / Australia)
CAN-SPAM (US): real sender, honest subject, physical address, working unsubscribe.
GDPR (EU): lawful basis for B2B contact, honour opt-outs within 30 days.
Australian Spam Act: consent required, sender ID, functional unsubscribe.
Only email business addresses from public sources; honour unsubscribes immediately.
This scaffold is infrastructure, not legal advice.

## New: Next.js App Router version, QStash queue mode, and unsubscribe

### 1) Next.js App Router
`app/api/**/route.js` mirrors the `api/` Vercel Functions. They expose the SAME
URLs (`/api/worker`, `/api/email/send`, `/api/cron/batch-process`, etc.).
- To run as **standalone Vercel Functions**: deploy as-is (root `api/` is used; `app/` is ignored).
- To run as a **Next.js app**: add `next`, `react`, `react-dom` to dependencies and
  **delete the root `api/` directory** to avoid duplicate-route errors. The shared
  logic in `lib/` is used by both.

### 2) Upstash QStash queue mode (scale to thousands of leads)
When `QSTASH_TOKEN` (+ signing keys) is set:
- The cron dispatcher enqueues ONE job per region to `/api/queue-worker` instead of
  calling `/api/worker` directly.
- Each region worker enqueues ONE job per lead to `/api/queue-email`.
- The `queue-*` endpoints verify the QStash signature (`upstash-signature`) before
  doing work, so the URLs are safe to expose.
- Set `Upstash-Delay` (in lib/queue.js `enqueue`) to pace sends (e.g. spread 1000
  emails over the day to respect provider limits).

### 3) Unsubscribe + suppression
- `/api/unsubscribe?email=foo@bar.com` (GET) records the opt-out in Upstash Redis
  (`lead:skews:suppressions`) and renders a confirmation page. The same URL is in the
  email footer and the `List-Unsubscribe` header.
- Before enqueueing/sending, the pipeline checks `isSuppressed(email)` and skips it.
- Without `UPSTASH_REDIS_REST_URL`/`TOKEN`, suppression is disabled (a warning is logged).

## Dynamic email templates
Outbound cold email is fully configurable without code changes:
- `FROM_EMAIL` — sender (defaults to `sales@scapiab2b.com`).
- `EMAIL_SUBJECT` — subject template; supports `{{company}} {{location}} {{email}} {{region}} {{website}}`.
- `EMAIL_BODY_TEMPLATE` — HTML body template with the same placeholders.
When `EMAIL_SUBJECT` / `EMAIL_BODY_TEMPLATE` are not set, the pipeline falls back
to auto-generated lead messaging. Run `npm test` to exercise the template logic.
