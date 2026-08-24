import { verifyQstash } from "../lib/queue.js";
import { sendColdEmail } from "../lib/email.js";
import { markEmailed } from "../lib/sheets.js";
import { SHEET_NAME } from "../lib/config.js";

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
    const { lead } = JSON.parse(raw || "{}");
    if (!lead || !lead.email)
      return res.status(400).json({ ok: false, error: "lead.email required" });
    const sent = await sendColdEmail(lead);
    await markEmailed(lead.email, SHEET_NAME);
    return res.status(200).json({ ok: true, id: sent?.id });
  } catch (e) {
    console.error("[queue-email] failed:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
