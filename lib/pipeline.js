import { SOURCES, SHEET_NAME, BATCH_SIZE } from "./config.js";
import { getExistingKeys, appendLeads } from "./sheets.js";
import { scrapeLeads } from "./scraper.js";
import { normalizeLeads } from "./leads.js";
import { isSuppressed } from "./suppress.js";
import { enqueue, queueEnabled } from "./queue.js";
import { authHeader } from "./auth.js";

function baseUrl() {
  return (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
    process.env.PUBLIC_BASE_URL || "http://localhost:3000";
}

// Scrape -> filter/dedupe -> drop suppressed -> store -> queue/send emails.
export async function runRegionPipeline(region, limit = BATCH_SIZE) {
  const sources = SOURCES[region] || [];
  const raw = await scrapeLeads(region, sources);
  const existing = await getExistingKeys(SHEET_NAME);
  let leads = normalizeLeads(raw, region, existing).slice(0, limit);

  const clean = [];
  for (const l of leads) {
    if (!(await isSuppressed(l.email))) clean.push(l);
  }
  leads = clean;

  const { added } = await appendLeads(leads, SHEET_NAME);

  const useQueue = queueEnabled();
  const base = baseUrl();
  const emailResults = await Promise.all(leads.map(async (lead) => {
    if (useQueue) {
      const r = await enqueue(`${base}/api/queue-email`, { lead });
      return !!r?.messageId;
    }
    const r = await fetch(`${base}/api/email/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ lead }),
    });
    return r.ok;
  }));

  return { ok: true, region, scraped: raw.length, added, emailsQueued: emailResults.filter(Boolean).length };
}

// Dispatcher: per region, either enqueue a QStash job (scale) or call worker directly.
export async function dispatchRegions() {
  const useQueue = queueEnabled();
  const base = baseUrl();
  const results = await Promise.all(["us", "eu", "au"].map(async (region) => {
    if (useQueue) {
      const r = await enqueue(`${base}/api/queue-worker`, { region, limit: BATCH_SIZE });
      return { region, queued: !!r?.messageId };
    }
    const r = await fetch(`${base}/api/worker`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ region, limit: BATCH_SIZE }),
    });
    return { region, status: r.status, body: await r.json().catch(() => ({})) };
  }));
  return results;
}
