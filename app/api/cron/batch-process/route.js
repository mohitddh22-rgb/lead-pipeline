import { NextResponse } from "next/server";
import { isAuthorized } from "../../../../lib/authApp.js";
import { ensureHeader } from "../../../../lib/sheets.js";
import { dispatchRegions } from "../../../../lib/pipeline.js";

export const runtime = "nodejs";

export async function GET(req) { return POST(req); }
export async function POST(req) {
  if (!isAuthorized(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    await ensureHeader();
    return NextResponse.json({ ok: true, results: await dispatchRegions("cron") });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
