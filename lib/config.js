// Central configuration. All secrets come from process.env.
export const REGIONS = ["us", "eu", "au"];

export const BATCH_SIZE = Number(process.env.BATCH_SIZE || 50);

export const SHEET_NAME = process.env.SHEET_NAME || "Leads";
export const SPREADSHEET_ID = process.env.SPREADSHEET_ID || "";
export const FROM_EMAIL =
  process.env.FROM_EMAIL || "Growth Team <growth@yourdomain.com>";
export const UNSUBSCRIBE_URL =
  process.env.UNSUBSCRIBE_URL || "https://yourdomain.com/unsubscribe";

export const SOURCES = {
  us: (process.env.SOURCES_US || "").split(",").map(s => s.trim()).filter(Boolean),
  eu: (process.env.SOURCES_EU || "").split(",").map(s => s.trim()).filter(Boolean),
  au: (process.env.SOURCES_AU || "").split(",").map(s => s.trim()).filter(Boolean),
};

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const GENERIC_LOCAL = new Set([
  "info","contact","sales","hello","admin","office","support",
  "enquiries","inquiry","marketing","webmaster","noreply","no-reply"
]);
