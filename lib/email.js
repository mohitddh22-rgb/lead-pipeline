import { Resend } from "resend";
import { FROM_EMAIL, UNSUBSCRIBE_URL } from "./config.js";

let client = null;
function getClient() {
  if (client) return client;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  return (client = new Resend(key));
}

function buildHtml(lead) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:600px;margin:auto">
    <h2>Quick idea for ${lead.company}</h2>
    <p>Hi there,</p>
    <p>We help real estate teams like ${lead.company} turn more inbound interest
       into booked viewings with a white-label CRM and automated follow-up.
       Teams typically recover 10–20 hours every week.</p>
    <p>Worth a 15-minute look? <a href="https://yourdomain.com/book">book a call</a>.</p>
    <p>— The Growth Team</p>
    <hr style="margin-top:24px;border:none;border-top:1px solid #eee">
    <p style="font-size:12px;color:#999">You're receiving this because your business is
       listed publicly. <a href="${UNSUBSCRIBE_URL}?email=${encodeURIComponent(lead.email)}">Unsubscribe</a>.</p>
  </div>`;
}

export async function sendColdEmail(lead) {
  const resend = getClient();
  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: [lead.email],
    subject: `A faster way to close more viewings at ${lead.company}`,
    html: buildHtml(lead),
    headers: {
      "List-Unsubscribe": `<${UNSUBSCRIBE_URL}?email=${encodeURIComponent(lead.email)}>`
    }
  });
  if (error) throw new Error(error.message);
  return data;
}
