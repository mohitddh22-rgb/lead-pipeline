// Shared run ledger so the dashboard can show pipeline run progress + last result.
// In-memory: persists for the lifetime of a warm Vercel instance. (Cold starts
// reset it, which is fine — the dashboard falls back to "No run yet".)
export const runLedger = {
  inProgress: false,
  last: null, // { at, region, scraped, added, skipped, emailsQueued, ms }
};
