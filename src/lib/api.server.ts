import { db } from "./db.server";
import { buildTotals, deriveMetalPrices, mastersFromPrices, recalcItem, round2, toNumber } from "./calc";
import type { MasterPrices } from "./calc";
import {
  BUCKET,
  QUOTATION_COLUMNS,
  getDiamondPrices,
  getMetalPriceMap,
  nextQuotationId,
  rowToQuotation,
  signImages,
  signQuotationImages,
} from "./quotations.server";
import { isAuthenticated, requireAuth } from "./session.server";
import type {
  DiamondBulkImportInput,
  DiamondBulkUpdateInput,
  DiamondPriceInput,
  CustomerInput,
  QuotationInput,
  SearchInput,
} from "./schemas";
import type { Customer, DiamondPrice, MetalPrice, Quotation, QuotationImage } from "./types";

export async function authState(): Promise<{ authed: boolean }> {
  return { authed: await isAuthenticated() };
}

export async function listMetalPricesImpl(): Promise<MetalPrice[]> {
  await requireAuth();
  const map = await getMetalPriceMap();
  return Object.values(map).sort((a, b) => a.sort_order - b.sort_order);
}

export async function getMasterPricesImpl(): Promise<MasterPrices> {
  await requireAuth();
  const map = await getMetalPriceMap();
  return mastersFromPrices(Object.values(map));
}

export async function updateMasterPricesImpl(
  master: MasterPrices,
): Promise<{ ok: true; prices: MetalPrice[] }> {
  await requireAuth();
  const now = new Date().toISOString();
  const prices = deriveMetalPrices(master);
  const { error } = await db
    .from("metal_prices")
    .upsert(
      prices.map((p) => ({ ...p, updated_at: now })),
      { onConflict: "purity" },
    );
  if (error) throw new Error(error.message);
  return { ok: true, prices };
}

export async function listDiamondPricesImpl(): Promise<DiamondPrice[]> {
  await requireAuth();
  return getDiamondPrices();
}

