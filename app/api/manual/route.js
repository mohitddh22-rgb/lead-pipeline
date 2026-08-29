import { NextResponse } from "next/server";
import { isAuthorized } from "../../../lib/authApp.js";
import { runRegionPipeline } from "../../../lib/pipeline.js";
import { runLedger } from "../../../lib/runLedger.js";
import { REGIONS } from "../../../lib/config.js";

export const runtime = "nodejs";

export async function GET(req) { return POST(req); }

export async function POST(req) {
  if (!isAuthorized(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const region = searchParams.get("region");
  const regions = region && REGIONS.includes(region) ? [region] : REGIONS;

  // Prevent overlapping runs.
  if (runLedger.inProgress) {
    return NextResponse.json({ ok: false, error: "run-in-progress", inProgress: true }, { status: 409 });
  }

  runLedger.inProgress = true;
  const startedAt = Date.now();
  try {
    const results = [];
    for (const r of regions) {
      const res = await runRegionPipeline(r);
      results.push(res);
    }
    const agg = results.reduce(
      (a, r) => ({
        scraped: a.scraped + (r.scraped || 0),
        added: a.added + (r.added || 0),
        skipped: a.skipped + (r.skipped || 0),
        emailsQueued: a.emailsQueued + (r.emailsQueued || 0),
      }),
      { scraped: 0, added: 0, skipped: 0, emailsQueued: 0 }
    );
    runLedger.last = {
      at: new Date(startedAt).toISOString(),
      region: region || "all",
      ...agg,
      ms: Date.now() - startedAt,
    };
    runLedger.inProgress = false;
    return NextResponse.json({ ok: true, region: region || "all", ...agg, run_id: runLedger.last.run_id || Date.now().toString(36).slice(6) });
  } catch (e) {
    runLedger.inProgress = false;
    runLedger.last = { at: new Date(startedAt).toISOString(), error: e.message };
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
