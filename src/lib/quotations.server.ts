import { db } from "./db.server";
import { buildTotals, newKey, recalcItem, round2, toNumber } from "./calc";
import type {
  DiamondPrice,
  DiamondRow,
  DiamondType,
  MetalPrice,
  Quotation,
  QuotationImage,
  QuotationItem,
} from "./types";

export const BUCKET = "quotation-images";
const SIGNED_URL_TTL = 60 * 60 * 24 * 7;

export const QUOTATION_COLUMNS =
  "id, customer_name, customer_address, customer_mobile, seller, quotation_date, items, show_summary, margin_pct, totals, id_sku, category, images, currency, pdf_visibility, customer_id, applied_rates";

export async function getMetalPriceMap(): Promise<Record<string, MetalPrice>> {
  const { data, error } = await db.from("metal_prices").select("*").order("sort_order");
  if (error) throw new Error(error.message);
  const map: Record<string, MetalPrice> = {};
  for (const row of data ?? []) {
    map[row.purity] = {
      purity: row.purity,
      price: toNumber(row.price),
      making_charge: toNumber(row.making_charge),
      sort_order: row.sort_order,
      manual: Boolean(row.manual),
    };
  }
  return map;
}

export async function getDiamondPrices(): Promise<DiamondPrice[]> {
  const { data, error } = await db
    .from("diamond_prices")
    .select("id, shape, size_label, size_order, lgd_price_ct, moiss_price_ct")
    .order("shape")
    .order("size_order");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: Number(row.id),
    shape: String(row.shape).trim(),
    size_label: String(row.size_label).trim(),
    size_order: Number(row.size_order),
    lgd_price_ct: toNumber(row.lgd_price_ct),
    moiss_price_ct: toNumber(row.moiss_price_ct),
  }));
}

export async function signImages(images: QuotationImage[]): Promise<QuotationImage[]> {
  const paths = images.map((i) => i.path).filter(Boolean);
  if (!paths.length) return [];
  const { data, error } = await db.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL);
  if (error) return images;
  return paths.map((path, index) => ({
    path,
    url: data?.[index]?.signedUrl ?? images[index]?.url ?? "",
  }));
}

type QuotationRow = {
  id: string;
  customer_name: string | null;
  customer_address: string | null;
  customer_mobile: string | null;
  seller: string | null;
  quotation_date: string;
  items: unknown;
  show_summary: boolean | null;
  margin_pct: number | string | null;
  totals: unknown;
  id_sku: string | null;
  category: string | null;
  images: unknown;
  currency?: string | null;
  pdf_visibility?: unknown;
  customer_id?: string | null;
  applied_rates?: unknown;
};

