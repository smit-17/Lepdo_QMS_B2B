import { db } from "./db.server";

export const GOLD_SOURCE_URL = "https://allindiabullion.com/gold-rate/gujarat/surat";
export const FX_SOURCE_URL = "https://open.er-api.com/v6/latest/USD";

export type RateReading = {
  value: number;
  source: string;
  updatedAt: string;
  /** "live" = fetched from the source, "manual" = typed by the user. */
  kind: "live" | "manual";
};

export type LiveRatesResult = {
  gold: RateReading | null;
  goldStale: boolean;
  goldError: string | null;
  fx: RateReading | null;
  fxStale: boolean;
  fxError: string | null;
  checkedAt: string;
};

async function readConfig(key: string): Promise<RateReading | null> {
  const { data } = await db.from("app_config").select("value").eq("key", key).maybeSingle();
  if (!data?.value) return null;
  try {
    return JSON.parse(data.value) as RateReading;
  } catch {
    return null;
  }
}

async function writeConfig(key: string, reading: RateReading) {
  await db
    .from("app_config")
    .upsert({ key, value: JSON.stringify(reading), updated_at: new Date().toISOString() }, { onConflict: "key" });
}

/** Finds the Surat 24 KT per-10 g rate in the page text. Returns null when it cannot be read reliably. */
export function parseSurat24k(html: string): number | null {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&#8377;|&#x20b9;/gi, "₹")
    .replace(/\s+/g, " ");
  const re = /24\s*(?:K|KT|Karat|Carat|Ct)\b[^₹\d]{0,80}?(?:₹|Rs\.?|INR)?\s*([\d,]{5,9}(?:\.\d+)?)/gi;
  for (const m of text.matchAll(re)) {
    const n = Number(String(m[1]).replace(/,/g, ""));
    // Plausible INR per 10 g range; anything else is not trusted.
    if (n >= 30000 && n <= 1000000) return n;
  }
  return null;
}

const FIRECRAWL_GATEWAY = "https://connector-gateway.lovable.dev/firecrawl/v2";
const FIRECRAWL_DIRECT = "https://api.firecrawl.dev/v2";

/**
 * Reads the Surat page through Firecrawl, which renders it in a real browser so Cloudflare does not block it.
 * Two auth modes: a direct Firecrawl key (starts with "fc-", e.g. self-hosted on Vercel) calls the Firecrawl
 * API directly; a Lovable connection key ("lovc_...") goes through the Lovable connector gateway.
 */
async function fetchGold(): Promise<RateReading> {
  const firecrawlKey = process.env["FIRECRAWL_API_KEY"];
  if (!firecrawlKey) {
    throw new Error("Firecrawl connection is not set up");
  }
  const direct = firecrawlKey.startsWith("fc-");
  const lovableKey = process.env["LOVABLE_API_KEY"];
  if (!direct && !lovableKey) {
    throw new Error("Firecrawl connection is not set up");
  }
  const res = await fetch(`${direct ? FIRECRAWL_DIRECT : FIRECRAWL_GATEWAY}/scrape`, {
    method: "POST",
    headers: direct
      ? { "Content-Type": "application/json", Authorization: `Bearer ${firecrawlKey}` }
      : {
          "Content-Type": "application/json",
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": firecrawlKey,
        },
    body: JSON.stringify({ url: GOLD_SOURCE_URL, formats: ["markdown", "html"], onlyMainContent: false }),
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Gold-rate reader failed [${res.status}]: ${body.slice(0, 200)}`);
  }
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(body) as Record<string, unknown>;
  } catch {
    throw new Error("Gold-rate reader returned an unreadable response");
  }
  const inner = (data["data"] ?? data) as { markdown?: string; html?: string };
  const value = parseSurat24k(inner.markdown ?? "") ?? parseSurat24k(inner.html ?? "");
  if (!value) throw new Error("Could not find the 24 KT rate on the Surat page");
  return { value, source: GOLD_SOURCE_URL, updatedAt: new Date().toISOString(), kind: "live" };
}

async function fetchFx(): Promise<RateReading> {
  const res = await fetch(FX_SOURCE_URL);
  if (!res.ok) throw new Error(`Exchange-rate source returned ${res.status}`);
  const json = (await res.json()) as { result?: string; rates?: Record<string, number>; time_last_update_unix?: number };
  const inr = json.rates?.["INR"];
  if (json.result !== "success" || !inr || inr < 20 || inr > 500) throw new Error("Exchange-rate source gave no valid USD/INR rate");
  return {
    value: inr,
    source: "open.er-api.com (ExchangeRate-API)",
    updatedAt: json.time_last_update_unix ? new Date(json.time_last_update_unix * 1000).toISOString() : new Date().toISOString(),
    kind: "live",
  };
}

export async function getLiveRatesImpl(): Promise<LiveRatesResult> {
  const [goldR, fxR] = await Promise.allSettled([fetchGold(), fetchFx()]);
  let gold: RateReading | null = null;
  let goldError: string | null = null;
  if (goldR.status === "fulfilled") {
    gold = goldR.value;
    await writeConfig("live_gold_24k", gold).catch(() => {});
  } else {
    goldError = goldR.reason instanceof Error ? goldR.reason.message : "Gold source unavailable";
    gold = await readConfig("live_gold_24k");
  }
  let fx: RateReading | null = null;
  let fxError: string | null = null;
  if (fxR.status === "fulfilled") {
    fx = fxR.value;
    await writeConfig("live_fx_usd_inr", fx).catch(() => {});
  } else {
    fxError = fxR.reason instanceof Error ? fxR.reason.message : "Exchange-rate source unavailable";
    fx = await readConfig("live_fx_usd_inr");
  }
  return {
    gold,
    goldStale: goldR.status !== "fulfilled",
    goldError,
    fx,
    fxStale: fxR.status !== "fulfilled",
    fxError,
    checkedAt: new Date().toISOString(),
  };
}

/** Manual fallback: the user types today's Surat 24 KT rate per 10 g. Clearly labelled as manual. */
export async function setManualGoldImpl(inrPer10g: number): Promise<RateReading> {
  const reading: RateReading = {
    value: inrPer10g,
    source: `Entered manually (from ${GOLD_SOURCE_URL})`,
    updatedAt: new Date().toISOString(),
    kind: "manual",
  };
  await writeConfig("live_gold_24k", reading);
  return reading;
}
