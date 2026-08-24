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

const DISCOVERY_LIMIT = Number(process.env.DISCOVERY_LIMIT || 5);

const REGION_QUERIES = {
  us: "real estate agency OR realty company in United States",
  eu: "real estate agency OR property company in Europe",
  au: "real estate agency OR property company in Australia",
};

// Discovery: load Bing HTML results via Browserless, extract top organic result domains.
export async function discoverCompanies(region) {
  const q = encodeURIComponent(REGION_QUERIES[region] || REGION_QUERIES.us);
  const url = `https://www.bing.com/search?q=${q}`;
  const rows = await browserlessScrape(url, [
    { name: "link", selector: "li.b_algo h2 a", type: "text" }
  ]);
  const domains = [];
  for (const r of rows) {
    const href = hrefOf(r.link || "");
    const m = /https?:\/\/([^/]+)/i.exec(href);
    if (m) {
      const d = m[1].replace(/^www\./, "").toLowerCase();
      if (d && !domains.includes(d) && !d.includes("bing.com") && !d.includes("microsoft")) domains.push(d);
    }
    if (domains.length >= DISCOVERY_LIMIT) break;
  }
  return domains;
}

// Scrape a single company site for a business email + name via Browserless.
export async function scrapeSiteForEmail(domain, region) {
  const url = `https://${domain}`;
  const rows = await browserlessScrape(url, [
    { name: "email", selector: "a[href^='mailto:']", type: "text" },
    { name: "title", selector: "title", type: "text" },
  ]);
  if (!rows.length) return null;
  const emails = new Set();
  let company = domain;
  for (const r of rows) {
    if (r.title) company = strip(r.title).split(/[|\-–—·]/)[0].trim() || company;
    const em = mailtoOf(r.email || "");
    if (em && em.includes("@")) emails.add(em.toLowerCase());
  }
  const email = [...emails][0];
  if (!email) return null;
  return { company, website: `https://${domain}`, location: region.toUpperCase(), email, region };
}

export async function scrapeLeads(region, sources) {
  if (!sources || sources.length === 0) {
    if (!process.env.BROWSERLESS_API_KEY) return mockScrape(region);
    let domains = [];
    try { domains = await discoverCompanies(region); }
    catch (e) { console.error("[scraper] discovery failed:", e.message); return []; }
    const out = [];
    for (const d of domains.slice(0, DISCOVERY_LIMIT)) {
      try {
        const lead = await scrapeSiteForEmail(d, region);
        if (lead) out.push(lead);
      } catch (e) { console.error(`[scraper] site failed ${d}:`, e.message); }
    }
    return out;
  }
  const out = [];
  for (const url of sources) {
    try { out.push(...await scrapeSource(url)); }
    catch (e) { console.error(`[scraper] failed ${url}:`, e.message); }
  }
  return out;
}
