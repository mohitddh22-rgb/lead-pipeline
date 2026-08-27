import { SOURCES, SHEET_NAME, BATCH_SIZE } from "./config.js";
import { getExistingKeys, appendLeads } from "./sheets.js";
import { scrapeLeads } from "./scraper.js";
import { normalizeLeads } from "./leads.js";
import { isSuppressed } from "./suppress.js";
import { enqueue, queueEnabled } from "./queue.js";
import { authHeader } from "./auth.js";

function baseUrl() {
  // VERCEL_URL is auto-set by Vercel at runtime (no protocol). Fall back to the
  // configured PUBLIC_BASE_URL, then localhost for local dev.
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (process.env.PUBLIC_BASE_URL && process.env.PUBLIC_BASE_URL.startsWith("http")) return process.env.PUBLIC_BASE_URL;
  return "http://localhost:3000";
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
  console.log(`[pipeline] email send: useQueue=${useQueue} base=${base} leads=${leads.length}`);
  const emailResults = await Promise.all(leads.map(async (lead) => {
    try {
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
    } catch (e) {
      console.error(`[pipeline] email failed for ${lead.email}:`, e.message);
      return false;
    }
  }));

  return { ok: true, region, scraped: raw.length, added, emailsQueued: emailResults.filter(Boolean).length };
}

// Dispatcher: per region, either enqueue a QStash job (scale) or call worker directly.
// Regions are processed SEQUENTIALLY (not via Promise.all) so the 3 regional
// Browserless discovery/site-scrape passes stay under the rate limit and avoid 429s.
export async function dispatchRegions() {
  const useQueue = queueEnabled();
  const base = baseUrl();
  const results = [];
  const regions = ["us", "eu", "au"];
  for (let i = 0; i < regions.length; i++) {
    const region = regions[i];
    if (useQueue) {
      const r = await enqueue(`${base}/api/queue-worker`, { region, limit: BATCH_SIZE });
      results.push({ region, queued: !!r?.messageId });
    } else {
      const r = await fetch(`${base}/api/worker`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ region, limit: BATCH_SIZE }),
      });
      results.push({ region, status: r.status, body: await r.json().catch(() => ({})) });
    }
    // Small gap between regions to stay under Browserless rate limits.
    if (i < regions.length - 1) await new Promise(res => setTimeout(res, 800));
  }
  return results;
}
