import { assertAuthorized } from "../lib/auth.js";
import { runRegionPipeline } from "../lib/pipeline.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  if (!assertAuthorized(req, res)) return;

  const { region, limit = 50 } = req.body || {};
  if (!region) return res.status(400).json({ ok: false, error: "region required" });

  try {
    const result = await runRegionPipeline(region, limit);
    return res.status(200).json(result);
  } catch (e) {
    console.error(`[worker:${region}] failed:`, e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
