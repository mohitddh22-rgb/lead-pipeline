import { NextResponse } from "next/server";
import { verifyQstash } from "../../../../lib/queue.js";
import { sendColdEmail } from "../../../../lib/email.js";
import { markEmailed } from "../../../../lib/sheets.js";
import { SHEET_NAME } from "../../../../lib/config.js";

export const runtime = "nodejs";

export async function POST(req) {
  const raw = await req.text();
  if (process.env.QSTASH_TOKEN) {
    let ok = false;
    try { ok = await verifyQstash(req, raw); } catch (e) { ok = false; }
    if (!ok) return NextResponse.json({ ok: false, error: "bad signature" }, { status: 401 });
  }
  try {
    const { lead } = JSON.parse(raw || "{}");
    if (!lead || !lead.email) return NextResponse.json({ ok: false, error: "lead.email required" }, { status: 400 });
    const sent = await sendColdEmail(lead);
    await markEmailed(lead.email, SHEET_NAME);
    return NextResponse.json({ ok: true, id: sent?.id });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
