import { Resend } from "resend";
import { FROM_EMAIL, UNSUBSCRIBE_URL } from "./config.js";

let client = null;
function getClient() {
  if (client) return client;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  return (client = new Resend(key));
}

// Sender identity — read LIVE from env so runtime overrides apply. Default spaciab2b.com.
export function getFromEmail() {
  return process.env.FROM_EMAIL || FROM_EMAIL;
}

// Derive a friendly first name. We only capture company/email, not a person name,
// so use the email local-part when it looks name-like, otherwise "there".
function firstNameOf(lead) {
  const local = (lead.email || "").split("@")[0] || "";
  const generic = ["info","sales","contact","admin","hello","office","support","enquiries","inquiry","marketing","webmaster","noreply","no-reply"];
  if (/^[a-z][a-z.]{1,19}$/i.test(local) && !generic.includes(local.toLowerCase())) {
    return local.charAt(0).toUpperCase() + local.slice(1);
  }
  return "there";
}

// Substitute {{token}} placeholders with per-lead values. Unknown tokens -> "".
export function renderTemplate(template, lead) {
  const vars = {
    company: lead.company || "",
    website: lead.website || "",
    location: lead.location || "",
    email: lead.email || "",
    region: lead.region || "",
    first_name: firstNameOf(lead),
  };
  return String(template).replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : ""
  );
}

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
    <p>Worth a 15-minute look? <a href="https://spaciab2b.com/book">book a call</a>.</p>
    <p>— The Growth Team</p>
    <hr style="margin-top:24px;border:none;border-top:1px solid #eee">
    <p style="font-size:12px;color:#999">You're receiving this because your business is
       listed publicly. <a href="${UNSUBSCRIBE_URL}?email=${encodeURIComponent(lead.email)}">Unsubscribe</a>.</p>
  </div>`;
}

// Build the payload. When EMAIL_BODY_TEMPLATE is set it is sent as PLAIN TEXT
// (no HTML), with literal \n converted to real line breaks. Otherwise fallback HTML.
export function buildEmail(lead) {
  const subject = process.env.EMAIL_SUBJECT
    ? renderTemplate(process.env.EMAIL_SUBJECT, lead)
    : fallbackSubject(lead);

  const headers = {
    "List-Unsubscribe": `<${UNSUBSCRIBE_URL}?email=${encodeURIComponent(lead.email)}>`,
  };

  if (process.env.EMAIL_BODY_TEMPLATE) {
    const text = renderTemplate(process.env.EMAIL_BODY_TEMPLATE, lead).replace(/\\n/g, "\n");
    return { from: getFromEmail(), to: lead.email, subject, text, headers };
  }
  return { from: getFromEmail(), to: lead.email, subject, html: fallbackHtml(lead), headers };
}

export async function sendColdEmail(lead) {
  const resend = getClient();
  const { data, error } = await resend.emails.send(buildEmail(lead));
  if (error) throw new Error(error.message);
  return data;
}
