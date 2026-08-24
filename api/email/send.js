import { assertAuthorized } from "../../lib/auth.js";
import { sendColdEmail } from "../../lib/email.js";
import { markEmailed } from "../../lib/sheets.js";
import { SHEET_NAME } from "../../lib/config.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  if (!assertAuthorized(req, res)) return;

  const { lead } = req.body || {};
  if (!lead || !lead.email)
    return res.status(400).json({ ok: false, error: "lead.email required" });

  try {
    const sent = await sendColdEmail(lead);
    await markEmailed(lead.email, SHEET_NAME);
    return res.status(200).json({ ok: true, id: sent?.id });
  } catch (e) {
    console.error("[email] send failed:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
