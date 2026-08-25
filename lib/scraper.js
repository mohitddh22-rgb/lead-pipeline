const BROWSERLESS_URL = "https://chrome.browserless.io/scrape";
import { discoverRealEstateAgencies } from './apollo.js';

// Extract a value from a single Browserless result object using the local `pick` spec.
// Browserless /scrape returns results shaped like { text, html, attributes: [{name, value}] }.
function extractValue(res, pick) {
  if (!res) return "";
  if (pick === "href") {
    const a = (res.attributes || []).find(x => x.name === "href");
    return a ? a.value : "";
  }
  if (pick === "html") return res.html || "";
  return res.text || "";
}

// Turn the grouped-by-selector Browserless response into flat rows keyed by our local `name`.
// Response: { data: [ { selector, results: [ { text, html, attributes } ] } ] }
// We zip each selector's results array into rows; shorter arrays leave their slot empty.
function reshape(data, selectors) {
  const items = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : []);
  if (!items.length) return [];

  // Grouped-by-selector shape (current Browserless /scrape).
  if (items[0] && Array.isArray(items[0].results)) {
    const bySelector = {};
    let max = 0;
    for (const it of items) {
      const arr = it.results || [];
      bySelector[it.selector] = arr;
      if (arr.length > max) max = arr.length;
    }
    const rows = [];
    for (let i = 0; i < max; i++) {
      const row = {};
      for (const spec of selectors) {
        const arr = bySelector[spec.selector] || [];
        row[spec.name] = extractValue(arr[i], spec.pick);
      }
      rows.push(row);
    }
    return rows;
  }

  // Fallback: already flat rows keyed by name.
  return items;
}

