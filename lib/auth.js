// Verifies a request is from Vercel Cron or an authorized caller.
// Vercel Cron sends:  Authorization: Bearer ***
export function assertAuthorized(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("[auth] CRON_SECRET not set — endpoint open. Set it in prod.");
    return true;
  }
  const auth = req.headers["authorization"] || "";
  if (auth !== `Bearer ${secret}`) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return false;
  }
  return true;
}

export function authHeader() {
  const secret = process.env.CRON_SECRET;
  return secret ? { Authorization: `Bearer ${secret}` } : {};
}
