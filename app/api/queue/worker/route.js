import { NextResponse } from "next/server";
import { verifyQstash } from "../../../../lib/queue.js";
import { runRegionPipeline } from "../../../../lib/pipeline.js";

export const runtime = "nodejs";

export async function POST(req) {
  const raw = await req.text();
  if (process.env.QSTASH_TOKEN) {
    let ok = false;
    try { ok = await verifyQstash(req, raw); } catch (e) { ok = false; }
    if (!ok) return NextResponse.json({ ok: false, error: "bad signature" }, { status: 401 });
  }
  try {
    const { region, limit } = JSON.parse(raw || "{}");
    return NextResponse.json(await runRegionPipeline(region, limit));
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
