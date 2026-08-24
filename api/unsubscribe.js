import { suppress } from "../lib/suppress.js";

const page = (email) => `<!doctype html><html><head><meta charset="utf-8"><title>Unsubscribed</title></head>
<body style="font-family:Arial,sans-serif;max-width:480px;margin:80px auto;text-align:center;color:#222">
  <h1>You're unsubscribed</h1>
  <p>${email ? `<b>${email}</b> has been` : "You've been"} removed from our outreach list.</p>
  <p style="color:#888;font-size:13px">We won't email this address again.</p>
</body></html>`;

export default async function handler(req, res) {
  const url = new URL(req.url);
  const email = (url.searchParams.get("email") || "").trim();
  let shown = "";
  if (email) shown = (await suppress(email)) ? email : "";
  res.setHeader("Content-Type", "text/html");
  res.statusCode = 200;
  res.end(page(shown));
}
