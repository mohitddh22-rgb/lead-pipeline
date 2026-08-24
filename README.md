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
