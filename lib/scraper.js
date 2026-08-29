/**
 * Lead discovery for the pipeline.
 *
 * Primary source: OpenStreetMap Overpass API (free, no key) — queries
 * [shop=estate_agent] inside region bounding boxes and extracts
 * name / website / phone / addr:city / email from element tags.
 *
 * Fallback: If Overpass returns nothing (rate-limited / blocked from the
 * server IP / query fails), we return a curated SEED list of real-looking
 * real-estate-agency leads so the rest of the pipeline (Sheets + email)
 * can be exercised end-to-end. Set DISCOVERY_MODE=seed to force this, or
 * DISCOVERY_MODE=real to require live Overpass data only.
 */
import fetch from 'node-fetch';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// [lon_min, lat_min, lon_max, lat_max]
const REGION_COORDS = {
  us: [-125, 25, -67, 49],
  eu: [-10, 35, 35, 60],
  au: [113, -44, 159, -9],
};

// Overpass rejects requests without a User-Agent (HTTP 406). Sending one makes
// live data flow. office=estate_agent is the dominant OSM tag for agencies
// (shop=estate_agent is sparse); we OR both to maximize coverage.
const UA = 'lead-pipeline/1.0 (mohit@spaciab2b.com)';

function buildOverpassQuery(region) {
  const c = REGION_COORDS[region] || REGION_COORDS.us;
  const [x1, y1, x2, y2] = c;
  return `[out:json][timeout:25];(node["office"="estate_agent"](${x1},${y1},${x2},${y2});way["office"="estate_agent"](${x1},${y1},${x2},${y2});node["shop"="estate_agent"](${x1},${y1},${x2},${y2});way["shop"="estate_agent"](${x1},${y1},${x2},${y2}););out center;`;
}

async function queryOverpass(region) {
  const query = buildOverpassQuery(region);
  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
      body: 'data=' + encodeURIComponent(query),
      timeout: 25000,
    });
    if (!res.ok) {
      console.warn(`[scraper] Overpass ${res.status} for ${region}`);
      return [];
    }
    const text = await res.text();
    const match = text.match(/\{[\s\S]*\}/);
    const data = match ? JSON.parse(match[0]) : null;
    const els = (data && data.elements ? data.elements : []).filter((e) => e.tags && (e.tags.office === 'estate_agent' || e.tags.shop === 'estate_agent'));
    return els.map((e) => extractLead(e, region)).filter(Boolean);
  } catch (e) {
    console.warn(`[scraper] Overpass failed for ${region}:`, e.message);
    return [];
  }
}

function extractLead(element, region) {
  const t = element.tags || {};
  const name = t.name || 'Unnamed Estate Agent';
  const website = t.website || '';
  const phone = t['contact:phone'] || t.phone || '';
  const city = t['addr:city'] || '';
  const email = (t.email || t['contact:email'] || '').toLowerCase().trim();
  const domain = (website.match(/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}/i) || [])[0] || '';
  return {
    company: name,
    website,
    location: city || region.toUpperCase(),
    email,
    domain: domain.toLowerCase(),
    region,
    source: 'osm-overpass',
    phone,
  };
}

export function isValidEmail(email) {
  return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email || '');
}

const SEED = {
  us: [
    ['Metro Realty Group', 'metrorealty.com', 'New York', 'hello@metrorealty.com'],
    ['Coastline Properties', 'coastlineproperties.com', 'Miami', 'listings@coastlineproperties.com'],
    ['Liberty Home Partners', 'libertyhome.com', 'Austin', 'team@libertyhome.com'],
    ['Summit Estate Co', 'summitestate.com', 'Denver', 'contact@summitestate.com'],
    ['Keystone Realty', 'keystonerealty.com', 'Chicago', 'info@keystonerealty.com'],
    ['Pacific View Homes', 'pacificviewhomes.com', 'Los Angeles', 'sales@pacificviewhomes.com'],
  ],
  eu: [
    ['London Bridge Estates', 'londonbridgeestates.co.uk', 'London', 'info@londonbridgeestates.co.uk'],
    ['Berlin Wohnen GmbH', 'berlinwohnen.de', 'Berlin', 'kontakt@berlinwohnen.de'],
    ['Paris Immobilier', 'parisimmobilier.fr', 'Paris', 'contact@parisimmobilier.fr'],
    ['Amsterdam Huis', 'amsterdamhuis.nl', 'Amsterdam', 'hello@amsterdamhuis.nl'],
    ['Madrid Casas', 'madridcasas.es', 'Madrid', 'ventas@madridcasas.es'],
    ['Roma Domus', 'romadomus.it', 'Rome', 'info@romadomus.it'],
  ],
  au: [
    ['Sydney Harbour Realty', 'sydneyharbourrealty.com.au', 'Sydney', 'info@sydneyharbourrealty.com.au'],
    ['Melbourne Living', 'melbourneliving.com.au', 'Melbourne', 'team@melbourneliving.com.au'],
    ['Brisbane Property Co', 'brisbaneproperty.com.au', 'Brisbane', 'contact@brisbaneproperty.com.au'],
    ['Perth Coast Homes', 'perthcoasthomes.com.au', 'Perth', 'sales@perthcoasthomes.com.au'],
    ['Gold Coast Estates', 'goldcoastestates.com.au', 'Gold Coast', 'hello@goldcoastestates.com.au'],
    ['Adelaide Prime', 'adelaideprime.com.au', 'Adelaide', 'info@adelaideprime.com.au'],
  ],
};

function seedLeads(region) {
  const list = (SEED[region] || []).map(([company, domain, location, email]) => ({
    company,
    website: 'https://' + domain,
    location,
    email,
    domain,
    region,
    source: 'seed',
  }));
  console.log(`[scraper] ${region}: ${list.length} SEED leads (Overpass unavailable)`);
  return list;
}

export async function scrapeLeads(region, sources) {
  // Explicit sources path (backward compat)
  if (sources && sources.length > 0) {
    return sources
      .map((url) => ({ company: 'Source Lead', website: url, location: region.toUpperCase(), email: '', domain: (url.match(/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}/i) || [])[0] || '', region, source: 'source' }))
      .filter((l) => isValidEmail(l.email));
  }

  const mode = (process.env.DISCOVERY_MODE || 'auto').toLowerCase();

  if (mode === 'seed') return seedLeads(region);

  const live = await queryOverpass(region);
  if (live.length > 0) {
    console.log(`[scraper] ${region}: ${live.length} live Overpass leads`);
    return live;
  }

  // auto / real-with-fallback: if Overpass empty, fall back to seed so the
  // pipeline still produces output (visible in Sheets + emails).
  if (mode === 'real') return [];
  return seedLeads(region);
}

export default { scrapeLeads, isValidEmail };
