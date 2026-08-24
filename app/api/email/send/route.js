import { NextResponse } from "next/server";
import { isAuthorized } from "../../../../lib/authApp.js";
import { sendColdEmail } from "../../../../lib/email.js";
import { markEmailed } from "../../../../lib/sheets.js";
import { SHEET_NAME } from "../../../../lib/config.js";

export const runtime = "nodejs";

export async function POST(req) {
  if (!isAuthorized(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { lead } = await req.json().catch(() => ({}));
  if (!lead || !lead.email) return NextResponse.json({ ok: false, error: "lead.email required" }, { status: 400 });
  try {
    const sent = await sendColdEmail(lead);
    await markEmailed(lead.email, SHEET_NAME);
    return NextResponse.json({ ok: true, id: sent?.id });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
