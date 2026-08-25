import { assertAuthorized, authHeader } from "../lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET")
    return res.status(405).json({ ok: false });
  if (!assertAuthorized(req, res)) return;

  const base =
    (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
    process.env.PUBLIC_BASE_URL || "http://localhost:3000";
  try {
    const r = await fetch(`${base}/api/cron/batch-process`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
    });
    const body = await r.json().catch(() => ({}));
    return res.status(r.status).json({ ok: r.ok, status: r.status, body });
  } catch (e) {
    console.error("[manual] downstream call failed:", e);
    return res.status(502).json({ ok: false, error: e.message });
  }
}
