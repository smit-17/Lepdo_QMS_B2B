export type MetalPrice = {
  purity: string;
  price: number;
  making_charge: number;
  sort_order: number;
  /** True when the gold rate was typed manually instead of derived from 14KT. */
  manual?: boolean;
};

export const CURRENCIES = ["INR", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Step 6 — per summary row: show it in the PDF or hide it (calculations unaffected). */
export type PdfVisibility = {
  metal: boolean;
  making: boolean;
  diamond: boolean;
  subtotal: boolean;
  margin: boolean;
};
export const DEFAULT_PDF_VISIBILITY: PdfVisibility = {
  metal: true,
  making: true,
  diamond: true,
  subtotal: true,
  margin: true,
};

export type Customer = {
  id: string;
  name: string;
  mobile: string;
  address: string;
  seller: string;
};

/** Gold / exchange rates applied to a quotation via "Use Live Rate" (snapshot, never auto-updated). */
export type AppliedRates = {
  gold24InrPer10g?: number;
  goldSource?: string;
  goldUpdatedAt?: string;
  usdInr?: number;
  fxSource?: string;
  fxUpdatedAt?: string;
  appliedAt?: string;
  currency?: string;
};

/** One row of the master diamond price list (shape + carat size band). */
export type DiamondPrice = {
  id: number;
  shape: string;
  size_label: string;
  size_order: number;
  lgd_price_ct: number;
  moiss_price_ct: number;
};

export type QuotationImage = {
  path: string;
  url: string;
};

export const DIAMOND_TYPES = ["Lab-Grown", "Moissanite"] as const;
export type DiamondType = (typeof DIAMOND_TYPES)[number];

/**
 * Step 5 — one row of the diamond table.
 * `totalWeightCt` is already the combined weight of every stone in the row,
 * so the amount is weight x price per carat (pieces is informational only).
 */
export type DiamondRow = {
  /** Stable key for React; the printed SR number is the row position. */
  key: string;
  description: string;
  type: DiamondType;
  shape: string;
  size: string;
  color: string;
  clarity: string;
  cut: string;
  certificate: string;
  pieces: number;
  totalWeightCt: number;
  pricePerCt: number;
  amount: number;
  /** Lab-grown and Moissanite rates are both kept: they are alternative options. */
  lgdPricePerCt: number;
  moissPricePerCt: number;
  lgdAmount: number;
  moissAmount: number;
  /** Per-carat rates after the item's diamond margin % (derived). */
  lgdRateFinal: number;
  moissRateFinal: number;
  link: string;
  /** Optional per-row markup on cost (0 = none). */
  rowMarginOn: boolean;
  rowMarginPct: number;
  /** Derived: total weight x base price per carat for the row's type (internal cost). */
  baseAmount: number;
};

/** Metal alternatives generated from the 14KT base weight, in this fixed order. */
export const METAL_OPTION_FACTORS = [
  { purity: "18KT", factor: 1.17, making: "gold" },
  { purity: "14KT", factor: 1.0, making: "gold" },
  { purity: "10KT", factor: 0.88, making: "gold" },
  { purity: "Silver", factor: 0.8, making: "silver" },
  { purity: "Platinum", factor: 1.66, making: "platinum" },
] as const;

export type MetalOption = {
  purity: string;
  grams: number;
  ratePerGram: number;
  makingRatePerGram: number;
  metalAmount: number;
  makingCharges: number;
  /** Metal + making. */
  total: number;
  /** Shown in the customer PDF. Hidden options keep their data. */
  visible: boolean;
};

/** Steps 2-6 — one piece of jewellery inside the quotation. */
export type QuotationItem = {
  key: string;
  idSku: string;
  category: string;
  images: QuotationImage[];
  metalPurity: string;
  metalGrams: number;
  metalRatePerGram: number;
  metalAmount: number;
  makingRatePerGram: number;
  makingCharges: number;
  diamonds: DiamondRow[];
  /** The one diamond type quoted for this item; defaults to lab-grown for older quotations. */
  diamondType: DiamondType;
  diamondAmount: number;
  subtotal: number;
  /** 14KT base weight; all metal options derive from it. */
  baseGrams14: number;
  /** Rate inputs: gold is the 14KT base (18KT/10KT = rate x KT / 14). */
  goldRate14: number;
  silverRate: number;
  platinumRate: number;
  goldMakingRate: number;
  silverMakingRate: number;
  platinumMakingRate: number;
  metalOptions: MetalOption[];
  lgdAmount: number;
  moissAmount: number;
  /** Margin % added directly to every diamond price per carat (Diamond step). */
  diamondMarginPct: number;
  /** When true, the item margin % is also applied on rows that have their own row margin. */
  stackItemMargin: boolean;
};

/** Step 7 — quotation-wide money. Margin is a markup on cost. */
export type QuotationTotals = {
  itemsSubtotal: number;
  marginPct: number;
  marginAmount: number;
  finalAmount: number;
  totalMetalGrams: number;
  totalDiamondWeight: number;
  totalMetalAmount: number;
  totalMakingCharges: number;
  totalDiamondAmount: number;
};

export type Quotation = {
  id: string;
  customerId: string;
  currency: Currency;
  pdfVisibility: PdfVisibility;
  customerName: string;
  customerAddress: string;
  customerMobile: string;
  seller: string;
  quotationDate: string;
  items: QuotationItem[];
  /** Step 6 Show/Hide Summary — also controls the exported PDF. */
  showSummary: boolean;
  marginPct: number;
  totals: QuotationTotals;
  /** Denormalised from the first item, for list and search screens. */
  idSku: string;
  category: string;
  images: QuotationImage[];
  appliedRates: AppliedRates;
};

export const CATEGORIES = [
  "Ring",
  "Earring",
  "Pendant",
  "Bracelet",
  "Necklace",
  "Bangle",
  "Chain",
  "Other",
] as const;

export const DIAMOND_COLORS = ["D", "E", "F", "G", "H", "I", "J", "K", "Mixed"] as const;
export const DIAMOND_CLARITIES = [
  "FL",
  "IF",
  "VVS1",
  "VVS2",
  "VS1",
  "VS2",
  "SI1",
  "SI2",
  "Mixed",
] as const;
export const DIAMOND_CUTS = ["Excellent", "Very Good", "Good", "Fair"] as const;
