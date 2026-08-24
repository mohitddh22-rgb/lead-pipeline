import { assertAuthorized } from "../../lib/auth.js";
import { ensureHeader } from "../../lib/sheets.js";
import { dispatchRegions } from "../../lib/pipeline.js";

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET")
    return res.status(405).json({ ok: false, error: "method not allowed" });
  if (!assertAuthorized(req, res)) return;

  try {
    await ensureHeader();
    const results = await dispatchRegions();
    return res.status(200).json({ ok: true, results });
  } catch (e) {
    console.error("[cron] batch failed:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
