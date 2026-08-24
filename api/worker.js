import { assertAuthorized, authHeader } from "../../lib/auth.js";
import { SOURCES, SHEET_NAME } from "../../lib/config.js";
import { getExistingKeys, appendLeads } from "../../lib/sheets.js";
import { scrapeLeads } from "../../lib/scraper.js";
import { normalizeLeads } from "../../lib/leads.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  if (!assertAuthorized(req, res)) return;

  const { region, limit = 50 } = req.body || {};
  if (!region) return res.status(400).json({ ok: false, error: "region required" });

  try {
    const sources = SOURCES[region] || [];
    const raw = await scrapeLeads(region, sources);
    const existing = await getExistingKeys(SHEET_NAME);
    const leads = normalizeLeads(raw, region, existing).slice(0, limit);
    const { added } = await appendLeads(leads, SHEET_NAME);

    const base =
      (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
      process.env.PUBLIC_BASE_URL || "http://localhost:3000";
    const emailResults = await Promise.all(leads.map(async lead => {
      const r = await fetch(`${base}/api/email/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ lead })
      });
      return r.ok;
    }));

    return res.status(200).json({
      ok: true, region, scraped: raw.length, added,
      emailsQueued: emailResults.filter(Boolean).length
    });
  } catch (e) {
    console.error(`[worker:${region}] failed:`, e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
