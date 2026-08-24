import { scrapeLeads } from "../lib/scraper.js";
import { normalizeLeads } from "../lib/leads.js";

const existing = new Set(["w:https://mockus1.example.com"]);
let total = 0;
for (const region of ["us","eu","au"]) {
  const raw = await scrapeLeads(region, []);
  const leads = normalizeLeads(raw, region, existing);
  console.log(`\n[${region}] raw=${raw.length} -> valid=${leads.length}`);
  console.log(JSON.stringify(leads.slice(0, 2), null, 2));
  total += leads.length;
}
console.log(`\nSMOKE OK — ${total} valid leads produced across 3 regions`);
