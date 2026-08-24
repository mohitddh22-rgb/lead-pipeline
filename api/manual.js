import { assertAuthorized, authHeader } from "../../lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET")
    return res.status(405).json({ ok: false });
  if (!assertAuthorized(req, res)) return;

  const base =
    (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
    process.env.PUBLIC_BASE_URL || "http://localhost:3000";
  const r = await fetch(`${base}/api/cron/batch-process`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() }
  });
  return res.status(r.status).json(await r.json().catch(() => ({})));
}
