// Lead pipeline daily summary — ONE command: node scripts/daily-summary.mjs
// Reads Google Sheets (lead counts) + Resend (email stats) directly from .env.local.
// Use this instead of the hosted dashboard, which is not live on prod (testing branch only, SSO-gated).
import { google } from "googleapis";
import fs from "fs";

const env = fs.readFileSync(".env.local", "utf8");
const kv = {};
const lines = env.split("\n");
let i = 0;
while (i < lines.length) {
  const line = lines[i];
  const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) {
    let key = m[1], val = m[2];
    if (val.startsWith("'")) {
      let buf = val;
      while (!buf.endsWith("'") && i < lines.length - 1) { i++; buf += "\n" + lines[i]; }
      val = buf.slice(1, -1);
    }
    kv[key] = val.trim();
  }
  i++;
}
const SPREADSHEET_ID = kv.SPREADSHEET_ID;
const SA = kv.GOOGLE_SHEETS_CREDENTIALS;
const RESEND = (kv.RESEND_API_KEY || "").trim();
const SHEET_NAME = kv.SHEET_NAME || "Leads";

if (!SPREADSHEET_ID || !SA) { console.log(JSON.stringify({ error: "missing sheets config" })); process.exit(0); }

const creds = JSON.parse(SA);
const auth = new google.auth.JWT({ email: creds.client_email, key: creds.private_key.replace(/\\n/g, "\n"), scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", auth });
const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${SHEET_NAME}!A2:G` });
const rows = res.data.values || [];
const today = new Date().toISOString().slice(0, 10);
let addedToday = 0, contactedToday = 0, emailedToday = 0;
for (const r of rows) {
  const dateAdded = (r[5] || "").slice(0, 10);
  const lastEmailed = (r[6] || "").slice(0, 10);
  const status = (r[4] || "").toLowerCase();
  if (dateAdded === today) addedToday++;
  if (status === "contacted" && lastEmailed === today) contactedToday++;
  if (lastEmailed === today) emailedToday++;
}
const total = rows.length;
const contacted = rows.filter((r) => (r[4] || "").toLowerCase() === "contacted").length;
const pending = total - contacted;

let email = null;
if (RESEND) {
  try {
    const since = new Date(Date.now() - 24 * 3600e3).toISOString();
    const rr = await fetch(`https://api.resend.com/emails?limit=100&created_at=${encodeURIComponent(since)}`, { headers: { Authorization: `Bearer ${RESEND}` } });
    if (rr.ok) {
      const j = await rr.json();
      const items = j.data || [];
      const sent = items.length;
      const delivered = items.filter((e) => e.last_event === "delivered").length;
      const bounced = items.filter((e) => e.last_event === "bounced").length;
      email = { sent, delivered, bounced, deliveryRate: sent ? Math.round((delivered / sent) * 100) : 0, bounceRate: sent ? Math.round((bounced / sent) * 100) : 0 };
    } else email = { error: `HTTP ${rr.status}` };
  } catch (e) { email = { error: e.message }; }
}

console.log(JSON.stringify({ today, total, contacted, pending, addedToday, contactedToday, emailedToday, email }, null, 2));
