import type {
  Currency,
  DiamondPrice,
  DiamondRow,
  DiamondType,
  MetalOption,
  MetalPrice,
  QuotationItem,
  QuotationTotals,
} from "./types";
import { METAL_OPTION_FACTORS } from "./types";

/**
 * Gold rate is entered once for 24KT; other karats are a fixed percentage of it:
 *   18KT = 76%, 14KT = 62%, 10KT = 41% (22KT = 22/24).
 */
export const GOLD_KARATS: { purity: string; karat: number; pct: number }[] = [
  { purity: "24KT", karat: 24, pct: 100 },
  { purity: "22KT", karat: 22, pct: (22 / 24) * 100 },
  { purity: "18KT", karat: 18, pct: 76 },
  { purity: "14KT", karat: 14, pct: 62 },
  { purity: "10KT", karat: 10, pct: 41 },
];
export const GOLD_BASE = "24KT";
export const GOLD_PURITIES = GOLD_KARATS.map((g) => g.purity);

export function isGoldPurity(purity: string): boolean {
  return GOLD_PURITIES.includes(purity);
}

export function autoGoldRate(gold14: number, purity: string): number {
  const k = GOLD_KARATS.find((g) => g.purity === purity);
  return k ? round2((toNumber(gold14) * k.pct) / 100) : 0;
}

export type MasterPrices = {
  gold14: number;
  silver: number;
  platinum: number;
  goldMaking: number;
  silverMaking: number;
  platinumMaking: number;
  /** Manual per-karat overrides (purity -> rate). Missing = automatic. */
  overrides: Record<string, number>;
};

/** Expands the master inputs into the full metal price table. */
export function deriveMetalPrices(master: MasterPrices): MetalPrice[] {
  const gold = GOLD_KARATS.map(({ purity }, index) => {
    const override = purity === GOLD_BASE ? undefined : master.overrides?.[purity];
    const manual = override !== undefined && override !== null;
    return {
      purity,
      price: manual ? round2(toNumber(override)) : autoGoldRate(master.gold14, purity),
      making_charge: round2(toNumber(master.goldMaking)),
      sort_order: index,
      manual,
    };
  });
  return [
    ...gold,
    {
      purity: "Silver",
      price: round2(toNumber(master.silver)),
      making_charge: round2(toNumber(master.silverMaking)),
      sort_order: gold.length,
      manual: false,
    },
    {
      purity: "Platinum",
      price: round2(toNumber(master.platinum)),
      making_charge: round2(toNumber(master.platinumMaking)),
      sort_order: gold.length + 1,
      manual: false,
    },
  ];
}

export function mastersFromPrices(prices: MetalPrice[]): MasterPrices {
  const find = (p: string) => prices.find((row) => row.purity === p);
  const overrides: Record<string, number> = {};
  for (const row of prices) if (row.manual && isGoldPurity(row.purity)) overrides[row.purity] = row.price;
  return {
    gold14: toNumber(find(GOLD_BASE)?.price),
    silver: toNumber(find("Silver")?.price),
    platinum: toNumber(find("Platinum")?.price),
    goldMaking: toNumber(find(GOLD_BASE)?.making_charge),
    silverMaking: toNumber(find("Silver")?.making_charge),
    platinumMaking: toNumber(find("Platinum")?.making_charge),
    overrides,
  };
}

/** Making rate is per metal (same for every gold karat). */
export function makingRateFor(prices: MetalPrice[], purity: string): number {
  const key = isGoldPurity(purity) ? GOLD_BASE : purity;
  return toNumber(prices.find((p) => p.purity === key)?.making_charge);
}

export function metalRateFor(prices: MetalPrice[], purity: string): number {
  return toNumber(prices.find((p) => p.purity === purity)?.price);
}

