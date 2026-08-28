import { google } from "googleapis";
import { SPREADSHEET_ID, SHEET_NAME } from "./config.js";

// Returns the FULL lead list (all rows) for the pipeline/analytics views.
export async function getAllLeads() {
  const id = SPREADSHEET_ID;
  const sa = process.env.GOOGLE_SHEETS_CREDENTIALS;
  if (!id || !sa) return [];
  try {
    const creds = JSON.parse(sa);
    const auth = new google.auth.JWT({
      email: creds.client_email,
      key: creds.private_key.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: `${SHEET_NAME}!A2:G`,
    });
    const rows = res.data.values || [];
    return rows.map((r, i) => ({
      id: i + 1,
      company: r[0] || "", website: r[1] || "", location: r[2] || "",
      email: r[3] || "", status: r[4] || "pending", dateAdded: r[5] || "", lastEmailed: r[6] || "",
    }));
  } catch (e) {
    return [];
  }
}
// Returns aggregate stats + recent rows from the lead sheet.
// Returns null if credentials/spreadsheet are not configured (so the page
// can render a friendly "not configured" state instead of crashing).
export async function getLeadStats() {
  const id = SPREADSHEET_ID;
  const sa = process.env.GOOGLE_SHEETS_CREDENTIALS;
  if (!id || !sa) return null;
  try {
    const creds = JSON.parse(sa);
    const auth = new google.auth.JWT({
      email: creds.client_email,
      key: creds.private_key.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: `${SHEET_NAME}!A2:G`,
    });
    const rows = res.data.values || [];
    const total = rows.length;
    const contacted = rows.filter((r) => (r[4] || "").toLowerCase() === "contacted").length;
    const pending = rows.filter((r) => (r[4] || "").toLowerCase() !== "contacted").length;
    const recent = rows.slice(-10).reverse().map((r) => ({
      company: r[0] || "", website: r[1] || "", location: r[2] || "",
      email: r[3] || "", status: r[4] || "", dateAdded: r[5] || "", lastEmailed: r[6] || "",
    }));
    return { total, contacted, pending, recent };
  } catch (e) {
    return { error: e.message };
  }
}
