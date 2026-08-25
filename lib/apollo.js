/**
 * Apollo.io API connector for lead discovery + enrichment.
 * - Search is FREE (no credits)
 * - Enrich (reveal email/phone) costs credits: 1/email, 8/phone
 * - Free tier: 75 credits/mo; Basic: 2,500/mo
 * - Base URL: https://api.apollo.io/api/v1
 */
import fetch from 'node-fetch';

const APOLLO_BASE = 'https://api.apollo.io/api/v1';
const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-cache',
};

function getApiKey() {
  const key = process.env.APOLLO_API_KEY;
  if (!key) return null;
  return key.trim();
}

function authHeaders() {
  const key = getApiKey();
  if (!key) return null;
  return { ...DEFAULT_HEADERS, 'Authorization': `Bearer ${key}` };
}

/**
 * Search for organizations (companies) — FREE, no credits consumed.
 * Returns lightweight org records: id, name, website_url, phone, linkedin_url, 
 * city, state, country, employee_count, industry, etc.
 */
export async function searchOrganizations(params = {}) {
  const headers = authHeaders();
  if (!headers) throw new Error('APOLLO_API_KEY not set');

  const query = new URLSearchParams({
    api_key: getApiKey(),
    page: params.page || 1,
    per_page: params.per_page || 25,
    ...params.q && { q: params.q },
    ...params.organization_locations && { organization_locations: params.organization_locations },
    ...params.employee_counts && { employee_counts: params.employee_counts },
    ...params.industries && { industries: params.industries },
    ...params.technologies && { technologies: params.technologies },
    ...params.revenue_range && { revenue_range: params.revenue_range },
    ...params.funding_stage && { funding_stage: params.funding_stage },
  });

  const res = await fetch(`${APOLLO_BASE}/mixed_companies/search?${query}`, {
    method: 'GET',
    headers,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Apollo search failed: ${res.status} ${err}`);
  }
  return res.json();
}

/**
 * Search for people (contacts) at organizations — FREE search, credits only on reveal.
 * Returns people with: id, name, title, email (masked), phone (masked), organization_id, etc.
 */
export async function searchPeople(params = {}) {
  const headers = authHeaders();
  if (!headers) throw new Error('APOLLO_API_KEY not set');

  const query = new URLSearchParams({
    api_key: getApiKey(),
    page: params.page || 1,
    per_page: params.per_page || 25,
    ...params.q && { q: params.q },
    ...params.person_titles && { person_titles: params.person_titles },
    ...params.person_seniorities && { person_seniorities: params.person_seniorities },
    ...params.organization_locations && { organization_locations: params.organization_locations },
    ...params.organization_ids && { organization_ids: params.organization_ids.join(',') },
    ...params.employee_counts && { employee_counts: params.employee_counts },
    ...params.industries && { industries: params.industries },
  });

  const res = await fetch(`${APOLLO_BASE}/mixed_people/search?${query}`, {
    method: 'GET',
    headers,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Apollo people search failed: ${res.status} ${err}`);
  }
  return res.json();
}

/**
 * Enrich a person by ID — COSTS CREDITS (1 for email, 8 for phone).
 * Use sparingly; call only when you need the actual email/phone.
 */
export async function enrichPerson(personId, revealEmail = true, revealPhone = false) {
  const headers = authHeaders();
  if (!headers) throw new Error('APOLLO_API_KEY not set');

  const body = {
    api_key: getApiKey(),
    id: personId,
    reveal_personal_emails: revealEmail,
    reveal_phone_number: revealPhone,
  };

  const res = await fetch(`${APOLLO_BASE}/people/match`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Apollo enrich failed: ${res.status} ${err}`);
  }
  return res.json();
}

/**
 * Enrich an organization by ID — COSTS CREDITS (1-8 depending on fields).
 */
export async function enrichOrganization(orgId) {
  const headers = authHeaders();
  if (!headers) throw new Error('APOLLO_API_KEY not set');

  const body = {
    api_key: getApiKey(),
    id: orgId,
  };

  const res = await fetch(`${APOLLO_BASE}/organizations/enrich`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Apollo org enrich failed: ${res.status} ${err}`);
  }
  return res.json();
}

/**
 * Check remaining credits (account usage).
 */
export async function checkCredits() {
  const headers = authHeaders();
  if (!headers) throw new Error('APOLLO_API_KEY not set');

  const res = await fetch(`${APOLLO_BASE}/auth/health`, {
    method: 'GET',
    headers,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Apollo credit check failed: ${res.status} ${err}`);
  }
  return res.json();
}

/**
 * High-level pipeline: discover real-estate agencies in a region, enrich top N for emails.
 * Returns normalized leads: { company, website, location, email, region, source: 'apollo' }
 */
export async function discoverRealEstateAgencies(region, options = {}) {
  const { maxOrgs = 50, maxEnrich = 20, titles = ['CEO', 'Founder', 'Owner', 'Broker', 'Managing Director', 'Principal', 'Director'] } = options;

  // 1. Search orgs in real estate, filtered by location
  const locationMap = {
    us: ['United States'],
    eu: ['United Kingdom', 'Germany', 'France', 'Netherlands', 'Spain', 'Italy'],
    au: ['Australia'],
  };
  const locations = locationMap[region] || ['United States'];

  const orgSearch = await searchOrganizations({
    q: 'real estate',
    industries: ['Real Estate'],
    organization_locations: locations,
    employee_counts: ['1-10', '11-50', '51-200'], // agencies, not huge corps
    per_page: maxOrgs,
  });

  const orgs = orgSearch.organizations || orgSearch.companies || [];
  if (!orgs.length) return [];

  // 2. For top orgs, search people with relevant titles
  const orgIds = orgs.slice(0, maxEnrich).map(o => o.id).filter(Boolean);
  if (!orgIds.length) return [];

  const peopleSearch = await searchPeople({
    organization_ids: orgIds,
    person_titles: titles,
    per_page: maxEnrich,
  });

  const people = peopleSearch.people || [];

  // 3. Enrich top people for emails (costs credits!)
  const leads = [];
  for (const person of people.slice(0, maxEnrich)) {
    try {
      const enriched = await enrichPerson(person.id, true, false);
      const p = enriched.person || person;
      const org = orgs.find(o => o.id === person.organization_id) || {};
      
      if (p.email) {
        leads.push({
          company: org.name || p.organization_name,
          website: org.website_url || org.primary_domain,
          location: [org.city, org.state, org.country].filter(Boolean).join(', '),
          email: p.email,
          first_name: p.first_name,
          last_name: p.last_name,
          title: p.title,
          region,
          source: 'apollo',
          apollo_person_id: p.id,
          apollo_org_id: org.id,
        });
      }
    } catch (e) {
      console.warn(`[apollo] enrich failed for ${person.id}:`, e.message);
    }
  }

  return leads;
}

export default {
  searchOrganizations,
  searchPeople,
  enrichPerson,
  enrichOrganization,
  checkCredits,
  discoverRealEstateAgencies,
};