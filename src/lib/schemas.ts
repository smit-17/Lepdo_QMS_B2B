import { z } from "zod";

export const passwordChangeSchema = z.object({
  founderPassword: z.string().min(1),
  newPassword: z.string().min(4, "New password must be at least 4 characters"),
});

export const masterPricesSchema = z.object({
  gold14: z.number().min(0),
  silver: z.number().min(0),
  platinum: z.number().min(0),
  goldMaking: z.number().min(0),
  silverMaking: z.number().min(0),
  platinumMaking: z.number().min(0),
  overrides: z.record(z.string(), z.number().min(0)).default({}),
});
export type MasterPricesInput = z.infer<typeof masterPricesSchema>;

export const diamondPriceInputSchema = z.object({
  id: z.number().optional(),
  shape: z.string().trim().min(1),
  size_label: z.string().trim().min(1),
  size_order: z.number().int().min(0).default(0),
  lgd_price_ct: z.number().min(0),
  moiss_price_ct: z.number().min(0).default(0),
});
export type DiamondPriceInput = z.infer<typeof diamondPriceInputSchema>;

export const diamondBulkImportSchema = z.object({
  rows: z.array(diamondPriceInputSchema.omit({ id: true })).min(1),
  replaceAll: z.boolean().optional().default(false),
});
export type DiamondBulkImportInput = z.infer<typeof diamondBulkImportSchema>;

export const diamondBulkUpdateSchema = z.object({
  ids: z.array(z.number()).optional().default([]),
  applyToAll: z.boolean().optional().default(false),
  fields: z.array(z.enum(["lgd_price_ct", "moiss_price_ct"])).min(1),
  mode: z.enum(["percent", "amount"]),
  value: z.number(),
});
export type DiamondBulkUpdateInput = z.infer<typeof diamondBulkUpdateSchema>;

export const searchSchema = z.object({
  search: z.string().optional().default(""),
  category: z.string().optional().default(""),
  from: z.string().optional().default(""),
  to: z.string().optional().default(""),
  metal: z.string().optional().default(""),
  minAmount: z.number().optional().default(0),
  maxAmount: z.number().optional().default(0),
  /** newest | oldest | price_desc | price_asc */
  sort: z.string().optional().default("newest"),
  page: z.number().int().min(1).optional().default(1),
  pageSize: z.number().int().min(1).max(100).optional().default(20),
});
export type SearchInput = z.infer<typeof searchSchema>;

const diamondRowSchema = z.object({
  key: z.string().default(""),
  description: z.string().default(""),
  type: z.enum(["Lab-Grown", "Moissanite"]).default("Lab-Grown"),
  shape: z.string().default(""),
  size: z.string().default(""),
  color: z.string().default(""),
  clarity: z.string().default(""),
  cut: z.string().default(""),
  certificate: z.string().default(""),
  pieces: z.number().min(0).default(0),
  totalWeightCt: z.number().min(0).default(0),
  pricePerCt: z.number().min(0).default(0),
  amount: z.number().min(0).default(0),
  lgdPricePerCt: z.number().min(0).default(0),
  moissPricePerCt: z.number().min(0).default(0),
  lgdAmount: z.number().min(0).default(0),
  moissAmount: z.number().min(0).default(0),
  lgdRateFinal: z.number().min(0).default(0),
  moissRateFinal: z.number().min(0).default(0),
  link: z.string().default(""),
  rowMarginOn: z.boolean().default(false),
  rowMarginPct: z.number().min(0).default(0),
  baseAmount: z.number().min(0).default(0),
});

const quotationItemSchema = z.object({
  key: z.string().default(""),
  idSku: z.string().trim().min(1, "Every item needs an SKU"),
  category: z.string().trim().default(""),
  images: z.array(z.object({ path: z.string(), url: z.string() })).default([]),
  metalPurity: z.string().default(""),
  metalGrams: z.number().min(0).default(0),
  metalRatePerGram: z.number().min(0).default(0),
  metalAmount: z.number().min(0).default(0),
  makingRatePerGram: z.number().min(0).default(0),
  makingCharges: z.number().min(0).default(0),
  diamonds: z.array(diamondRowSchema).default([]),
  diamondType: z.enum(["Lab-Grown", "Moissanite"]).default("Lab-Grown"),
  diamondAmount: z.number().min(0).default(0),
  subtotal: z.number().min(0).default(0),
  baseGrams14: z.number().min(0).default(0),
  goldRate14: z.number().min(0).default(0),
  silverRate: z.number().min(0).default(0),
  platinumRate: z.number().min(0).default(0),
  goldMakingRate: z.number().min(0).default(0),
  silverMakingRate: z.number().min(0).default(0),
  platinumMakingRate: z.number().min(0).default(0),
  metalOptions: z
    .array(
      z.object({
        purity: z.string(),
        grams: z.number().min(0),
        ratePerGram: z.number().min(0),
        makingRatePerGram: z.number().min(0).default(0),
        metalAmount: z.number().min(0).default(0),
        makingCharges: z.number().min(0).default(0),
        total: z.number().min(0).default(0),
        visible: z.boolean().default(true),
      }),
    )
    .default([]),
  lgdAmount: z.number().min(0).default(0),
  moissAmount: z.number().min(0).default(0),
  diamondMarginPct: z.number().min(0).default(0),
  stackItemMargin: z.boolean().default(false),
});

export const customerSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Customer name is required"),
  mobile: z.string().trim().default(""),
  address: z.string().trim().default(""),
  seller: z.string().trim().default(""),
});
export type CustomerInput = z.infer<typeof customerSchema>;

export const quotationSchema = z.object({
  id: z.string().optional(),
  customerId: z.string().optional().default(""),
  currency: z.enum(["INR", "USD"]),
  pdfVisibility: z
    .object({
      metal: z.boolean(),
      making: z.boolean(),
      diamond: z.boolean(),
      subtotal: z.boolean(),
      margin: z.boolean(),
    })
    .default({ metal: true, making: true, diamond: true, subtotal: true, margin: true }),
  customerName: z.string().trim().min(1, "Customer name is required"),
  customerAddress: z.string().trim().default(""),
  customerMobile: z.string().trim().default(""),
  seller: z.string().trim().default(""),
  quotationDate: z.string().default(""),
  items: z.array(quotationItemSchema).min(1, "Add at least one item"),
  showSummary: z.boolean().default(true),
  marginPct: z.number().min(0).default(0),
  appliedRates: z
    .object({
      gold24InrPer10g: z.number().optional(),
      goldSource: z.string().optional(),
      goldUpdatedAt: z.string().optional(),
      usdInr: z.number().optional(),
      fxSource: z.string().optional(),
      fxUpdatedAt: z.string().optional(),
      appliedAt: z.string().optional(),
      currency: z.string().optional(),
    })
    .default({}),
});
export type QuotationInput = z.infer<typeof quotationSchema>;

export const manualGoldSchema = z.object({
  inrPer10g: z.number().positive().max(10_000_000),
});
