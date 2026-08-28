import dns from "node:dns/promises";
import { GENERIC_LOCAL, EMAIL_RE } from "./config.js";

// In-memory cache for the lifetime of a serverless invocation (per region run).
const cache = new Map();

/**
 * Zero-cost pre-send deliverability check to cut bounce rate.
 *  - rejects invalid / generic-inbox addresses (info@, sales@, ...)
 *  - rejects domains with NO mail server (no MX records) -> these 100% bounce
 *  - rejects Free/webmail personal domains (gmail, yahoo, hotmail, ...) which
 *    are not business inboxes and hurt sender reputation
 * Returns { ok: boolean, reason: string }.
 */
export async function checkDeliverable(email) {
  const e = (email || "").toLowerCase().trim();
  if (!EMAIL_RE.test(e)) return { ok: false, reason: "invalid" };
  const [local, domain] = e.split("@");
  if (!domain) return { ok: false, reason: "no-domain" };
  if (GENERIC_LOCAL.has(local)) return { ok: false, reason: "generic-inbox" };

  const FREE = new Set([
    "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "hotmail.com",
    "outlook.com", "live.com", "msn.com", "aol.com", "icloud.com", "me.com",
    "protonmail.com", "proton.me", "gmx.com", "zoho.com", "mail.com",
    "yandex.com", "qq.com", "163.com", "126.com",
  ]);
  if (FREE.has(domain)) return { ok: false, reason: "personal-webmail" };

  if (cache.has(domain)) return cache.get(domain);

  let result;
  try {
    const records = await dns.resolveMx(domain);
    if (!records || records.length === 0) {
      // No MX — try A record as a last resort (some tiny domains accept mail on A).
      try {
        const a = await dns.resolve4(domain);
        result = a && a.length ? { ok: true, reason: "a-record-fallback" } : { ok: false, reason: "no-mail-server" };
      } catch {
        result = { ok: false, reason: "no-mail-server" };
      }
    } else {
      result = { ok: true, reason: "mx-ok" };
    }
  } catch (err) {
    // DNS failure (NXDOMAIN, timeout, SERVFAIL) -> treat as undeliverable.
    result = { ok: false, reason: "dns-error" };
  }
  cache.set(domain, result);
  return result;
}
