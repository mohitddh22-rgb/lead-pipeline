import { NextResponse } from "next/server";
import { isAuthorized } from "../../../lib/authApp.js";
import { authHeader } from "../../../lib/auth.js";

export const runtime = "nodejs";

export async function GET(req) { return POST(req); }
export async function POST(req) {
  if (!isAuthorized(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const base = (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) || process.env.PUBLIC_BASE_URL || "http://localhost:3000";
  try {
    const r = await fetch(`${base}/api/cron/batch-process`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
    });
    const body = await r.json().catch(() => ({}));
    return NextResponse.json({ ok: r.ok, status: r.status, body }, { status: r.status });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 502 });
  }
}
