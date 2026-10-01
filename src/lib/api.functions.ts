import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  authState,
  bulkImportDiamondPricesImpl,
  bulkUpdateDiamondPricesImpl,
  deleteDiamondPriceImpl,
  deleteQuotationImpl,
  getMasterPricesImpl,
  getQuotationImpl,
  listDiamondPricesImpl,
  listCustomersImpl,
  saveCustomerImpl,
  listMetalPricesImpl,
  listQuotationsImpl,
  reserveQuotationIdImpl,
  saveDiamondPriceImpl,
  saveQuotationImpl,
  updateMasterPricesImpl,
  uploadImagesImpl,
} from "./api.server";
import {
  diamondBulkImportSchema,
  diamondBulkUpdateSchema,
  diamondPriceInputSchema,
  customerSchema,
  manualGoldSchema,
  masterPricesSchema,
  quotationSchema,
  searchSchema,
} from "./schemas";

export const getAuthState = createServerFn({ method: "GET" }).handler(async () => authState());

export const listMetalPrices = createServerFn({ method: "GET" }).handler(async () =>
  listMetalPricesImpl(),
);

export const getMasterPrices = createServerFn({ method: "GET" }).handler(async () =>
  getMasterPricesImpl(),
);

export const updateMasterPrices = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => masterPricesSchema.parse(d))
  .handler(async ({ data }) => updateMasterPricesImpl(data));

export const listDiamondPrices = createServerFn({ method: "GET" }).handler(async () =>
  listDiamondPricesImpl(),
);

export const saveDiamondPrice = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => diamondPriceInputSchema.parse(d))
  .handler(async ({ data }) => saveDiamondPriceImpl(data));

export const deleteDiamondPrice = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.number() }).parse(d))
  .handler(async ({ data }) => deleteDiamondPriceImpl(data.id));

export const bulkImportDiamondPrices = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => diamondBulkImportSchema.parse(d))
  .handler(async ({ data }) => bulkImportDiamondPricesImpl(data));

export const bulkUpdateDiamondPrices = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => diamondBulkUpdateSchema.parse(d))
  .handler(async ({ data }) => bulkUpdateDiamondPricesImpl(data));

export const listQuotations = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => searchSchema.parse(d))
  .handler(async ({ data }) => listQuotationsImpl(data));

export const getQuotation = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ data }) => getQuotationImpl(data.id));

export const saveQuotation = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => quotationSchema.parse(d))
  .handler(async ({ data }) => saveQuotationImpl(data));

export const deleteQuotation = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ data }) => deleteQuotationImpl(data.id));

export const reserveQuotationId = createServerFn({ method: "POST" }).handler(async () =>
  reserveQuotationIdImpl(),
);

export const uploadImages = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => {
    if (!(d instanceof FormData)) throw new Error("Expected form data");
    return d;
  })
  .handler(async ({ data }) => uploadImagesImpl(data));

export const listCustomers = createServerFn({ method: "GET" }).handler(async () =>
  listCustomersImpl(),
);

export const saveCustomer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => customerSchema.parse(d))
  .handler(async ({ data }) => saveCustomerImpl(data));

export const getLiveRates = createServerFn({ method: "POST" }).handler(async () => {
  const { getLiveRatesImpl } = await import("./live-rates.server");
  return getLiveRatesImpl();
});

export const setManualGoldRate = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => manualGoldSchema.parse(d))
  .handler(async ({ data }) => {
    const { setManualGoldImpl } = await import("./live-rates.server");
    return setManualGoldImpl(data.inrPer10g);
  });