const backoffMs = attempt => Math.min(1500 * Math.pow(2, attempt), 20000) + Math.floor(Math.random() * 400);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Scrape a URL via Browserless /scrape. `selectors` is a LOCAL spec:
//   [{ name, selector, pick: "text" | "href" | "html" }]
// Only `selector` is sent to the API (Browserless rejects name/type/function fields).
// Retries on HTTP 429 / 408 / 5xx and on network/timeout errors with exponential backoff + jitter.
async function browserlessScrape(url, selectors) {
  const token = process.env.BROWSERLESS_API_KEY;
  if (!token) throw new Error("BROWSERLESS_API_KEY not set");
  const elements = selectors.map(s => ({ selector: s.selector }));

  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    let resp;
    try {
      resp = await fetch(`${BROWSERLESS_URL}?token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
        url,
        elements,
        // Stop waiting at DOMContentLoaded (not networkidle) and give slow,
        // ad-heavy agency sites up to 60s. The default networkidle wait never
        // settles for these sites and Browserless returns 408 Request Timeout.
        gotoOptions: { waitUntil: "domcontentloaded", timeout: 60000 },
      }),
        signal: AbortSignal.timeout(65000),
      });
    } catch (e) {
      lastErr = e;
      console.warn(`[scraper] Browserless request error (${e.message}); retry ${attempt + 1}/4`);
      if (attempt < 3) { await sleep(backoffMs(attempt)); continue; }
      throw e;
    }

    if (resp.status === 429 || resp.status === 408 || resp.status >= 500) {
      lastErr = new Error(`Browserless ${resp.status}`);
      console.warn(`[scraper] Browserless ${resp.status}; retry ${attempt + 1}/4`);
      if (attempt < 3) { await sleep(backoffMs(attempt)); continue; }
      throw lastErr;
    }

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(`Browserless ${resp.status}: ${body}`);
    }

    const data = await resp.json().catch(() => ({}));
    return reshape(data, selectors);
  }
  throw lastErr || new Error("Browserless scrape failed after retries");
}

async function scrapeSource(url) {
  const selectors = [
    { name: "company",  selector: ".listing .company, .agency-name", pick: "text" },
    { name: "website",  selector: ".listing a.website, .listing a[href^='http']", pick: "href" },
    { name: "location", selector: ".listing .location, .listing .city", pick: "text" },
    { name: "email",    selector: ".listing a[href^='mailto:']", pick: "href" },
  ];
  const rows = await browserlessScrape(url, selectors);
  return rows.map(r => ({
    company: strip(r.company),
    website: hrefOf(r.website),
    location: strip(r.location),
    email: mailtoOf(r.email),
  }));
}

// NOTE: regexes below avoid \s/\. shortcuts; they use literal character classes so the
// source is immune to accidental double-backslash escaping in tooling.
const strip = s => (s || "").replace(/[ \t\r\n]+/g, " ").trim();
const hrefOf = s => { if (!s) return ""; const m = /https?:\/\/[^ "'<]+/.exec(s); return m ? m[0] : s.trim(); };
const mailtoOf = s => { if (!s) return ""; const m = /mailto:([^ "'<]+)/i.exec(s); return m ? m[1] : s.trim(); };
// Pull a bare domain out of a search-result display string like "https://www.realtor.com"
// or "https://www.x.com › path › more" (Bing/DuckDuckGo sometimes append breadcrumbs).
// Requires a dot+TLD so TLD-less junk (e.g. "theagencyre") is dropped.
const domainOf = s => {
  if (!s) return "";
  const chunk = String(s).split("›")[0].trim();
  const m = /https?:\/\/([^/ ]+)/i.exec(chunk) || /([a-z0-9-]+[.][a-z]{2,})/i.exec(chunk);
  const d = m ? m[1].replace(/^www[.]/, "").toLowerCase() : "";
  return d.includes(".") ? d : "";
};

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

const DISCOVERY_LIMIT = Number(process.env.DISCOVERY_LIMIT || 3);

const REGION_QUERIES = {
  us: "real estate agency OR realty company in United States",
  eu: "real estate agency OR property company in Europe",
  au: "real estate agency OR property company in Australia",
};

// Discovery: load search results via Browserless and extract the top organic result
// domains. We use DuckDuckGo's HTML endpoint: it renders correctly in headless Chrome
// and returns direct domains, whereas Bing serves a consent/captcha fallback to headless
// browsers that ignores the query and returns irrelevant "real"-keyword results.
// The clean display domain lives in the `.result__url` element text.
export async function discoverCompanies(region) {
  const q = REGION_QUERIES[region] || REGION_QUERIES.us;
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
  const rows = await browserlessScrape(url, [
    { name: "cite", selector: ".result__url", pick: "text" }
  ]);
  const domains = [];
  for (const r of rows) {
    const d = domainOf(r.cite || "");
    if (d && !domains.includes(d) && !d.includes("duckduckgo.com") && !d.includes("bing.com") && !d.includes("microsoft")) domains.push(d);
    if (domains.length >= DISCOVERY_LIMIT) break;
  }
  return domains;
}

// Scrape a single company site for a business email + name via Browserless.
export async function scrapeSiteForEmail(domain, region) {
  const url = `https://${domain}`;
  const rows = await browserlessScrape(url, [
    { name: "email", selector: "a[href^='mailto:']", pick: "href" },
    { name: "title", selector: "title", pick: "text" },
  ]);
  if (!rows.length) return null;
  const emails = new Set();
  let company = domain;
  for (const r of rows) {
    if (r.title) company = strip(r.title).split(/[|–—·]/)[0].trim() || company;
    const em = mailtoOf(r.email || "");
    if (em && em.includes("@")) emails.add(em.toLowerCase());
  }
  const email = [...emails][0];
  if (!email) return null;
  return { company, website: `https://${domain}`, location: region.toUpperCase(), email, region };
}

export async function scrapeLeads(region, sources) {
  // If Apollo key is set, use Apollo as primary discovery (free search, credit-gated enrich)
  if (process.env.APOLLO_API_KEY) {
    try {
      const leads = await discoverRealEstateAgencies(region, {
        maxOrgs: 50,
        maxEnrich: 20, // limits credit usage
      });
      if (leads.length) return leads;
    } catch (e) {
      console.warn('[scraper] Apollo discovery failed, falling back:', e.message);
    }
  }

  // Fallback: explicit sources provided
  if (sources && sources.length > 0) {
    const out = [];
    for (const url of sources) {
      try { out.push(...await scrapeSource(url)); }
      catch (e) { console.error(`[scraper] failed ${url}:`, e.message); }
    }
    return out;
  }

  // Fallback: Browserless discovery (requires BROWSERLESS_API_KEY)
  if (process.env.BROWSERLESS_API_KEY) {
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

  // Final fallback: mock data
  return mockScrape(region);
}
