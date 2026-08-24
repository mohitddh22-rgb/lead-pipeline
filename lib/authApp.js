// App Router (Next.js) auth: operates on a Fetch Request, not Node req/res.
export function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("[auth] CRON_SECRET not set — endpoint open. Set it in prod.");
    return true;
  }
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${secret}`;
}
