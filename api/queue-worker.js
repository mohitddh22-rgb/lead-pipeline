import { verifyQstash } from "../lib/queue.js";
import { runRegionPipeline } from "../lib/pipeline.js";

export default async function handler(req, res) {
  const raw = await new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });
  if (process.env.QSTASH_TOKEN) {
    let ok = false;
    try { ok = await verifyQstash(req, raw); } catch (e) { ok = false; }
    if (!ok) return res.status(401).json({ ok: false, error: "bad signature" });
  }
  try {
    const { region, limit } = JSON.parse(raw || "{}");
    return res.status(200).json(await runRegionPipeline(region, limit));
  } catch (e) {
    console.error("[queue-worker] failed:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
