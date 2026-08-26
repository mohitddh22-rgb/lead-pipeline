/**
 * Hunter.io API connector for email finding & verification.
 * - Free tier: 50 credits/month (25 searches + 25 verifications)
 * - Starter: $34/mo (2,000 credits/mo)
 * - Base URL: https://api.hunter.io/v2
 */
import fetch from 'node-fetch';

const HUNTER_BASE = 'https://api.hunter.io/v2';

function getApiKey() {
  const key = process.env.HUNTER_API_KEY;
  if (!key) return null;
  return key.trim();
}

/**
 * Domain Search: find all emails associated with a company domain.
 * Costs: 1 credit per email returned (search credits).
 */
export async function domainSearch(domain, options = {}) {
  const key = getApiKey();
  if (!key) throw new Error('HUNTER_API_KEY not set');

  const params = new URLSearchParams({
    domain,
    api_key: key,
    limit: options.limit || 10,
    offset: options.offset || 0,
    type: options.type || 'personal', // personal, generic
    ...options.seniority && { seniority: options.seniority },
    ...options.department && { department: options.department },
    ...options.required_field && { required_field: options.required_field },
  });

  const res = await fetch(`${HUNTER_BASE}/domain-search?${params}`);

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Hunter domain search failed: ${res.status} ${err}`);
  }

  return res.json();
}

/**
 * Email Finder: find a specific person's email by name + domain.
 * Costs: 1 credit per search.
 */
export async function emailFinder(domain, firstName, lastName, options = {}) {
  const key = getApiKey();
  if (!key) throw new Error('HUNTER_API_KEY not set');

  const params = new URLSearchParams({
    domain,
    first_name: firstName,
    last_name: lastName,
    api_key: key,
    ...options.position && { position: options.position },
    ...options.company && { company: options.company },
  });

  const res = await fetch(`${HUNTER_BASE}/email-finder?${params}`);

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Hunter email finder failed: ${res.status} ${err}`);
  }

  return res.json();
}

/**
 * Email Verifier: verify deliverability of an email.
 * Costs: 0.5 credits per verification.
 */
export async function verifyEmail(email) {
  const key = getApiKey();
  if (!key) throw new Error('HUNTER_API_KEY not set');

  const params = new URLSearchParams({
    email,
    api_key: key,
  });

  const res = await fetch(`${HUNTER_BASE}/email-verifier?${params}`);

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Hunter email verify failed: ${res.status} ${err}`);
  }

  return res.json();
}

/**
 * Account info: check remaining credits.
 */
export async function accountInfo() {
  const key = getApiKey();
  if (!key) throw new Error('HUNTER_API_KEY not set');

  const params = new URLSearchParams({ api_key: key });

  const res = await fetch(`${HUNTER_BASE}/account?${params}`);

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Hunter account info failed: ${res.status} ${err}`);
  }

  return res.json();
}

/**
 * High-level: enrich leads from Outscraper with Hunter emails.
 * For each lead with a domain but no email, use Domain Search to find emails.
 * Returns leads with email filled in.
 */
export async function enrichLeadsWithHunter(leads, options = {}) {
  const { maxDomains = 20, maxEmailsPerDomain = 3 } = options;
  const enriched = [];

  // Group leads by domain
  const byDomain = {};
  for (const lead of leads) {
    if (lead.domain && !lead.email) {
      if (!byDomain[lead.domain]) byDomain[lead.domain] = [];
      byDomain[lead.domain].push(lead);
    } else {
      enriched.push(lead); // Already has email or no domain
    }
  }

  const domains = Object.keys(byDomain).slice(0, maxDomains);

  for (const domain of domains) {
    try {
      const result = await domainSearch(domain, { limit: maxEmailsPerDomain });
      const emails = result?.data?.emails || [];

      // Assign emails to leads for this domain
      const domainLeads = byDomain[domain];
      for (let i = 0; i < domainLeads.length && i < emails.length; i++) {
        const lead = { ...domainLeads[i] };
        lead.email = emails[i].value;
        lead.email_confidence = emails[i].confidence;
        lead.email_type = emails[i].type; // personal, generic
        lead.email_position = emails[i].position;
        lead.email_department = emails[i].department;
        lead.email_sources = emails[i].sources;
        enriched.push(lead);
      }

      // Leads beyond email count get pushed without email
      for (let i = emails.length; i < domainLeads.length; i++) {
        enriched.push(domainLeads[i]);
      }
    } catch (e) {
      console.warn(`[hunter] domain search failed for ${domain}:`, e.message);
      // Push leads without email
      enriched.push(...byDomain[domain]);
    }
  }

  return enriched;
}

export default {
  domainSearch,
  emailFinder,
  verifyEmail,
  accountInfo,
  enrichLeadsWithHunter,
};