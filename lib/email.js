import { Resend } from "resend";
import { FROM_EMAIL, UNSUBSCRIBE_URL } from "./config.js";

let client = null;
function getClient() {
  if (client) return client;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  return (client = new Resend(key));
}

// Sender identity — configurable via FROM_EMAIL, defaulting to scapiab2b.com.
// Read live so runtime env changes (e.g. Vercel dashboard edits) take effect
// without a redeploy, falling back to the config default when unset.
export function getFromEmail() {
  return process.env.FROM_EMAIL || FROM_EMAIL;
}

// Substitute {{token}} placeholders with per-lead values.
// Unknown tokens are replaced with an empty string.
export function renderTemplate(template, lead) {
  const vars = {
    company: lead.company || "",
    website: lead.website || "",
    location: lead.location || "",
    email: lead.email || "",
    region: lead.region || "",
  };
  return String(template).replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : ""
  );
}

// ---- Fallback auto-generated lead messaging (used when env templates absent) ----
function fallbackSubject(lead) {
  return `A faster way to close more viewings at ${lead.company}`;
}

function fallbackHtml(lead) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:600px;margin:auto">
    <h2>Quick idea for ${lead.company}</h2>
    <p>Hi there,</p>
    <p>We help real estate teams like ${lead.company} turn more inbound interest
       into booked viewings with a white-label CRM and automated follow-up.
       Teams typically recover 10–20 hours every week.</p>
    <p>Worth a 15-minute look? <a href="https://scapiab2b.com/book">book a call</a>.</p>
    <p>— The Growth Team</p>
    <hr style="margin-top:24px;border:none;border-top:1px solid #eee">
    <p style="font-size:12px;color:#999">You're receiving this because your business is
       listed publicly. <a href="${UNSUBSCRIBE_URL}?email=${encodeURIComponent(lead.email)}">Unsubscribe</a>.</p>
  </div>`;
}

// Build the full message payload. Applies env-configured subject/body when present,
// otherwise falls back to auto-generated lead messaging.
export function buildEmail(lead) {
  const subject = process.env.EMAIL_SUBJECT
    ? renderTemplate(process.env.EMAIL_SUBJECT, lead)
    : fallbackSubject(lead);
  const html = process.env.EMAIL_BODY_TEMPLATE
    ? renderTemplate(process.env.EMAIL_BODY_TEMPLATE, lead)
    : fallbackHtml(lead);

  return {
    from: getFromEmail(),
    to: [lead.email],
    subject,
    html,
    headers: {
      "List-Unsubscribe": `<${UNSUBSCRIBE_URL}?email=${encodeURIComponent(lead.email)}>`,
    },
  };
}

export async function sendColdEmail(lead) {
  const resend = getClient();
  const { data, error } = await resend.emails.send(buildEmail(lead));
  if (error) throw new Error(error.message);
  return data;
}
