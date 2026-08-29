import { google } from "googleapis";

let cachedClient = null;

async function getAuth() {
  if (cachedClient) return cachedClient;
  const raw = process.env.GOOGLE_SHEETS_CREDENTIALS;
  if (!raw) throw new Error("GOOGLE_SHEETS_CREDENTIALS is not set");
  const credentials = JSON.parse(raw);
  const client = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  await client.authorize();
  cachedClient = client;
  return client;
}

export const HEADER = [
  "Company Name","Website","Location","Email","Status","Date Added","Last Emailed"
];

export async function ensureHeader(sheetName = "Leads") {
  const auth = await getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const id = process.env.SPREADSHEET_ID;
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId: id, range: `${sheetName}!A1:G1`
  });
  if (!existing.data.values || existing.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: id, range: `${sheetName}!A1:G1`,
      valueInputOption: "RAW", requestBody: { values: [HEADER] }
    });
  }
}

export async function getExistingKeys(sheetName = "Leads") {
  const auth = await getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const id = process.env.SPREADSHEET_ID;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: id, range: `${sheetName}!A2:D`
  });
  const rows = res.data.values || [];
  const keys = new Set();
  for (const r of rows) {
    if (r[1]) keys.add("w:" + r[1].toLowerCase());
    if (r[3]) keys.add("e:" + r[3].toLowerCase());
  }
  return keys;
}

export async function appendLeads(leads, sheetName = "Leads") {
  if (!leads.length) return { added: 0 };
  const auth = await getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const id = process.env.SPREADSHEET_ID;
  const today = new Date().toISOString().slice(0, 10);
  const values = leads.map(l => [
    l.company || "", l.website || "", l.location || "", l.email || "",
    "New", today, ""
  ]);
  const res = await sheets.spreadsheets.values.append({
    spreadsheetId: id, range: `${sheetName}!A:G`,
    valueInputOption: "RAW", insertDataOption: "INSERT_ROWS",
    requestBody: { values }
  });
  return { added: values.length, updatedRange: res.data.updates?.updatedRange };
}

export async function markEmailed(email, sheetName = "Leads") {
  const auth = await getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const id = process.env.SPREADSHEET_ID;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: id, range: `${sheetName}!A2:G`
  });
  const rows = res.data.values || [];
  const today = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < rows.length; i++) {
    if ((rows[i][3] || "").toLowerCase() === email.toLowerCase()) {
      const rowNum = i + 2;
      await sheets.spreadsheets.values.update({
        spreadsheetId: id, range: `${sheetName}!E${rowNum}:G${rowNum}`,
        valueInputOption: "RAW",
        requestBody: { values: [["Contacted", rows[i][5] || today, today]] }
      });
      return true;
    }
  }
  return false;
}

// Append a durable row to the CronLog tab so every scheduled/manual run is
// verifiable in the Sheet (the in-memory runLedger resets on cold starts).
const CRON_LOG_TAB = "CronLog";
export async function logCronRun(entry) {
  try {
    const auth = await getAuth();
    const sheets = google.sheets({ version: "v4", auth });
    const id = process.env.SPREADSHEET_ID;
    const header = ["Timestamp (UTC)", "Trigger", "Regions", "Scraped", "Added", "Skipped", "Emails", "Ms", "Note"];
    // ensure header row
    const ex = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `${CRON_LOG_TAB}!A1:I1` }).catch(() => null);
    if (!ex || !ex.data.values || !ex.data.values.length) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: id, range: `${CRON_LOG_TAB}!A1:I1`,
        valueInputOption: "RAW", requestBody: { values: [header] }
      });
    }
    await sheets.spreadsheets.values.append({
      spreadsheetId: id, range: `${CRON_LOG_TAB}!A:I`,
      valueInputOption: "RAW", insertDataOption: "INSERT_ROWS",
      requestBody: { values: [[
        entry.at, entry.trigger || "manual", (entry.regions || []).join(","),
        entry.scraped ?? 0, entry.added ?? 0, entry.skipped ?? 0, entry.emails ?? 0,
        entry.ms ?? 0, entry.note || ""
      ]] }
    });
  } catch (e) {
    console.warn("[sheets] logCronRun failed:", e.message);
  }
}
