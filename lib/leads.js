import { EMAIL_RE, GENERIC_LOCAL } from "./config.js";

export function normalizeLeads(raw, region, existingKeys) {
  const seen = new Set();
  const out = [];
  for (const r of raw) {
    const email = (r.email || "").toLowerCase().trim();
    const website = (r.website || "").toLowerCase().trim();
    if (!EMAIL_RE.test(email)) continue;
    if (GENERIC_LOCAL.has(email.split("@")[0])) continue;
    if (!website) continue;

    const wKey = "w:" + website, eKey = "e:" + email;
    if (existingKeys.has(wKey) || existingKeys.has(eKey)) continue;
    if (seen.has(eKey) || seen.has(wKey)) continue;
    seen.add(eKey); seen.add(wKey);
    out.push({ company: r.company || website, website, location: r.location || region.toUpperCase(), email, region });
  }
  return out;
}