function text(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function normalizeImages(value: unknown): QuotationImage[] {
  return (Array.isArray(value) ? value : [])
    .map((raw) => {
      const i = raw as Record<string, unknown>;
      return { path: text(i["path"]), url: text(i["url"]) };
    })
    .filter((i) => i.path);
}

function normalizeDiamondRow(raw: unknown): DiamondRow {
  const d = (raw ?? {}) as Record<string, unknown>;
  const type: DiamondType = text(d["type"]) === "Moissanite" ? "Moissanite" : "Lab-Grown";
  return {
    key: text(d["key"]) || newKey("d"),
    description: text(d["description"]),
    type,
    shape: text(d["shape"]),
    size: text(d["size"]),
    color: text(d["color"]),
    clarity: text(d["clarity"]),
    cut: text(d["cut"]),
    certificate: text(d["certificate"]),
    pieces: Math.max(0, Math.round(toNumber(d["pieces"]))),
    totalWeightCt: round2(toNumber(d["totalWeightCt"])),
    pricePerCt: round2(toNumber(d["pricePerCt"])),
    amount: round2(toNumber(d["amount"])),
    // Older rows stored one price for their type; carry it into that type's rate.
    lgdPricePerCt: round2(
      toNumber(d["lgdPricePerCt"]) || (type === "Lab-Grown" ? toNumber(d["pricePerCt"]) : 0),
    ),
    moissPricePerCt: round2(
      toNumber(d["moissPricePerCt"]) || (type === "Moissanite" ? toNumber(d["pricePerCt"]) : 0),
    ),
    lgdAmount: 0,
    moissAmount: 0,
    lgdRateFinal: 0,
    moissRateFinal: 0,
    link: text(d["link"]),
    rowMarginOn: d["rowMarginOn"] === true,
    rowMarginPct: Math.max(0, toNumber(d["rowMarginPct"])),
    baseAmount: 0,
  };
}

function normalizeItem(raw: unknown): QuotationItem {
  const i = (raw ?? {}) as Record<string, unknown>;
  return recalcItem({
    key: text(i["key"]) || newKey("i"),
    idSku: text(i["idSku"]),
    category: text(i["category"]),
    images: normalizeImages(i["images"]),
    metalPurity: text(i["metalPurity"]),
    metalGrams: toNumber(i["metalGrams"]),
    metalRatePerGram: toNumber(i["metalRatePerGram"]),
    metalAmount: toNumber(i["metalAmount"]),
    makingRatePerGram: toNumber(i["makingRatePerGram"]),
    makingCharges: toNumber(i["makingCharges"]),
    diamonds: (Array.isArray(i["diamonds"]) ? i["diamonds"] : []).map((raw) => normalizeDiamondRow({ ...((raw ?? {}) as Record<string, unknown>), type: ((raw ?? {}) as Record<string, unknown>)["type"] ?? i["diamondType"] })),
    diamondType: text(i["diamondType"]) === "Moissanite" ? "Moissanite" : "Lab-Grown",
    diamondAmount: toNumber(i["diamondAmount"]),
    subtotal: toNumber(i["subtotal"]),
    baseGrams14: toNumber(i["baseGrams14"]),
    goldRate14: toNumber(i["goldRate14"]),
    silverRate: toNumber(i["silverRate"]),
    platinumRate: toNumber(i["platinumRate"]),
    goldMakingRate: toNumber(i["goldMakingRate"]),
    silverMakingRate: toNumber(i["silverMakingRate"]),
    platinumMakingRate: toNumber(i["platinumMakingRate"]),
    metalOptions: (Array.isArray(i["metalOptions"]) ? i["metalOptions"] : []).map((raw) => {
      const o = (raw ?? {}) as Record<string, unknown>;
      return {
        purity: text(o["purity"]),
        grams: toNumber(o["grams"]),
        ratePerGram: toNumber(o["ratePerGram"]),
        makingRatePerGram: 0,
        metalAmount: 0,
        makingCharges: 0,
        total: 0,
        visible: o["visible"] !== false,
      };
    }),
    lgdAmount: 0,
    moissAmount: 0,
    diamondMarginPct: toNumber(i["diamondMarginPct"]),
    stackItemMargin: i["stackItemMargin"] === true,
  });
}

export function normalizeItems(value: unknown): QuotationItem[] {
  return (Array.isArray(value) ? value : []).map(normalizeItem);
}

export function rowToQuotation(row: QuotationRow): Quotation {
  const items = normalizeItems(row.items);
  const marginPct = toNumber(row.margin_pct);
  const first = items[0];
  const vis = (row.pdf_visibility ?? {}) as Record<string, unknown>;
  const legacyShow = row.show_summary !== false;
  const flag = (k: string) => (typeof vis[k] === "boolean" ? (vis[k] as boolean) : legacyShow);
  return {
    id: row.id,
    customerId: text(row.customer_id),
    currency: row.currency === "USD" ? "USD" : "INR",
    pdfVisibility: {
      metal: flag("metal"),
      making: flag("making"),
      diamond: flag("diamond"),
      subtotal: flag("subtotal"),
      margin: flag("margin"),
    },
    customerName: text(row.customer_name),
    customerAddress: text(row.customer_address),
    customerMobile: text(row.customer_mobile),
    seller: text(row.seller),
    quotationDate: row.quotation_date,
    items,
    showSummary: row.show_summary !== false,
    marginPct,
    // Recomputed on read so a stored total can never drift from the stored rows.
    totals: buildTotals(items, marginPct),
    idSku: text(row.id_sku) || first?.idSku || "",
    category: text(row.category) || first?.category || "",
    images: normalizeImages(row.images).length
      ? normalizeImages(row.images)
      : (first?.images ?? []),
    appliedRates: (row.applied_rates && typeof row.applied_rates === "object" ? row.applied_rates : {}) as Quotation["appliedRates"],
  };
}

export async function nextQuotationId(): Promise<string> {
  const { data, error } = await db.rpc("next_quotation_id");
  if (error) throw new Error(error.message);
  return String(data);
}

/** Re-signs every image path inside a quotation (item images + the cover). */
export async function signQuotationImages(quotation: Quotation): Promise<Quotation> {
  const all = [...quotation.items.flatMap((i) => i.images), ...quotation.images];
  const signed = await signImages(all);
  const urlByPath = new Map(signed.map((i) => [i.path, i.url]));
  const apply = (images: QuotationImage[]) =>
    images.map((i) => ({ path: i.path, url: urlByPath.get(i.path) ?? i.url }));
  return {
    ...quotation,
    items: quotation.items.map((item) => ({ ...item, images: apply(item.images) })),
    images: apply(quotation.images),
  };
}
