import { NextResponse } from "next/server";
import { isAuthorized } from "../../../lib/authApp.js";
import { runRegionPipeline } from "../../../lib/pipeline.js";

export const runtime = "nodejs";

export async function POST(req) {
  if (!isAuthorized(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { region, limit = 50 } = await req.json().catch(() => ({}));
  if (!region) return NextResponse.json({ ok: false, error: "region required" }, { status: 400 });
  try {
    return NextResponse.json(await runRegionPipeline(region, limit));
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
