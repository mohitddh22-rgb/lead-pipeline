import { assertAuthorized, authHeader } from "../lib/auth.js";
import { scrapeLeads } from "../lib/scraper.js";
import { ensureHeader, appendLeads, markEmailed, getExistingKeys } from "../lib/sheets.js";
import { sendColdEmail } from "../lib/email.js";

// In-memory dedup set per run (prevents duplicate sends in same execution)
const runSeenDomains = new Set();

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ ok: false });
  }
  if (!assertAuthorized(req, res)) return;

  const base =
    (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
    process.env.PUBLIC_BASE_URL || "http://localhost:3000";

  // Allow optional region filter: ?region=us or region=eu or region=au
  const region = req.query?.region || undefined;

  try {
    // 1. Scrape leads via OSM Overpass (US, EU, AU regions)
    // Default to all regions if none specified
    const regions = region ? [region] : ['us', 'eu', 'au'];
    const allNewLeads = [];

    for (const region of regions) {
      console.log(`[manual] Scraping region: ${region}`);
      const leads = await scrapeLeads(region);

      // Dedup against existing sheet records + in-memory run set
      const existingKeys = await getExistingKeys();

      for (const lead of leads) {
        const domain = lead.domain || '';
        const email = lead.email || '';

        // Skip if we've already seen this domain in this run
        if (runSeenDomains.has(domain)) continue;

        // Skip if already in Sheets (by domain or email)
        const domainKey = 'w:' + domain.toLowerCase();
        const emailKey = 'e:' + email.toLowerCase();
        if (existingKeys.has(domainKey) || existingKeys.has(emailKey)) {
          console.log(`[manual] Dedup: skipping ${lead.company} (already in sheet)`);
          continue;
        }

        // Validate email before adding
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          console.warn(`[manual] Invalid email for ${lead.company}: ${email}`);
          lead.email = '';
        }

        runSeenDomains.add(domain);
        allNewLeads.push(lead);
      }
    }

    // 2. Append new leads to Google Sheet
    let sheetResult = { added: 0 };
    if (allNewLeads.length > 0) {
      sheetResult = await appendLeads(allNewLeads);
      console.log(`[manual] Appended ${sheetResult.added} leads to Google Sheet`);
    }

    // 3. Send cold emails for new leads
    let emailsSent = 0;
    for (const lead of allNewLeads) {
      if (!lead.email) continue; // Skip leads without valid email

      try {
        await sendColdEmail(lead);
        emailsSent++;

        // Mark as emailed in the sheet
        await markEmailed(lead.email);
        console.log(`[manual] Sent email to ${lead.email} (${lead.company})`);

        // Small delay to avoid hitting Resend rate limits
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        console.error(`[manual] Failed to send email to ${lead.email}:`, e.message);
      }
    }

    // 4. Return clean JSON summary
    const summary = {
      ok: true,
      regions_scraped: regions.length,
      leads_found: allNewLeads.length,
      leads_appended_to_sheet: sheetResult.added,
      emails_sent: emailsSent,
      run_id: Date.now().toString(36).slice(6),
      dedup: {
        domains_seen_in_run: runSeenDomains.size,
        skipped_existing: allNewLeads.length - runSeenDomains.size + emailsSent
      }
    };

    return res.status(200).json(summary);

  } catch (e) {
    console.error("[manual] unhandled error:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}