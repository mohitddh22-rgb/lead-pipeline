export function queueEnabled() {
  return !!process.env.QSTASH_TOKEN;
}

// Publish a JSON job to a destination URL via QStash.
export async function enqueue(targetUrl, body, opts = {}) {
  const token = process.env.QSTASH_TOKEN;
  if (!token) throw new Error("QSTASH_TOKEN not set");
  const url = `https://qstash.upstash.io/v1/publish/${encodeURIComponent(targetUrl)}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (opts.delay) headers["Upstash-Delay"] = `${opts.delay}s`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`QStash publish ${res.status}: ${await res.text()}`);
  return res.json();
}

// Verify a QStash request signature. req is either a Node IncomingMessage
// (Vercel Functions) or a Fetch Request (App Router); rawBody is the string body.
export async function verifyQstash(req, rawBody) {
  const { Receiver } = await import("@upstash/qstash");
  const receiver = new Receiver({
    currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
    nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY,
  });
  const sig =
    typeof req.headers.get === "function"
      ? req.headers.get("upstash-signature")
      : req.headers["upstash-signature"];
  return receiver.verify({ signature: sig, body: rawBody });
}
