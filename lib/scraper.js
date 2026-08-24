const BROWSERLESS_URL = "https://chrome.browserless.io/scrape";

async function browserlessScrape(url, selectors) {
  const token = process.env.BROWSERLESS_API_KEY;
  const resp = await fetch(`${BROWSERLESS_URL}?token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      elements: selectors.map(s => ({ name: s.name, selector: s.selector, type: "text" }))
    }),
    signal: AbortSignal.timeout(25000)
  });
  if (!resp.ok) throw new Error(`Browserless ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  return data.data || [];
}

async function scrapeSource(url) {
  const selectors = [
    { name: "company",  selector: ".listing .company, .agency-name" },
    { name: "website",  selector: ".listing a.website, .listing a[href^='http']" },
    { name: "location", selector: ".listing .location, .listing .city" },
    { name: "email",    selector: ".listing a[href^='mailto:']" }
  ];
  const rows = await browserlessScrape(url, selectors);
  return rows.map(r => ({
    company: strip(r.company),
    website: hrefOf(r.website),
    location: strip(r.location),
    email: mailtoOf(r.email)
  }));
}

const strip = s => (s || "").replace(/\s+/g, " ").trim();
const hrefOf = s => { if (!s) return ""; const m = /(https?:\/\/[^\s"']+)/.exec(s); return m ? m[1] : s.trim(); };
const mailtoOf = s => { if (!s) return ""; const m = /mailto:([^\s"']+)/i.exec(s); return m ? m[1] : s.trim(); };

function mockScrape(region) {
  const cities = {
    us: ["New York","Austin","Miami"],
    eu: ["Berlin","Amsterdam","Lisbon"],
    au: ["Sydney","Melbourne","Brisbane"]
  }[region] || ["Unknown"];
  return Array.from({ length: 8 }).map((_, i) => ({
    company:  `Mock ${region.toUpperCase()} Realty ${i + 1}`,
    website:  `https://mock${region}${i + 1}.example.com`,
    location: cities[i % cities.length],
    email:    `leasing@mock${region}${i + 1}.example.com`
  }));
}

export async function scrapeLeads(region, sources) {
  if (!sources || sources.length === 0) {
    if (!process.env.BROWSERLESS_API_KEY) return mockScrape(region);
    return [];
  }
  const out = [];
  for (const url of sources) {
    try { out.push(...await scrapeSource(url)); }
    catch (e) { console.error(`[scraper] failed ${url}:`, e.message); }
  }
  return out;
}
