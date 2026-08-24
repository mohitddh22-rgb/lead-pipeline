import { assertAuthorized, authHeader } from "../../lib/auth.js";
import { REGIONS, SOURCES, BATCH_SIZE } from "../../lib/config.js";
import { ensureHeader } from "../../lib/sheets.js";
import { scrapeLeads } from "../../lib/scraper.js";
import { normalizeLeads } from "../../lib/leads.js";

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET")
    return res.status(405).json({ ok: false, error: "method not allowed" });
  if (!assertAuthorized(req, res)) return;

  try {
    await ensureHeader();
    const base =
      (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
      process.env.PUBLIC_BASE_URL || "http://localhost:3000";

    const results = await Promise.all(REGIONS.map(async region => {
      const r = await fetch(`${base}/api/worker`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ region, limit: BATCH_SIZE })
      });
      return { region, status: r.status, body: await r.json().catch(() => ({})) };
    }));
    return res.status(200).json({ ok: true, results });
  } catch (e) {
    console.error("[cron] batch failed:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
