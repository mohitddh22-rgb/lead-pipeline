import { Redis } from "@upstash/redis";

let client = null;
function getRedis() {
  if (client) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  client = new Redis({ url, token });
  return client;
}

const KEY = "lead:skews:suppressions";

export async function suppress(email) {
  const e = (email || "").toLowerCase().trim();
  if (!e) return false;
  const r = getRedis();
  if (!r) {
    console.warn("[suppress] UPSTASH_REDIS not configured; opt-out NOT persisted");
    return false;
  }
  await r.sadd(KEY, e);
  return true;
}

export async function isSuppressed(email) {
  const e = (email || "").toLowerCase().trim();
  if (!e) return false;
  const r = getRedis();
  if (!r) return false; // without a store we can't confirm suppression
  return (await r.sismember(KEY, e)) === 1;
}
