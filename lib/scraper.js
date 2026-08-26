/**
 * Production-grade scraper using OpenStreetMap Overpass API.
 * - Free, no key required, worldwide coverage
 * - Queries: [office=estate_agent] or [shop=estate_agent] by bounding box
 * - Extracts: name, website, phone, city, email tags from element properties
 * - Rate-friendly: polite delays, no heavy rendering needed
 */
import fetch from 'node-fetch';

// OSM Overpass API endpoint
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// Bounding boxes for US, EU, AU (approximate, covers major regions)
const REGION_BBOX = {
  us: '-124.845561,24.743314,-66.885494,49.384345', // CONUS roughly
  eu: '-10.577094,35.218887,35.500794,59.928048',    // Europe roughly
  au: '112.927862,-43.665099,159.203039,-9.124957'  // Australia roughly
};

// Overpass QL query: find estate agents by tag
const OVERPASS_QUERY = (
  bbox,
  tags = '(office=estate_agent) + (shop=estate_agent)'
) => `
[out:json][timeout:25];
(
  ${tags}
);
node["addr:city"](${bbox});
way["addr:city"](${bbox});
out center;
`;

// Query OSM Overpass for a given region
async function queryOverpass(region) {
  const bbox = REGION_BBOX[region] || REGION_BBOX.us;
  const query = OVERPASS_QUERY(bbox);

  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: `data=${encodeURIComponent(query)}`,
      timeout: 30000
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Overpass ${res.status}: ${text}`);
    }

    const data = await res.json();
    return data.elements || [];
  } catch (e) {
    console.error(`[scraper] Overpass query failed for ${region}:`, e.message);
    return [];
  }
}

// Extract lead data from a single OSM element
function extractLead(element) {
  // Get tags
  const tags = element.tags || {};

  // Skip if no relevant tags
  if (!tags.office && !tags.shop) return null;

  // Name: use name tag, fallback to operator
  const name = tags.name || tags.operator || tags.ref || 'Unnamed Agency';

  // Website: from website tag
  const website = tags.website || '';

  // Phone: from contact:phone tag
  const phone = tags['contact:phone'] || tags.phone || '';

  // City from addr:city
  const city = tags['addr:city'] || '';

  // Email: look for email tag or contact:email
  const email = tags.email || tags['contact:email'] || '';

  // Domain extraction from website
  const domain = website
    ? website.match(/^[a-zA-Z0-9][a-zA-Z0-9-]+\.[a-z]{2,}/i)?.[0]
    : '';

  if (!name || name === 'Unnamed Agency') return null;

  return {
    company: name,
    website,
    location: city || region.toUpperCase(),
    email: email.toLowerCase().trim(),
    domain: domain.toLowerCase(),
    region,
    source: 'osm-overpass'
  };
}

// Validate email format with regex
function isValidEmail(email) {
  if (!email) return false;
  // Simple but effective regex for email validation
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

// Scrape leads for a region via OSM Overpass
export async function scrapeLeads(region, sources) {
  // If explicit sources provided, use those (backward compat)
  if (sources && sources.length > 0) {
    console.log(`[scraper] Using explicit sources for ${region}`);
    const leads = [];
    const seenDomains = new Set();

    for (const url of sources) {
      try {
        // Try to parse as OSM result or fall back to mock
        const lead = extractLead({ tags: { name: 'From Source', website: url } });
        if (lead && lead.domain && !seenDomains.has(lead.domain)) {
          seenDomains.add(lead.domain);
          // Validate email before adding
          if (isValidEmail(lead.email)) {
            leads.push(lead);
          }
        }
      } catch (e) {
        console.error(`[scraper] failed ${url}:`, e.message);
      }
    }
    return leads;
  }

  // Query Overpass for this region
  console.log(`[scraper] Querying Overpass for ${region}...`);
  const elements = await queryOverpass(region);

  const leads = [];
  const seenDomains = new Set();

  for (const el of elements) {
    const lead = extractLead(el);

    if (!lead) continue;
    if (seenDomains.has(lead.domain)) continue; // Dedup by domain
    seenDomains.add(lead.domain);

    // Validate email format
    if (!isValidEmail(lead.email)) {
      console.warn(`[scraper] Invalid email for ${lead.company}: ${lead.email}`);
      // Still include lead but mark email as empty
      lead.email = '';
    }

    leads.push(lead);

    // Polite delay every 10 leads to avoid any rate limiting
    if (leads.length % 10 === 0) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log(`[scraper] ${region}: extracted ${leads.length} leads (${seenDomains.size} unique domains)`);
  return leads;
}

// For testing / manual endpoint
export async function testOverpass(region) {
  const elements = await queryOverpass(region);
  const leads = [];

  for (const el of elements.slice(0, 20)) {
    const lead = extractLead(el);
    if (lead) {
      const valid = isValidEmail(lead.email) ? '✓' : '✗';
      leads.push({ ...lead, email_valid: valid });
    }
  }

  return { region, elements_count: elements.length, leads };
}

export default { scrapeLeads, queryOverpass, extractLead, isValidEmail };