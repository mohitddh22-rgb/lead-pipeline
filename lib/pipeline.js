import { SOURCES, SHEET_NAME, BATCH_SIZE } from "./config.js";
import { getExistingKeys, appendLeads } from "./sheets.js";
import { scrapeLeads } from "./scraper.js";
import { normalizeLeads } from "./leads.js";
import { isSuppressed } from "./suppress.js";
import { checkDeliverable } from "./verify.js";
import { enqueue, queueEnabled } from "./queue.js";
import { sendColdEmail } from "./email.js";

function baseUrl() {
  // VERCEL_URL is auto-set by Vercel at runtime (no protocol). Fall back to the
  // configured PUBLIC_BASE_URL, then localhost for local dev.
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (process.env.PUBLIC_BASE_URL && process.env.PUBLIC_BASE_URL.startsWith("http")) return process.env.PUBLIC_BASE_URL;
  return "http://localhost:3000";
}

// Scrape -> filter/dedupe -> drop suppressed -> store -> send emails (in-process).
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

  // Pre-send deliverability gate: skip generic inboxes + domains with no mail
  // server (MX). This is what cuts the bounce rate from ~59% toward near-zero.
  let skipped = 0;
  const emailable = [];
  for (const lead of leads) {
    const v = await checkDeliverable(lead.email);
    if (v.ok) emailable.push(lead);
    else { skipped++; console.log(`[pipeline] skip undeliverable ${lead.email}: ${v.reason}`); }
  }
  leads = emailable;

  // Send emails directly (in-process) — no HTTP hop, so Vercel Deployment
  // Protection never blocks the call. Resend key + FROM_EMAIL come from env.
  const useQueue = queueEnabled();
  const emailResults = await Promise.all(leads.map(async (lead) => {
    try {
      if (useQueue) {
        // QStash fan-out: enqueue a job that calls /api/queue-email.
        const r = await enqueue(`${baseUrl()}/api/queue-email`, { lead });
        return !!r?.messageId;
      }
      await sendColdEmail(lead);
      return true;
    } catch (e) {
      console.error(`[pipeline] email failed for ${lead.email}:`, e.message);
      return false;
    }
  }));

  return { ok: true, region, scraped: raw.length, added, skipped, emailsQueued: emailResults.filter(Boolean).length };
}

// Dispatcher: process each region sequentially (stay under rate limits) by
// calling the pipeline IN-PROCESS — no HTTP hop, so Vercel Deployment Protection
// (Vercel Auth) never blocks the internal call.
export async function dispatchRegions() {
  const regions = ["us", "eu", "au"];
  const results = [];
  for (let i = 0; i < regions.length; i++) {
    const region = regions[i];
    try {
      const r = await runRegionPipeline(region, BATCH_SIZE);
      results.push({ region, status: 200, ...r });
    } catch (e) {
      results.push({ region, status: 500, error: e.message });
    }
    if (i < regions.length - 1) await new Promise((res) => setTimeout(res, 800));
  }
  return results;
}