export function round2(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function toNumber(value: unknown): number {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : 0;
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(round2(toNumber(value)));
}

/** Indian Rupee display format, e.g. ₹1,25,000.00 */
export function formatINR(value: number): string {
  return `₹${formatMoney(value)}`;
}

/** Formats in the quotation's currency. Only the symbol/grouping changes — never converts. */
export function formatCurrency(value: number, currency: Currency = "INR"): string {
  if (currency === "USD") {
    return `$${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(round2(toNumber(value)))}`;
  }
  return formatINR(value);
}

export function currencySymbol(currency: Currency = "INR"): string {
  return currency === "USD" ? "$" : "₹";
}

/* ---------- Diamond price chart lookups ---------- */

export const DOWN_BAND = "1CT DOWN";
export const MIX_SHAPE = "MIX";

/** Suggests a price-list size band from a total carat weight (used only as a default). */
export function sizeBandFor(weightCt: number): string {
  const weight = toNumber(weightCt);
  if (weight < 1) return DOWN_BAND;
  return `${Math.min(10, Math.floor(weight))} CT`;
}

function normalizeLabel(value: string): string {
  return String(value).trim().toUpperCase().replace(/\s+/g, " ");
}

export function shapesFrom(prices: DiamondPrice[]): string[] {
  return [...new Set(prices.map((d) => d.shape.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

/** Size bands available for a shape, in price-chart order. */
export function sizeLabelsFor(prices: DiamondPrice[], shape: string): string[] {
  if (!shape) return [];
  const wanted = normalizeLabel(shape);
  return [...prices.filter((p) => normalizeLabel(p.shape) === wanted)]
    .sort((a, b) => a.size_order - b.size_order)
    .map((p) => p.size_label.trim())
    .filter((label, index, all) => all.indexOf(label) === index);
}

export type DiamondRates = { lgd: number; moiss: number };

/** Looks up both LGD and Moissanite per-carat rates for a shape + size band. */
export function lookupRates(
  prices: DiamondPrice[],
  shape: string,
  sizeLabel: string,
): DiamondRates {
  if (!shape || !sizeLabel) return { lgd: 0, moiss: 0 };
  const wantedShape = normalizeLabel(shape);
  const wantedSize = normalizeLabel(sizeLabel);
  const row = prices.find(
    (p) => normalizeLabel(p.shape) === wantedShape && normalizeLabel(p.size_label) === wantedSize,
  );
  return {
    lgd: round2(toNumber(row?.lgd_price_ct)),
    moiss: round2(toNumber(row?.moiss_price_ct)),
  };
}

/** Per-carat rate from the chart for the diamond type chosen on that row. */
export function rateForType(
  prices: DiamondPrice[],
  shape: string,
  sizeLabel: string,
  type: DiamondType,
): number {
  const rates = lookupRates(prices, shape, sizeLabel);
  return type === "Moissanite" ? rates.moiss : rates.lgd;
}

/* ---------- Row / item / quotation maths ---------- */

let rowCounter = 0;
export function newKey(prefix: string): string {
  rowCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${rowCounter}`;
}

export function emptyDiamondRow(): DiamondRow {
  return {
    key: newKey("d"),
    description: "",
    type: "Lab-Grown",
    shape: "",
    size: "",
    color: "",
    clarity: "",
    cut: "",
    certificate: "",
    pieces: 1,
    totalWeightCt: 0,
    pricePerCt: 0,
    amount: 0,
    lgdPricePerCt: 0,
    moissPricePerCt: 0,
    lgdAmount: 0,
    moissAmount: 0,
    lgdRateFinal: 0,
    moissRateFinal: 0,
    link: "",
    rowMarginOn: false,
    rowMarginPct: 0,
    baseAmount: 0,
  };
}

/** Returns a safe http(s) URL for a diamond link, or null when it is not a valid web address. */
export function safeUrl(raw: string): string | null {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  const withProto = /^https?:\/\//i.test(v) ? v : /^www\./i.test(v) ? `https://${v}` : "";
  if (!withProto) return null;
  try {
    const u = new URL(withProto);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Step 5 — row amount = Total Weight (ct) x Price per Carat.
 * Item margin % (Diamond step) raises the price per carat. A row with its own
 * "Add Margin" uses markup on cost instead:
 *   base = weight x base rate; row margin = base x row% / 100; selling = base + row margin.
 * The item margin is only stacked on such rows when `stackItemMargin` is explicitly on.
 */
export function withDiamondAmount(row: DiamondRow, marginPct = 0, stackItemMargin = false): DiamondRow {
  const totalWeightCt = round2(toNumber(row.totalWeightCt));
  const rowMarginOn = Boolean(row.rowMarginOn) && toNumber(row.rowMarginPct) > 0;
  const rowMarginPct = round2(Math.max(0, toNumber(row.rowMarginPct)));
  const itemPct = rowMarginOn && !stackItemMargin ? 0 : toNumber(marginPct);
  const m = (1 + itemPct / 100) * (1 + (rowMarginOn ? rowMarginPct : 0) / 100);
  const lgdBase = round2(toNumber(row.lgdPricePerCt));
  const moissBase = round2(toNumber(row.moissPricePerCt));
  const lgdRateFinal = round2(lgdBase * m);
  const moissRateFinal = round2(moissBase * m);
  const pricePerCt = row.type === "Moissanite" ? moissRateFinal : lgdRateFinal;
  const baseRate = row.type === "Moissanite" ? moissBase : lgdBase;
  return {
    ...row,
    size: String(row.size ?? ""),
    pieces: Math.max(0, Math.round(toNumber(row.pieces))),
    totalWeightCt,
    rowMarginOn: Boolean(row.rowMarginOn),
    rowMarginPct,
    baseAmount: round2(totalWeightCt * baseRate),
    lgdPricePerCt: lgdBase,
    moissPricePerCt: moissBase,
    lgdRateFinal,
    moissRateFinal,
    lgdAmount: round2(totalWeightCt * lgdRateFinal),
    moissAmount: round2(totalWeightCt * moissRateFinal),
    pricePerCt,
    amount: round2(totalWeightCt * pricePerCt),
  };
}

export function emptyItem(defaults?: Partial<QuotationItem>): QuotationItem {
  return recalcItem({
    key: newKey("i"),
    idSku: "",
    category: "",
    images: [],
    metalPurity: "",
    metalGrams: 0,
    metalRatePerGram: 0,
    metalAmount: 0,
    makingRatePerGram: 0,
    makingCharges: 0,
    diamonds: [],
    diamondType: "Lab-Grown",
    diamondAmount: 0,
    subtotal: 0,
    baseGrams14: 0,
    goldRate14: 0,
    silverRate: 0,
    platinumRate: 0,
    goldMakingRate: 0,
    silverMakingRate: 0,
    platinumMakingRate: 0,
    metalOptions: [],
    lgdAmount: 0,
    moissAmount: 0,
    diamondMarginPct: 0,
    stackItemMargin: false,
    ...defaults,
  });
}

function makingRateForOption(item: QuotationItem, purity: string): number {
  const spec = METAL_OPTION_FACTORS.find((f) => f.purity === purity);
  if (spec?.making === "silver") return toNumber(item.silverMakingRate);
  if (spec?.making === "platinum") return toNumber(item.platinumMakingRate);
  return toNumber(item.goldMakingRate);
}

/** Metal amount = grams x rate; making = grams x applicable making rate; total = both. */
/** Rate per gram from the item's rate inputs (gold: 24KT base x karat %). 0 = not entered. */
export function optionRateFor(item: QuotationItem, purity: string): number {
  if (purity === "Silver") return round2(toNumber(item.silverRate));
  if (purity === "Platinum") return round2(toNumber(item.platinumRate));
  const k = GOLD_KARATS.find((g) => g.purity === purity);
  return k ? round2((toNumber(item.goldRate14) * k.pct) / 100) : 0;
}

export function recalcOption(item: QuotationItem, option: MetalOption): MetalOption {
  const grams = round3(toNumber(option.grams));
  // Weight factors never touch rates; rates come only from the rate inputs.
  const ratePerGram = optionRateFor(item, option.purity) || round2(toNumber(option.ratePerGram));
  const makingRatePerGram = round2(makingRateForOption(item, option.purity));
  const metalAmount = round2(grams * ratePerGram);
  const makingCharges = round2(grams * makingRatePerGram);
  return {
    purity: option.purity,
    grams,
    ratePerGram,
    makingRatePerGram,
    metalAmount,
    makingCharges,
    total: round2(metalAmount + makingCharges),
    visible: option.visible !== false,
  };
}

export function round3(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
}

/**
 * Auto-convert from 14KT: builds / updates exactly the five option rows
 * (weight factors 18KT 1.17, 14KT 1.00, 10KT 0.88, Silver 0.80, Platinum 1.66).
 * Existing rates and visibility are kept; missing rates prefill from saved prices.
 */
export function convertFrom14(item: QuotationItem, prices: MetalPrice[]): QuotationItem {
  const base = toNumber(item.baseGrams14);
  const metalOptions = METAL_OPTION_FACTORS.map(({ purity, factor }) => {
    const existing = item.metalOptions.find((o) => o.purity === purity);
    return {
      purity,
      grams: round3(base * factor),
      ratePerGram: optionRateFor(item, purity) || existing?.ratePerGram || metalRateFor(prices, purity),
      makingRatePerGram: 0,
      metalAmount: 0,
      makingCharges: 0,
      total: 0,
      visible: existing ? existing.visible : true,
    };
  });
  return recalcItem({ ...item, metalOptions });
}

export type OptionRow = MetalOption & {
  lgdAmount: number;
  moissAmount: number;
  selectedAmount: number;
  selectedTotal: number;
  selectedFinal: number;
  totalLgd: number;
  totalMoiss: number;
  finalLgd: number;
  finalMoiss: number;
};

/** Reference-style summary: each metal option is an alternative, never summed together. */
export function optionRows(item: QuotationItem, marginPct = 0): OptionRow[] {
  const m = 1 + toNumber(marginPct) / 100;
  return item.metalOptions.map((o) => {
    const totalLgd = round2(o.total + item.lgdAmount);
    const totalMoiss = round2(o.total + item.moissAmount);
    const selectedTotal = round2(o.total + item.diamondAmount);
    return {
      ...o,
      lgdAmount: item.lgdAmount,
      moissAmount: item.moissAmount,
      selectedAmount: item.diamondAmount,
      selectedTotal,
      selectedFinal: round2(selectedTotal * m),
      totalLgd,
      totalMoiss,
      finalLgd: round2(totalLgd * m),
      finalMoiss: round2(totalMoiss * m),
    };
  });
}

/**
 * Legacy single-metal fields (used by lists/search) mirror the first visible
 * metal option with the LGD diamond amount. Old quotations without options
 * keep their single-metal maths.
 */
export function recalcItem(item: QuotationItem): QuotationItem {
  const diamondMarginPct = round2(toNumber(item.diamondMarginPct));
  const diamondType: DiamondType = item.diamondType === "Moissanite" ? "Moissanite" : "Lab-Grown";
  const diamonds = (item.diamonds ?? []).map((d) => withDiamondAmount({ ...d, type: d.type === "Moissanite" ? "Moissanite" : "Lab-Grown" }, diamondMarginPct, Boolean(item.stackItemMargin)));
  const lgdAmount = round2(diamonds.reduce((sum, d) => sum + (d.type === "Lab-Grown" ? d.lgdAmount : 0), 0));
  const moissAmount = round2(diamonds.reduce((sum, d) => sum + (d.type === "Moissanite" ? d.moissAmount : 0), 0));
  const selectedDiamondAmount = round2(lgdAmount + moissAmount);
  const base = {
    ...item,
    baseGrams14: round3(toNumber(item.baseGrams14)),
    goldRate14: round2(toNumber(item.goldRate14)),
    silverRate: round2(toNumber(item.silverRate)),
    platinumRate: round2(toNumber(item.platinumRate)),
    goldMakingRate: round2(toNumber(item.goldMakingRate)),
    silverMakingRate: round2(toNumber(item.silverMakingRate)),
    platinumMakingRate: round2(toNumber(item.platinumMakingRate)),
    diamondMarginPct,
    stackItemMargin: Boolean(item.stackItemMargin),
    diamondType,
    diamonds,
    lgdAmount,
    moissAmount,
  };
  const metalOptions = (item.metalOptions ?? []).map((o) => recalcOption(base, o));
  const primary = metalOptions.find((o) => o.visible && o.grams > 0) ?? metalOptions[0];
  if (primary) {
    return {
      ...base,
      metalOptions,
      metalPurity: primary.purity,
      metalGrams: primary.grams,
      metalRatePerGram: primary.ratePerGram,
      makingRatePerGram: primary.makingRatePerGram,
      metalAmount: primary.metalAmount,
      makingCharges: primary.makingCharges,
       diamondAmount: selectedDiamondAmount,
       subtotal: round2(primary.total + selectedDiamondAmount),
    };
  }
  const metalGrams = round2(toNumber(item.metalGrams));
  const metalRatePerGram = round2(toNumber(item.metalRatePerGram));
  const makingRatePerGram = round2(toNumber(item.makingRatePerGram));
  const metalAmount = round2(metalGrams * metalRatePerGram);
  const makingCharges = round2(metalGrams * makingRatePerGram);
  const diamondAmount = round2(diamonds.reduce((sum, d) => sum + toNumber(d.amount), 0));
  return {
    ...base,
    metalOptions,
    metalGrams,
    metalRatePerGram,
    makingRatePerGram,
    metalAmount,
    makingCharges,
    diamondAmount,
    subtotal: round2(metalAmount + makingCharges + diamondAmount),
  };
}

/** A mixed item prints one combined selected-row total, never unselected alternatives. */
export function diamondLabelFor(item: QuotationItem): string {
  const types = new Set(item.diamonds.map((d) => d.type));
  return types.size > 1 ? "Diamonds" : (types.has("Moissanite") || (!types.size && item.diamondType === "Moissanite")) ? "Moissanite" : "Lab-Grown";
}

/** An item counts only once it has an SKU or any entered data. */
export function isItemFilled(item: QuotationItem): boolean {
  return Boolean(
    item.idSku.trim() || item.baseGrams14 > 0 || item.metalGrams > 0 || item.diamonds.length || item.images.length,
  );
}

export function itemDiamondWeight(item: QuotationItem): number {
  return round2(item.diamonds.reduce((sum, d) => sum + toNumber(d.totalWeightCt), 0));
}

/**
 * Step 7 — margin is a markup on cost:
 *   margin amount   = items subtotal x margin% / 100
 *   final selling   = items subtotal + margin amount
 */
export function buildTotals(items: QuotationItem[], marginPct: number): QuotationTotals {
  const priced = items.map(recalcItem);
  const itemsSubtotal = round2(priced.reduce((sum, i) => sum + toNumber(i.subtotal), 0));
  const pct = round2(toNumber(marginPct));
  const marginAmount = round2((itemsSubtotal * pct) / 100);
  return {
    itemsSubtotal,
    marginPct: pct,
    marginAmount,
    finalAmount: round2(itemsSubtotal + marginAmount),
    totalMetalGrams: round2(priced.reduce((sum, i) => sum + toNumber(i.metalGrams), 0)),
    totalDiamondWeight: round2(priced.reduce((sum, i) => sum + itemDiamondWeight(i), 0)),
    totalMetalAmount: round2(priced.reduce((sum, i) => sum + toNumber(i.metalAmount), 0)),
    totalMakingCharges: round2(priced.reduce((sum, i) => sum + toNumber(i.makingCharges), 0)),
    totalDiamondAmount: round2(priced.reduce((sum, i) => sum + toNumber(i.diamondAmount), 0)),
  };
}

export function todayInputValue(date?: string | Date): string {
  const d = date ? new Date(date) : new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
