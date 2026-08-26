/**
 * Outscraper API connector for business discovery via Google Maps.
 * - Free tier: 500 places/month (Google Maps Scraper)
 * - Pay-as-you-go: $3/1,000 after free tier
 * - Base URL: https://api.outscraper.com
 */
import fetch from 'node-fetch';

const OUTSCRAPER_BASE = 'https://api.outscraper.com/api/v1';

function getApiKey() {
  const key = process.env.OUTSCRAPER_API_KEY;
  if (!key) return null;
  return key.trim();
}

function authHeaders() {
  const key = getApiKey();
  if (!key) return null;
  return {
    'Content-Type': 'application/json',
    'X-API-KEY': key,
  };
}

/**
 * Search Google Maps for businesses.
 * @param {Object} params
 * @param {string} params.query - e.g., "real estate agency"
 * @param {string} params.location - e.g., "New York, USA" or "London, UK"
 * @param {number} params.limit - max results (default 20)
 * @param {string} params.language - "en"
 * @param {string} params.region - "us", "eu", "au" for custom logic
 */
export async function searchGoogleMaps(params = {}) {
  const headers = authHeaders();
  if (!headers) throw new Error('OUTSCRAPER_API_KEY not set');

  const { query, location, limit = 20, language = 'en', region = 'us' } = params;

  // Outscraper expects an array of queries
  const body = JSON.stringify([
    {
      query,
      location,
      limit,
      language,
      // Additional filters
      drop_duplicates: true,
      // async: false, // synchronous for simplicity
    },
  ]);

  const res = await fetch(`${OUTSCRAPER_BASE}/maps/search`, {
    method: 'POST',
    headers,
    body,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Outscraper maps search failed: ${res.status} ${err}`);
  }

  const data = await res.json();
  // Response shape: { data: [ [ { place_id, name, full_address, phone, site, ... } ] ] }
  const results = data?.data?.[0] || [];
  return results;
}

/**
 * Enrich a list of domains with emails & contacts.
 * Free tier: 500 domains/month.
 */
export async function enrichEmailsAndContacts(domains) {
  const headers = authHeaders();
  if (!headers) throw new Error('OUTSCRAPER_API_KEY not set');

  const body = JSON.stringify([domains]);

  const res = await fetch(`${OUTSCRAPER_BASE}/emails-and-contacts`, {
    method: 'POST',
    headers,
    body,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Outscraper email enrich failed: ${res.status} ${err}`);
  }

  const data = await res.json();
  // Response: { data: [ { domain, emails: [...], phones: [...], socials: {...} } ] }
  return data?.data?.[0] || [];
}

/**
 * High-level: discover real estate agencies in a region via Outscraper.
 * Returns normalized leads: { company, website, location, email, phone, region, source: 'outscraper' }
 */
export async function discoverRealEstateAgenciesOutscraper(region, options = {}) {
  const { maxResults = 50 } = options;

  const locationMap = {
    us: ['New York, USA', 'Los Angeles, USA', 'Chicago, USA', 'Houston, USA', 'Miami, USA'],
    eu: ['London, UK', 'Berlin, Germany', 'Paris, France', 'Amsterdam, Netherlands', 'Madrid, Spain'],
    au: ['Sydney, Australia', 'Melbourne, Australia', 'Brisbane, Australia', 'Perth, Australia'],
  };

  const locations = locationMap[region] || locationMap.us;
  const allLeads = [];

  for (const location of locations) {
    try {
      const results = await searchGoogleMaps({
        query: 'real estate agency',
        location,
        limit: Math.ceil(maxResults / locations.length),
      });

      for (const place of results) {
        if (!place.site) continue; // Need a website for email enrichment
        const domain = extractDomain(place.site);
        if (!domain) continue;

        allLeads.push({
          company: place.name,
          website: place.site,
          location: place.full_address || location,
          phone: place.phone,
          domain,
          region,
          source: 'outscraper',
          place_id: place.place_id,
        });

        if (allLeads.length >= maxResults) break;
      }
    } catch (e) {
      console.warn(`[outscraper] search failed for ${location}:`, e.message);
    }

    if (allLeads.length >= maxResults) break;
  }

  // Enrich top domains for emails (costs credits, limit it)
  const enrichLimit = Math.min(20, allLeads.length);
  const domainsToEnrich = allLeads.slice(0, enrichLimit).map(l => l.domain);

  if (domainsToEnrich.length > 0) {
    try {
      const enriched = await enrichEmailsAndContacts(domainsToEnrich);
      const enrichedMap = {};
      for (const item of enriched) {
        enrichedMap[item.domain] = item;
      }

      for (const lead of allLeads.slice(0, enrichLimit)) {
        const enrich = enrichedMap[lead.domain];
        if (enrich?.emails?.length) {
          // Pick first email with highest confidence or just first
          lead.email = enrich.emails[0]?.value || enrich.emails[0];
          lead.email_confidence = enrich.emails[0]?.confidence;
        }
      }
    } catch (e) {
      console.warn('[outscraper] email enrich failed:', e.message);
    }
  }

  return allLeads.slice(0, maxResults);
}

function extractDomain(url) {
  if (!url) return '';
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

export default {
  searchGoogleMaps,
  enrichEmailsAndContacts,
  discoverRealEstateAgenciesOutscraper,
};