export async function saveDiamondPriceImpl(input: DiamondPriceInput): Promise<{ ok: true }> {
  await requireAuth();
  const payload = {
    shape: input.shape.trim().toUpperCase(),
    size_label: input.size_label.trim().toUpperCase(),
    size_order: input.size_order,
    lgd_price_ct: input.lgd_price_ct,
    moiss_price_ct: input.moiss_price_ct,
  };
  if (input.id) {
    const { error } = await db.from("diamond_prices").update(payload).eq("id", input.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await db
      .from("diamond_prices")
      .upsert(payload, { onConflict: "shape,size_label" });
    if (error) throw new Error(error.message);
  }
  return { ok: true };
}

export async function deleteDiamondPriceImpl(id: number): Promise<{ ok: true }> {
  await requireAuth();
  const { error } = await db.from("diamond_prices").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function bulkImportDiamondPricesImpl(
  input: DiamondBulkImportInput,
): Promise<{ ok: true; imported: number }> {
  await requireAuth();
  if (input.replaceAll) {
    const { error } = await db.from("diamond_prices").delete().gt("id", 0);
    if (error) throw new Error(error.message);
  }
  const rows = input.rows.map((r) => ({
    shape: r.shape.trim().toUpperCase(),
    size_label: r.size_label.trim().toUpperCase(),
    size_order: r.size_order,
    lgd_price_ct: r.lgd_price_ct,
    moiss_price_ct: r.moiss_price_ct,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db
      .from("diamond_prices")
      .upsert(rows.slice(i, i + 500), { onConflict: "shape,size_label" });
    if (error) throw new Error(error.message);
  }
  return { ok: true, imported: rows.length };
}

export async function bulkUpdateDiamondPricesImpl(
  input: DiamondBulkUpdateInput,
): Promise<{ ok: true; updated: number }> {
  await requireAuth();
  let query = db
    .from("diamond_prices")
    .select("id, shape, size_label, size_order, lgd_price_ct, moiss_price_ct");
  if (!input.applyToAll) {
    if (!input.ids.length) return { ok: true, updated: 0 };
    query = query.in("id", input.ids);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []).map((row) => {
    const next: Record<string, unknown> = {
      id: row.id,
      shape: row.shape,
      size_label: row.size_label,
      size_order: row.size_order,
      lgd_price_ct: toNumber(row.lgd_price_ct),
      moiss_price_ct: toNumber(row.moiss_price_ct),
    };
    for (const field of input.fields) {
      const current = toNumber(next[field]);
      const updatedValue =
        input.mode === "percent" ? current * (1 + input.value / 100) : current + input.value;
      next[field] = Math.max(0, round2(updatedValue));
    }
    return next;
  });

  for (let i = 0; i < rows.length; i += 500) {
    const { error: upsertError } = await db
      .from("diamond_prices")
      .upsert(rows.slice(i, i + 500) as never, { onConflict: "id" });
    if (upsertError) throw new Error(upsertError.message);
  }
  return { ok: true, updated: rows.length };
}

/* ---------- Quotations ---------- */

export async function listQuotationsImpl(
  input: SearchInput,
): Promise<{ items: Quotation[]; total: number }> {
  await requireAuth();
  let query = db
    .from("quotations")
    .select(QUOTATION_COLUMNS)
    .order("quotation_date", { ascending: false });

  const search = input.search.trim();
  if (search)
    query = query.or(
      `id_sku.ilike.%${search}%,id.ilike.%${search}%,category.ilike.%${search}%,customer_name.ilike.%${search}%`,
    );
  if (input.category) query = query.eq("category", input.category);
  if (input.from) query = query.gte("quotation_date", new Date(input.from).toISOString());
  if (input.to) {
    const to = new Date(input.to);
    to.setHours(23, 59, 59, 999);
    query = query.lte("quotation_date", to.toISOString());
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let all = (data ?? []).map(rowToQuotation);

  if (input.metal) {
    all = all.filter((q) => q.items.some((i) => i.metalPurity === input.metal));
  }
  const amount = (q: Quotation) => q.totals.finalAmount;
  if (input.minAmount > 0) all = all.filter((q) => amount(q) >= input.minAmount);
  if (input.maxAmount > 0) all = all.filter((q) => amount(q) <= input.maxAmount);

  const byDate = (q: Quotation) => new Date(q.quotationDate).getTime();
  if (input.sort === "oldest") all.sort((a, b) => byDate(a) - byDate(b));
  else if (input.sort === "price_desc") all.sort((a, b) => amount(b) - amount(a));
  else if (input.sort === "price_asc") all.sort((a, b) => amount(a) - amount(b));
  else all.sort((a, b) => byDate(b) - byDate(a));

  const total = all.length;
  const start = (input.page - 1) * input.pageSize;
  const items = all.slice(start, start + input.pageSize);

  // Sign every image in a single storage round-trip for speed.
  const allImages = items.flatMap((q) => [...q.items.flatMap((i) => i.images), ...q.images]);
  const signed = await signImages(allImages);
  const urlByPath = new Map(signed.map((i) => [i.path, i.url]));
  const apply = (images: QuotationImage[]) =>
    images.map((i) => ({ path: i.path, url: urlByPath.get(i.path) ?? i.url }));
  for (const quotation of items) {
    quotation.items = quotation.items.map((i) => ({ ...i, images: apply(i.images) }));
    quotation.images = apply(quotation.images);
  }
  return { items, total };
}

export async function getQuotationImpl(id: string): Promise<Quotation | null> {
  await requireAuth();
  const { data, error } = await db
    .from("quotations")
    .select(QUOTATION_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return signQuotationImages(rowToQuotation(data));
}

export async function reserveQuotationIdImpl(): Promise<{ id: string }> {
  await requireAuth();
  return { id: await nextQuotationId() };
}

function customerMatchKey(name: string, mobile: string): string {
  const digits = mobile.replace(/\D/g, "");
  return digits.length >= 6 ? `m:${digits.slice(-10)}` : `n:${name.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

/** A usable customer record: real name and a phone number with enough digits. */
export function isValidCustomer(c: { name?: string | null; mobile?: string | null; address?: string | null }): boolean {
  const name = String(c.name ?? "").trim();
  const digits = String(c.mobile ?? "").replace(/\D/g, "");
  return name.length >= 2 && digits.length >= 7 && String(c.address ?? "").trim().length > 0;
}

/** True when all four Step 1 fields are filled (required to auto-save a customer). */
export function isCompleteCustomer(c: CustomerInput): boolean {
  return isValidCustomer(c) && c.seller.trim().length > 0;
}

const CUSTOMER_COLS = "id, name, mobile, address, seller";

export async function listCustomersImpl(): Promise<Customer[]> {
  await requireAuth();
  const { data, error } = await db.from("customers").select(CUSTOMER_COLS).order("name");
  if (error) throw new Error(error.message);
  // Older incomplete/test records are kept in the database but hidden from the picker.
  return ((data ?? []) as Customer[]).filter(isValidCustomer);
}

/** Creates or updates a customer without duplicating (by id, else by mobile). Needs all four fields. */
export async function saveCustomerImpl(input: CustomerInput): Promise<Customer> {
  await requireAuth();
  if (!isCompleteCustomer(input)) {
    throw new Error("Customer name, mobile number, address and seller are all required");
  }
  const payload = {
    name: input.name.trim(),
    mobile: input.mobile.trim(),
    address: input.address.trim(),
    seller: input.seller.trim(),
    match_key: customerMatchKey(input.name, input.mobile),
    updated_at: new Date().toISOString(),
  };
  if (input.id) {
    // If another saved customer already owns this key, update that record instead.
    const { data: clash } = await db
      .from("customers")
      .select("id")
      .eq("match_key", payload.match_key)
      .neq("id", input.id)
      .maybeSingle();
    const targetId = clash?.id ?? input.id;
    const { data, error } = await db
      .from("customers")
      .update(payload)
      .eq("id", targetId)
      .select(CUSTOMER_COLS)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return data as Customer;
  }
  const { data, error } = await db
    .from("customers")
    .upsert(payload, { onConflict: "match_key" })
    .select(CUSTOMER_COLS)
    .single();
  if (error) throw new Error(error.message);
  return data as Customer;
}

export async function saveQuotationImpl(input: QuotationInput): Promise<Quotation> {
  await requireAuth();
  const customerInput = {
    id: input.customerId || undefined,
    name: input.customerName,
    mobile: input.customerMobile,
    address: input.customerAddress,
    seller: input.seller,
  };
  // Only complete Step 1 details create/update a customer; otherwise keep the existing link.
  const customerId = isCompleteCustomer(customerInput)
    ? (await saveCustomerImpl(customerInput)).id
    : input.customerId || null;
  const items = input.items.map((item) =>
    recalcItem({
      ...item,
      images: item.images.map((i) => ({ path: i.path, url: "" })),
    }),
  );
  const totals = buildTotals(items, input.marginPct);
  const id = input.id?.trim() || (await nextQuotationId());
  const first = items[0];

  const payload = {
    id,
    customer_name: input.customerName.trim(),
    customer_address: input.customerAddress.trim(),
    customer_mobile: input.customerMobile.trim(),
    seller: input.seller.trim(),
    quotation_date: input.quotationDate
      ? new Date(input.quotationDate).toISOString()
      : new Date().toISOString(),
    items,
    show_summary: Object.values(input.pdfVisibility).some(Boolean),
    currency: input.currency,
    pdf_visibility: input.pdfVisibility,
    customer_id: customerId,
    applied_rates: input.appliedRates ?? {},
    margin_pct: totals.marginPct,
    totals,
    id_sku: first?.idSku ?? "",
    category: first?.category ?? "",
    images: first?.images ?? [],
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await db
    .from("quotations")
    .upsert(payload, { onConflict: "id" })
    .select(QUOTATION_COLUMNS)
    .single();
  if (error) throw new Error(error.message);

  return signQuotationImages(rowToQuotation(data));
}

export async function deleteQuotationImpl(id: string): Promise<{ ok: true }> {
  await requireAuth();
  const { data } = await db.from("quotations").select("items").eq("id", id).maybeSingle();
  const paths = (Array.isArray(data?.items) ? data.items : [])
    .flatMap((item) => {
      const images = (item as { images?: unknown })?.images;
      return Array.isArray(images) ? images : [];
    })
    .map((i) => (i as { path?: string })?.path)
    .filter((p): p is string => Boolean(p));
  if (paths.length) await db.storage.from(BUCKET).remove(paths);
  const { error } = await db.from("quotations").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export async function uploadImagesImpl(form: FormData): Promise<QuotationImage[]> {
  await requireAuth();
  const files = form.getAll("images").filter((f): f is File => f instanceof File);
  const uploaded: QuotationImage[] = [];

  for (const file of files) {
    if (!file.type.startsWith("image/")) throw new Error(`${file.name} is not an image`);
    if (file.size > MAX_IMAGE_BYTES) throw new Error(`${file.name} is larger than 8MB`);
    const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${new Date().getFullYear()}/${crypto.randomUUID()}.${ext || "jpg"}`;
    const { error } = await db.storage.from(BUCKET).upload(path, await file.arrayBuffer(), {
      contentType: file.type,
      upsert: false,
    });
    if (error) throw new Error(error.message);
    uploaded.push({ path, url: "" });
  }

  return signImages(uploaded);
}
