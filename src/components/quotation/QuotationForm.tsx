import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, Percent, Eye, EyeOff, FileSearch, Loader2, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImageUploader } from "@/components/quotation/ImageUploader";
import { CustomerPicker } from "@/components/quotation/CustomerPicker";
import { LiveGoldPanel } from "@/components/quotation/LiveGoldPanel";
import { listCustomers, saveCustomer, saveQuotation } from "@/lib/api.functions";
import { PdfOverflowError, exportQuotationToPdf, previewQuotationPdf } from "@/lib/export";
import {
  buildTotals,
  diamondLabelFor,
  convertFrom14,
  emptyDiamondRow,
  isItemFilled,
  lookupRates,
  optionRows,
  emptyItem,
  currencySymbol,
  formatCurrency,
  itemDiamondWeight,
  makingRateFor,
  metalRateFor,
  recalcItem,
  safeUrl,
  shapesFrom,
  toNumber,
  todayInputValue,
} from "@/lib/calc";
import {
  CATEGORIES,
  CURRENCIES,
  DEFAULT_PDF_VISIBILITY,
  type Currency,
  type Customer,
  type AppliedRates,
  type PdfVisibility,
  type DiamondPrice,
  type DiamondRow,
  type DiamondType,
  type MetalOption,
  type MetalPrice,
  type Quotation,
  type QuotationItem,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const STEPS = [
  "Customer",
  "Item",
  "Metal",
  "Making",
  "Diamonds",
  "Summary",
  "Final",
] as const;

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function ReadonlyAmount({ label, value }: { label: string; value: string }) {
  return (
    <Field label={label}>
      <div className="flex h-9 items-center rounded-md border border-dashed border-border bg-muted/50 px-3 text-sm font-semibold tabular-nums">
        {value}
      </div>
    </Field>
  );
}

export function QuotationForm({
  diamondPrices,
  metalPrices,
  initial,
}: {
  diamondPrices: DiamondPrice[];
  metalPrices: MetalPrice[];
  initial?: Quotation | null;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [quotationId] = useState(initial?.id ?? "");
  const [customerName, setCustomerName] = useState(initial?.customerName ?? "");
  const [customerAddress, setCustomerAddress] = useState(initial?.customerAddress ?? "");
  const [customerMobile, setCustomerMobile] = useState(initial?.customerMobile ?? "");
  const [seller, setSeller] = useState(initial?.seller ?? "");
  const [quotationDate, setQuotationDate] = useState(todayInputValue(initial?.quotationDate));
  const [customerId, setCustomerId] = useState(initial?.customerId ?? "");
  const [currency, setCurrency] = useState<Currency | "">(initial?.currency ?? "");
  const [pdfVisibility, setPdfVisibility] = useState<PdfVisibility>(
    initial?.pdfVisibility ?? DEFAULT_PDF_VISIBILITY,
  );
  const [appliedRates, setAppliedRates] = useState<AppliedRates>(initial?.appliedRates ?? {});
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const customersQuery = useQuery({
    queryKey: ["customers"],
    queryFn: () => listCustomers(),
  });
  const customers = customersQuery.data ?? [];
  const cur: Currency = currency || "INR";
  const fmt = (v: number) => formatCurrency(v, cur);
  const sym = currencySymbol(cur);
  // Margin now lives in the Diamond step (added to price per carat); the final step uses the summary as-is.
  const marginPct = "0";

  const newItem = () =>
    emptyItem({
      goldRate14: metalRateFor(metalPrices, "24KT"),
      silverRate: metalRateFor(metalPrices, "Silver"),
      platinumRate: metalRateFor(metalPrices, "Platinum"),
      goldMakingRate: makingRateFor(metalPrices, "14KT"),
      silverMakingRate: makingRateFor(metalPrices, "Silver"),
      platinumMakingRate: makingRateFor(metalPrices, "Platinum"),
    });
  const [items, setItems] = useState<QuotationItem[]>(
    initial?.items?.length ? initial.items.map(recalcItem) : [newItem()],
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [step, setStep] = useState(1);

  const shapes = useMemo(() => shapesFrom(diamondPrices), [diamondPrices]);
  const item = items[activeIndex] ?? (items[0] as QuotationItem);
  const totals = useMemo(() => buildTotals(items, toNumber(marginPct)), [items, marginPct]);

  function patchItem(patch: Partial<QuotationItem>) {
    setItems((prev) =>
      prev.map((row, index) => (index === activeIndex ? recalcItem({ ...row, ...patch }) : row)),
    );
  }

  function patchDiamond(key: string, patch: Partial<DiamondRow>) {
    setItems((prev) =>
      prev.map((row, index) =>
        index === activeIndex
          ? recalcItem({
              ...row,
              diamonds: row.diamonds.map((d) => (d.key === key ? { ...d, ...patch } : d)),
            })
          : row,
      ),
    );
  }

  /** Fills LGD/Moissanite rates from the price chart when shape + size match; never touches the typed size. */
  function autoPrice(row: DiamondRow, patch: Partial<DiamondRow>): Partial<DiamondRow> {
    const next = { ...row, ...patch };
    const rates = lookupRates(diamondPrices, next.shape, next.size);
    if (!rates.lgd && !rates.moiss) return patch;
    return { ...patch, lgdPricePerCt: rates.lgd, moissPricePerCt: rates.moiss };
  }

  function autoConvert() {
    if (!(item.baseGrams14 > 0)) {
      toast.error("Enter the 14KT weight first");
      return;
    }
    setItems((prev) =>
      prev.map((row, index) => (index === activeIndex ? convertFrom14(row, metalPrices) : row)),
    );
  }

  function patchOption(purity: string, patch: Partial<MetalOption>) {
    patchItem({
      metalOptions: item.metalOptions.map((o) => (o.purity === purity ? { ...o, ...patch } : o)),
    });
  }

  const options = optionRows(item, toNumber(marginPct));
  const itemWeight = itemDiamondWeight(item);
  const diamondLabel = diamondLabelFor(item);

  function pickCustomer(c: Customer) {
    setCustomerId(c.id);
    setCustomerName(c.name);
    setCustomerMobile(c.mobile);
    setCustomerAddress(c.address);
    setSeller(c.seller ?? "");
  }

  const customerComplete =
    customerName.trim().length >= 2 &&
    customerMobile.replace(/\D/g, "").length >= 7 &&
    customerAddress.trim().length > 0 &&
    seller.trim().length > 0;

  /** Saves valid customer details (create or update — never duplicates). */
  async function persistCustomer() {
    // Only complete Step 1 details are ever saved as a customer.
    if (!customerComplete) {
      toast.info("Customer not saved — fill name, mobile, address and seller to save it.");
      return;
    }
    try {
      const saved = await saveCustomer({
        data: {
          id: customerId || undefined,
          name: customerName,
          mobile: customerMobile,
          address: customerAddress,
          seller,
        },
      });
      setCustomerId(saved.id);
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    } catch {
      /* non-blocking; it is saved again with the quotation */
    }
  }

  function goToStep(target: number) {
    if (target > 1) {
      if (!customerName.trim()) {
        toast.error("Enter the customer name first");
        setStep(1);
        return;
      }
      if (!currency) {
        toast.error("Select USD or INR before continuing");
        setStep(1);
        return;
      }
      if (step === 1) void persistCustomer();
    }
    setStep(target);
  }

  function copyDiamond(row: DiamondRow) {
    const index = item.diamonds.findIndex((d) => d.key === row.key);
    const copy = { ...row, key: emptyDiamondRow().key };
    const next = [...item.diamonds];
    next.splice(index + 1, 0, copy);
    patchItem({ diamonds: next });
  }

  function buildDraft(): Quotation {
    const priced = items.filter(isItemFilled).map(recalcItem);
    return {
      id: quotationId || "DRAFT",
      customerId,
      currency: cur,
      pdfVisibility,
      customerName,
      customerAddress,
      customerMobile,
      seller,
      quotationDate,
      items: priced,
      showSummary: Object.values(pdfVisibility).some(Boolean),
      marginPct: toNumber(marginPct),
      totals: buildTotals(priced, toNumber(marginPct)),
      idSku: priced[0]?.idSku ?? "",
      category: priced[0]?.category ?? "",
      images: priced[0]?.images ?? [],
      appliedRates,
    };
  }

  async function handlePreview() {
    try {
      const { url, fits } = await previewQuotationPdf(buildDraft());
      if (!fits) toast.warning("One or more items do not fit legibly on their A4 page.");
      setPreviewUrl(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not build the preview");
    }
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        id: quotationId || undefined,
        customerId,
        currency: cur,
        pdfVisibility,
        customerName: customerName.trim(),
        customerAddress,
        customerMobile,
        seller,
        quotationDate,
        items: items.filter(isItemFilled).map((row) => ({
          ...recalcItem(row),
          images: row.images.map((i) => ({ path: i.path, url: i.url })),
        })),
        showSummary: Object.values(pdfVisibility).some(Boolean),
        marginPct: toNumber(marginPct),
        appliedRates,
      };
      return saveQuotation({ data: payload });
    },
    onSuccess: (saved) => {
      if (saved.customerId) setCustomerId(saved.customerId);
      queryClient.invalidateQueries({ queryKey: ["quotations"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
  });

  function validate(): string | null {
    if (!customerName.trim()) return "Enter the customer name (Step 1)";
    if (!currency) return "Select USD or INR (Step 1)";
    if (!items.some(isItemFilled)) return "Add at least one item";
    const missing = items.findIndex((row) => isItemFilled(row) && !row.idSku.trim());
    if (missing >= 0) return `Item ${missing + 1} needs an ID / SKU (Step 2)`;
    return null;
  }

  async function handleSaveAndPdf() {
    const error = validate();
    if (error) {
      toast.error(error);
      return;
    }
    try {
      // Check one-page fit before saving, and flag overflow instead of dropping content.
      const check = await previewQuotationPdf(buildDraft());
      URL.revokeObjectURL(check.url);
      let allowMultiPage = false;
      if (!check.fits) {
        allowMultiPage = window.confirm(
          `Item${check.overflowItems.length > 1 ? "s" : ""} ${check.overflowItems.join(", ")} cannot fit legibly on one A4 page. Nothing will be removed. Export with the overflow continued on an extra page?`,
        );
        if (!allowMultiPage) return;
      }
      const saved = await saveMutation.mutateAsync();
      await exportQuotationToPdf(saved, { allowMultiPage });
      toast.success(`Quotation ${saved.id} saved and exported`);
      navigate({ to: "/quotation/$id", params: { id: saved.id } });
    } catch (err) {
      if (err instanceof PdfOverflowError) {
        toast.error(err.message);
        return;
      }
      toast.error(err instanceof Error ? err.message : "Could not save the quotation");
    }
  }

  async function handleSaveOnly() {
    const error = validate();
    if (error) {
      toast.error(error);
      return;
    }
    try {
      const saved = await saveMutation.mutateAsync();
      toast.success(`Quotation ${saved.id} saved`);
      navigate({ to: "/quotation/$id", params: { id: saved.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the quotation");
    }
  }

  /** Step 7 — keeps customer, seller, date and all earlier items; restarts at Step 2. */
  function addMoreItem() {
    if (!item.idSku.trim()) {
      toast.error("Add an ID / SKU before starting a new item");
      return;
    }
    setItems((prev) => [...prev, newItem()]);
    setActiveIndex(items.length);
    setStep(2);
    toast.success(`Item ${items.length} saved to this quotation`);
  }

  function removeItem(index: number) {
    if (items.length === 1) {
      toast.error("A quotation needs at least one item");
      return;
    }
    setItems((prev) => prev.filter((_, i) => i !== index));
    setActiveIndex((prev) => Math.max(0, prev > index ? prev - 1 : Math.min(prev, items.length - 2)));
  }

  const diamondTotalPieces = item.diamonds.reduce((sum, d) => sum + toNumber(d.pieces), 0);
  const numInput = "h-8 w-28 text-right";

  return (
    <div className="space-y-5">
      {/* Step indicator */}
      <div className="flex flex-wrap gap-2">
        {STEPS.map((label, index) => {
          const value = index + 1;
          return (
            <Button
              key={label}
              type="button"
              variant="ghost"
              onClick={() => goToStep(value)}
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                step === value
                  ? "border-primary bg-primary text-primary-foreground"
                  : step > value
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-accent",
              )}
            >
              <span className="flex size-4 items-center justify-center rounded-full bg-background/20 text-[10px]">
                {step > value ? <Check className="size-3" /> : value}
              </span>
              {label}
            </Button>
          );
        })}
      </div>

      {/* Item switcher */}
      {items.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Items in this quotation:</span>
          {items.map((row, index) => (
            <span key={row.key} className="flex items-center">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setActiveIndex(index);
                  if (step < 2) goToStep(2);
                }}
                className={cn(
                  "rounded-l-md border px-3 py-1 text-xs",
                  index === activeIndex
                    ? "border-primary bg-primary/10 font-semibold"
                    : "border-border bg-card",
                )}
              >
                {index + 1}. {row.idSku || "Untitled"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                aria-label={`Remove item ${index + 1}`}
                onClick={() => removeItem(index)}
                className="rounded-r-md border border-l-0 border-border bg-card px-2 py-1 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3" />
              </Button>
            </span>
          ))}
        </div>
      )}

      {/* Step 1 — customer */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Step 1 · Customer details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Field
                label="Saved customer"
                hint={
                  customerId
                    ? "Editing these details updates this saved customer (no duplicate is created)."
                    : "New customers are saved when you continue — name, mobile, address and seller are all required."
                }
              >
                <CustomerPicker
                  customers={customers}
                  selectedId={customerId}
                  onSelect={pickCustomer}
                  onNew={() => {
                    setCustomerId("");
                    setCustomerName("");
                    setCustomerMobile("");
                    setCustomerAddress("");
                    setSeller("");
                  }}
                />
              </Field>
            </div>
            <Field label="Customer name">
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Full name"
                name="customer-name"
                autoComplete="off"
              />
            </Field>
            <Field label="Mobile number">
              <Input
                value={customerMobile}
                onChange={(e) => setCustomerMobile(e.target.value)}
                placeholder="+91 ..."
                name="customer-mobile"
                autoComplete="off"
                inputMode="tel"
              />
            </Field>
            <Field label="Address">
              <Textarea
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                rows={3}
                placeholder="Street, city, state, PIN"
                name="customer-address"
                autoComplete="off"
              />
            </Field>
            <div className="grid gap-4">
              <Field label="Quotation date">
                <Input
                  type="date"
                  value={quotationDate}
                  onChange={(e) => setQuotationDate(e.target.value)}
                />
              </Field>
              <Field label="Seller name">
                <Input
                  value={seller}
                  onChange={(e) => setSeller(e.target.value)}
                  placeholder="Sales person"
                  name="seller-name"
                  autoComplete="off"
                />
              </Field>
              <Field
                label="Currency (required)"
                hint="Changes only the symbol — amounts are not converted."
              >
                <div className="flex gap-2" role="radiogroup" aria-label="Currency">
                  {CURRENCIES.map((c) => (
                    <Button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={currency === c}
                      variant={currency === c ? "default" : "outline"}
                      className="flex-1"
                      onClick={() => setCurrency(c)}
                    >
                      {c === "INR" ? "₹ INR" : "$ USD"}
                    </Button>
                  ))}
                </div>
              </Field>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2 — item */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Step 2 · Item {activeIndex + 1} details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Field label="ID / SKU">
              <Input
                value={item.idSku}
                onChange={(e) => patchItem({ idSku: e.target.value })}
                placeholder="e.g. LR-1042"
              />
            </Field>
            <Field label="Category">
              <select
                className={selectClass}
                value={item.category}
                onChange={(e) => patchItem({ category: e.target.value })}
              >
                <option value="">Select category</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <div className="md:col-span-2">
              <Field label="Item images">
                <ImageUploader
                  images={item.images}
                  onChange={(images) => patchItem({ images })}
                />
              </Field>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3 — metal */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Step 3 · Metal details</CardTitle>
            <p className="text-sm text-muted-foreground">
              Enter the 14KT weight once. Other weights: 18KT ×1.17 · 10KT ×0.88 · Silver ×0.80 ·
              Platinum ×1.66.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid items-end gap-4 md:grid-cols-5">
              <Field label="14KT weight (grams)">
                <Input
                  type="number"
                  min={0}
                  step="0.001"
                  value={item.baseGrams14 || ""}
                  onChange={(e) => patchItem({ baseGrams14: toNumber(e.target.value) })}
                />
              </Field>
              <Button type="button" onClick={autoConvert}>
                <RotateCcw className="mr-1 size-4" /> Auto-convert from 14 KT
              </Button>
              {(
                [
                  ["goldRate14", "Gold Rate per Gram — 24 KT Base"],
                  ["silverRate", "Silver Rate per Gram"],
                  ["platinumRate", "Platinum Rate per Gram"],
                ] as const
              ).map(([key, label]) => (
                <Field key={key} label={`${label} (${sym})`}>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={item[key] || ""}
                    onChange={(e) => patchItem({ [key]: toNumber(e.target.value) })}
                  />
                </Field>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Rates: 18KT = 24KT rate × 76% · 14KT = 24KT rate × 62% · 10KT = 24KT rate × 41%. Weights use their own
              factors and never change rates.
            </p>
            <MetalOptionsTable
              options={item.metalOptions}
              fmt={fmt}
              sym={sym}
              numInput={numInput}
              onPatch={patchOption}
            />
            <LiveGoldPanel
              currency={cur}
              onUse={(rate, snap) => {
                patchItem({ goldRate14: rate });
                setAppliedRates(snap);
                toast.success(`24 KT base set to ${fmt(rate)} per gram for this item`);
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* Step 4 — making */}
      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>Step 4 · Making charges</CardTitle>
            <p className="text-sm text-muted-foreground">
              Gold making applies to 18KT, 14KT and 10KT. Making charges = converted grams × making rate.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              {(
                [
                  ["goldMakingRate", "Gold making rate /g"],
                  ["silverMakingRate", "Silver making rate /g"],
                  ["platinumMakingRate", "Platinum making rate /g"],
                ] as const
              ).map(([key, label]) => (
                <Field key={key} label={`${label} (${sym})`}>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={item[key] || ""}
                    onChange={(e) => patchItem({ [key]: toNumber(e.target.value) })}
                  />
                </Field>
              ))}
            </div>
            <div className="max-w-full overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-muted/60 text-xs tracking-wide text-muted-foreground uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Purity</th>
                    <th className="px-3 py-2 text-right font-medium">Grams</th>
                    <th className="px-3 py-2 text-right font-medium">Making /g</th>
                    <th className="px-3 py-2 text-right font-medium">Making charges</th>
                  </tr>
                </thead>
                <tbody>
                  {item.metalOptions.map((o) => (
                    <tr key={o.purity} className="border-t border-border tabular-nums">
                      <td className="px-3 py-2 font-medium">{o.purity}</td>
                      <td className="px-3 py-2 text-right">{o.grams.toFixed(3)}</td>
                      <td className="px-3 py-2 text-right">{fmt(o.makingRatePerGram)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{fmt(o.makingCharges)}</td>
                    </tr>
                  ))}
                  {!item.metalOptions.length && (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                        Use “Auto-convert from 14 KT” in Step 3 first.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 5 — diamonds */}
      {step === 5 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>Step 5 · Diamond details</CardTitle>
            <Button
              type="button"
              size="sm"
               onClick={() => patchItem({ diamonds: [...item.diamonds, { ...emptyDiamondRow(), type: item.diamondType }] })}
            >
              <Plus className="mr-1 size-4" /> Add diamond row
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="max-w-xs">
              <Field label="Margin % (added to price per carat)">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={item.diamondMarginPct || ""}
                  onChange={(e) => patchItem({ diamondMarginPct: toNumber(e.target.value) })}
                />
              </Field>
              {item.diamonds.some((d) => d.rowMarginOn && d.rowMarginPct > 0) && (
                <label className="mt-2 flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={item.stackItemMargin}
                    onChange={(e) => patchItem({ stackItemMargin: e.target.checked })}
                  />
                  Also apply this item margin on rows that have their own row margin
                </label>
              )}
            </div>
             <div className="max-w-full overflow-x-auto rounded-lg border border-border">
               <table className="w-full min-w-[1520px] text-sm max-sm:hidden">
                <thead className="bg-muted/60 text-xs tracking-wide text-muted-foreground uppercase">
                  <tr>
                    {[
                      "SR",
                      "Description",
                       "Diamond Type",
                      "Shape",
                      "Size",
                      "Color",
                      "Clarity",
                      "Cut",
                      "Certificate",
                      "Pieces",
                      "Total weight (ct)",
                       `Price /ct (${sym})`,
                       `Amount (${sym})`,
                      "Row margin",
                      "Link",
                      "Actions",
                    ].map((head) => (
                      <th key={head} className="px-2 py-2 text-left font-medium whitespace-nowrap">
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {item.diamonds.map((row, index) => (
                    <tr key={row.key} className="border-t border-border align-middle">
                      <td className="px-2 py-1.5 text-center text-xs font-semibold">{index + 1}</td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-9 w-40"
                           aria-label={`Description row ${index + 1}`}
                          value={row.description}
                          onChange={(e) => patchDiamond(row.key, { description: e.target.value })}
                        />
                      </td>
                       <td className="px-2 py-1.5">
                         <select aria-label={`Diamond Type row ${index + 1}`} className={cn(selectClass, "w-44")} value={row.type} onChange={(e) => patchDiamond(row.key, { type: e.target.value as DiamondType })}>
                           <option value="Lab-Grown">Lab Grown Diamond</option>
                           <option value="Moissanite">Moissanite Diamond</option>
                         </select>
                       </td>
                      <td className="px-2 py-1.5">
                        <select
                          className={cn(selectClass, "w-32")}
                          value={row.shape}
                          onChange={(e) =>
                            patchDiamond(row.key, autoPrice(row, { shape: e.target.value }))
                          }
                        >
                          <option value="">Shape</option>
                          {shapes.map((sh) => (
                            <option key={sh} value={sh}>
                              {sh}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-9 w-28"
                          aria-label={`Size row ${index + 1}`}
                          placeholder="e.g. 1.5 mm"
                          value={row.size}
                          onChange={(e) =>
                            patchDiamond(row.key, autoPrice(row, { size: e.target.value }))
                          }
                        />
                      </td>
                      {(["color", "clarity", "cut", "certificate"] as const).map((f) => (
                        <td key={f} className="px-2 py-1.5">
                          <Input
                            className="h-9 w-24"
                            value={row[f]}
                            onChange={(e) => patchDiamond(row.key, { [f]: e.target.value })}
                          />
                        </td>
                      ))}
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-9 w-20 text-right"
                          type="number"
                          min={0}
                          value={row.pieces || ""}
                          onChange={(e) => patchDiamond(row.key, { pieces: toNumber(e.target.value) })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-9 w-24 text-right"
                          type="number"
                          min={0}
                          step="0.001"
                          value={row.totalWeightCt || ""}
                          onChange={(e) =>
                            patchDiamond(row.key, { totalWeightCt: toNumber(e.target.value) })
                          }
                        />
                      </td>
                      {(() => {
                         const isMoiss = row.type === "Moissanite";
                         const f = isMoiss ? "moissPricePerCt" : "lgdPricePerCt";
                        return <td className="px-2 py-1.5">
                          <Input
                            aria-label={`${isMoiss ? "Moiss." : "LGD"} /ct row ${index + 1}`}
                            className="h-9 w-28 text-right"
                            type="number"
                            min={0}
                            step="0.01"
                            value={row[f] || ""}
                            onChange={(e) => patchDiamond(row.key, { [f]: toNumber(e.target.value) })}
                          />
                          {item.diamondMarginPct > 0 && (
                            <div className="mt-0.5 text-right text-[11px] text-muted-foreground tabular-nums">
                              +{item.diamondMarginPct}% = {fmt(isMoiss ? row.moissRateFinal : row.lgdRateFinal)}
                            </div>
                          )}
                        </td>;
                      })()}
                      <td className="px-2 py-1.5 text-right font-semibold tabular-nums whitespace-nowrap">
                         {fmt(row.amount)}
                        {row.rowMarginOn && row.rowMarginPct > 0 && (
                          <div className="text-[11px] font-normal text-muted-foreground">cost {fmt(row.baseAmount)}</div>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <RowMargin row={row} onPatch={(patch) => patchDiamond(row.key, patch)} />
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-1">
                          <Input
                            className="h-9 w-36"
                            aria-label={`Link row ${index + 1}`}
                            value={row.link}
                            placeholder="https://"
                            onChange={(e) => patchDiamond(row.key, { link: e.target.value })}
                          />
                          <DiamondLinkIcon link={row.link} />
                        </div>
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Copy diamond row ${index + 1}`}
                          onClick={() => copyDiamond(row)}
                        >
                          <Copy className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete diamond row ${index + 1}`}
                          onClick={() =>
                            patchItem({ diamonds: item.diamonds.filter((d) => d.key !== row.key) })
                          }
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {!item.diamonds.length && (
                    <tr>
                       <td colSpan={16} className="px-3 py-6 text-center text-sm text-muted-foreground">
                        No diamonds added yet.
                      </td>
                    </tr>
                  )}
                </tbody>
                {item.diamonds.length > 0 && (
                  <tfoot className="border-t-2 border-border bg-muted/40 text-sm font-semibold">
                    <tr>
                       <td colSpan={9} className="px-2 py-2 text-right">
                        Diamond total
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{diamondTotalPieces}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{itemWeight.toFixed(3)}</td>
                      <td />
                       <td className="px-2 py-2 text-right tabular-nums">{fmt(item.diamondAmount)}</td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                )}
              </table>
              <div className="divide-y divide-border sm:hidden">
                {item.diamonds.map((row, index) => {
                  const moiss = row.type === "Moissanite";
                  const rateField = moiss ? "moissPricePerCt" : "lgdPricePerCt";
                  return <div key={row.key} className="space-y-3 p-3">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                      <strong className="min-w-0 text-sm">Diamond {index + 1}</strong>
                      <div className="flex shrink-0">
                        <Button type="button" variant="ghost" size="icon" aria-label={`Copy diamond row ${index + 1}`} onClick={() => copyDiamond(row)}><Copy className="size-4" /></Button>
                        <Button type="button" variant="ghost" size="icon" aria-label={`Delete diamond row ${index + 1}`} onClick={() => patchItem({ diamonds: item.diamonds.filter((d) => d.key !== row.key) })}><Trash2 className="size-4 text-destructive" /></Button>
                      </div>
                    </div>
                    <Field label="Diamond Type"><select aria-label={`Diamond Type row ${index + 1}`} className={selectClass} value={row.type} onChange={(e) => patchDiamond(row.key, { type: e.target.value as DiamondType })}><option value="Lab-Grown">Lab Grown Diamond</option><option value="Moissanite">Moissanite Diamond</option></select></Field>
                    <Field label="Description"><Input value={row.description} onChange={(e) => patchDiamond(row.key, { description: e.target.value })} /></Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Shape"><select className={selectClass} value={row.shape} onChange={(e) => patchDiamond(row.key, autoPrice(row, { shape: e.target.value }))}><option value="">Shape</option>{shapes.map((shape) => <option key={shape} value={shape}>{shape}</option>)}</select></Field>
                      <Field label="Size"><Input aria-label={`Size row ${index + 1}`} value={row.size} placeholder="e.g. 1.5 mm" onChange={(e) => patchDiamond(row.key, autoPrice(row, { size: e.target.value }))} /></Field>
                      {(["color", "clarity", "cut", "certificate"] as const).map((field) => <Field key={field} label={field}><Input value={row[field]} onChange={(e) => patchDiamond(row.key, { [field]: e.target.value })} /></Field>)}
                      <Field label="Pieces"><Input type="number" min={0} value={row.pieces || ""} onChange={(e) => patchDiamond(row.key, { pieces: toNumber(e.target.value) })} /></Field>
                      <Field label="Total weight (ct)"><Input type="number" min={0} step="0.001" value={row.totalWeightCt || ""} onChange={(e) => patchDiamond(row.key, { totalWeightCt: toNumber(e.target.value) })} /></Field>
                      <Field label={`${moiss ? "Moiss." : "LGD"} /ct (${sym})`}><Input aria-label={`${moiss ? "Moiss." : "LGD"} /ct row ${index + 1}`} type="number" min={0} step="0.01" value={row[rateField] || ""} onChange={(e) => patchDiamond(row.key, { [rateField]: toNumber(e.target.value) })} />{item.diamondMarginPct > 0 && <span className="text-xs text-muted-foreground">+{item.diamondMarginPct}% = {fmt(row.pricePerCt)}</span>}</Field>
                      <ReadonlyAmount label="Amount" value={fmt(row.amount)} />
                    </div>
                    <RowMargin row={row} onPatch={(patch) => patchDiamond(row.key, patch)} />
                    <Field label="Link"><div className="flex items-center gap-1"><Input value={row.link} placeholder="https://" onChange={(e) => patchDiamond(row.key, { link: e.target.value })} /><DiamondLinkIcon link={row.link} /></div></Field>
                  </div>;
                })}
                {!item.diamonds.length && <p className="p-4 text-center text-sm text-muted-foreground">No diamonds added yet.</p>}
                {!!item.diamonds.length && <p className="p-3 text-right text-sm font-semibold">Diamond total · {diamondTotalPieces} pcs · {itemWeight.toFixed(3)} ct · {fmt(item.diamondAmount)}</p>}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Size is free text. Rates fill from the price list when shape and size match a list entry
              and stay editable. Amount = total weight (ct) × (rate + margin %). Row margin (markup on cost):
              base = weight × base rate; selling = base + base × row % ÷ 100. Row margins never print in the PDF.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Step 6 — summary */}
      {step === 6 && (
        <Card>
          <CardHeader>
            <CardTitle>Step 6 · Summary — Item {activeIndex + 1}</CardTitle>
            <p className="text-sm text-muted-foreground">
              Each row is an alternative option. Hiding an option removes it from the PDF only.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
             <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["Total diamond weight (ct)", itemWeight.toFixed(3)],
                 [`Total ${diamondLabel} amount`, fmt(item.diamondAmount)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-border bg-muted/40 px-4 py-3">
                  <div className="text-xs tracking-wide text-muted-foreground uppercase">{label}</div>
                  <div className="text-lg font-bold tabular-nums">{value}</div>
                </div>
              ))}
            </div>
            <OptionSummaryTable
              rows={options}
              fmt={fmt}
               diamondLabel={diamondLabel}
              onToggle={(purity, visible) => patchOption(purity, { visible })}
            />
          </CardContent>
        </Card>
      )}

      {/* Step 7 — final */}
      {step === 7 && (
        <Card>
          <CardHeader>
            <CardTitle>Step 7 · Final amount</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {items.filter(isItemFilled).map((row, index) => (
              <div key={row.key} className="space-y-2">
                <div className="text-sm font-semibold">
                  Item {index + 1} · {row.idSku || "Untitled"}
                </div>
                 <FinalOptionsTable rows={optionRows(row, toNumber(marginPct))} fmt={fmt} diamondLabel={diamondLabelFor(row)} />
              </div>
            ))}

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={handleSaveAndPdf} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? (
                  <Loader2 className="mr-1 size-4 animate-spin" />
                ) : (
                  <Save className="mr-1 size-4" />
                )}
                Save PDF
              </Button>
              <Button type="button" variant="outline" onClick={handlePreview}>
                <FileSearch className="mr-1 size-4" /> Preview PDF
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={addMoreItem}
                disabled={saveMutation.isPending}
              >
                <Plus className="mr-1 size-4" /> Add more item
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleSaveOnly}
                disabled={saveMutation.isPending}
              >
                Save without PDF
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Final amounts come straight from the summary (diamond margin already included). Each item gets its own A4
              page in the PDF.
            </p>
            {previewUrl && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">PDF preview (identical to the download)</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      URL.revokeObjectURL(previewUrl);
                      setPreviewUrl(null);
                    }}
                  >
                    Close preview
                  </Button>
                </div>
                <iframe
                  title="Quotation PDF preview"
                  src={previewUrl}
                  className="h-[640px] w-full rounded-lg border border-border"
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Wizard navigation */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={step === 1}
          onClick={() => goToStep(Math.max(1, step - 1))}
        >
          Back
        </Button>
        <div className="min-w-0 text-center text-xs text-muted-foreground sm:text-sm">
          Items in quotation:{" "}
          <span className="font-semibold text-foreground">{items.filter(isItemFilled).length}</span>
        </div>
        <Button
          type="button"
          disabled={step === STEPS.length}
          onClick={() => goToStep(Math.min(STEPS.length, step + 1))}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function MetalOptionsTable({
  options,
  fmt,
  sym,
  numInput,
  onPatch,
}: {
  options: MetalOption[];
  fmt: (v: number) => string;
  sym: string;
  numInput: string;
  onPatch: (purity: string, patch: Partial<MetalOption>) => void;
}) {
  return (
     <div className="max-w-full overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="bg-muted/60 text-xs tracking-wide text-muted-foreground uppercase">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Purity</th>
            <th className="px-3 py-2 text-right font-medium">Grams</th>
            <th className="px-3 py-2 text-right font-medium">Rate /g ({sym})</th>
            <th className="px-3 py-2 text-right font-medium">Metal amount</th>
            <th className="px-3 py-2 text-right font-medium">Making /g</th>
            <th className="px-3 py-2 text-right font-medium">Making charges</th>
            <th className="px-3 py-2 text-right font-medium">Metal + making</th>
            <th className="px-3 py-2 text-center font-medium">PDF</th>
          </tr>
        </thead>
        <tbody>
          {options.map((o) => (
            <tr key={o.purity} className={cn("border-t border-border tabular-nums", !o.visible && "text-muted-foreground")}>
              <td className="px-3 py-1.5 font-medium">{o.purity}</td>
              <td className="px-3 py-1.5 text-right">{o.grams.toFixed(3)}</td>
              <td className="px-3 py-1.5 text-right">
                {fmt(o.ratePerGram)}
              </td>
              <td className="px-3 py-1.5 text-right">{fmt(o.metalAmount)}</td>
              <td className="px-3 py-1.5 text-right">{fmt(o.makingRatePerGram)}</td>
              <td className="px-3 py-1.5 text-right">{fmt(o.makingCharges)}</td>
              <td className="px-3 py-1.5 text-right font-semibold">{fmt(o.total)}</td>
              <td className="px-3 py-1.5 text-center">
                <VisibilityButton visible={o.visible} onClick={() => onPatch(o.purity, { visible: !o.visible })} />
              </td>
            </tr>
          ))}
          {!options.length && (
            <tr>
              <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                Enter the 14KT weight and press “Auto-convert from 14 KT”.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function VisibilityButton({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  return (
    <Button type="button" size="sm" variant={visible ? "outline" : "secondary"} onClick={onClick}>
      {visible ? (
        <>
          <Eye className="mr-1 size-3" /> Show
        </>
      ) : (
        <>
          <EyeOff className="mr-1 size-3" /> Hidden
        </>
      )}
    </Button>
  );
}

function OptionSummaryTable({
  rows,
  fmt,
  diamondLabel,
  onToggle,
}: {
  rows: ReturnType<typeof optionRows>;
  fmt: (v: number) => string;
  diamondLabel: string;
  onToggle: (purity: string, visible: boolean) => void;
}) {
  return (
    <div className="max-w-full overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[820px] text-sm max-sm:hidden">
        <thead className="bg-muted/60 text-xs tracking-wide text-muted-foreground uppercase">
          <tr>
            {["Purity", "Grams", "Metal total", `${diamondLabel} amount`, `Total (${diamondLabel})`, "PDF"].map(
              (h, i) => (
                <th key={h} className={cn("px-3 py-2 font-medium", i === 0 ? "text-left" : i === 5 ? "text-center" : "text-right")}>
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.purity} className={cn("border-t border-border tabular-nums", !r.visible && "text-muted-foreground")}>
              <td className="px-3 py-2 font-medium">{r.purity}</td>
              <td className="px-3 py-2 text-right">{r.grams.toFixed(3)}</td>
              <td className="px-3 py-2 text-right">{fmt(r.total)}</td>
               <td className="px-3 py-2 text-right">{fmt(r.selectedAmount)}</td>
               <td className="px-3 py-2 text-right font-semibold">{fmt(r.selectedTotal)}</td>
              <td className="px-3 py-2 text-center">
                <VisibilityButton visible={r.visible} onClick={() => onToggle(r.purity, !r.visible)} />
              </td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                No metal options yet — use Auto-convert in Step 3.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="divide-y divide-border sm:hidden">
        {rows.map((r) => <div key={r.purity} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 p-3 text-sm">
          <div className="min-w-0"><strong>{r.purity}</strong><span className="ml-2 text-muted-foreground">{r.grams.toFixed(3)} g</span><div className="text-xs text-muted-foreground">Metal {fmt(r.total)} · Diamonds {fmt(r.selectedAmount)}</div><div className="font-semibold">Total {fmt(r.selectedTotal)}</div></div>
          <VisibilityButton visible={r.visible} onClick={() => onToggle(r.purity, !r.visible)} />
        </div>)}
        {!rows.length && <p className="p-4 text-center text-sm text-muted-foreground">No metal options yet — use Auto-convert in Step 3.</p>}
      </div>
    </div>
  );
}

function FinalOptionsTable({
  rows,
  fmt,
  diamondLabel,
}: {
  rows: ReturnType<typeof optionRows>;
  fmt: (v: number) => string;
  diamondLabel: string;
}) {
  return (
    <div className="max-w-full overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[640px] text-sm max-sm:hidden">
        <thead className="bg-muted/60 text-xs tracking-wide text-muted-foreground uppercase">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Purity</th>
            <th className="px-3 py-2 text-right font-medium">Total ({diamondLabel})</th>
            <th className="px-3 py-2 text-right font-medium">Final ({diamondLabel})</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.purity} className={cn("border-t border-border tabular-nums", !r.visible && "text-muted-foreground line-through")}>
              <td className="px-3 py-2 font-medium">{r.purity}</td>
               <td className="px-3 py-2 text-right">{fmt(r.selectedTotal)}</td>
               <td className="px-3 py-2 text-right font-bold">{fmt(r.selectedFinal)}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">
                No metal options for this item.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="divide-y divide-border sm:hidden">
        {rows.map((r) => <div key={r.purity} className={cn("grid grid-cols-[auto_minmax(0,1fr)] gap-3 p-3 text-sm", !r.visible && "text-muted-foreground line-through")}>
          <strong>{r.purity}</strong><div className="min-w-0 text-right tabular-nums"><div>Total {fmt(r.selectedTotal)}</div><div className="font-bold">Final {fmt(r.selectedFinal)}</div></div>
        </div>)}
        {!rows.length && <p className="p-4 text-center text-sm text-muted-foreground">No metal options for this item.</p>}
      </div>
    </div>
  );
}

/** Blue external-link arrow that opens a valid diamond URL in a new tab; hidden when no valid URL. */
export function DiamondLinkIcon({ link }: { link: string }) {
  const url = safeUrl(link);
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title="Open Diamond Link"
      aria-label="Open Diamond Link"
      className="inline-flex size-7 shrink-0 items-center justify-center rounded text-primary hover:bg-accent"
    >
      <ExternalLink className="size-4" />
    </a>
  );
}

function RowMargin({ row, onPatch }: { row: DiamondRow; onPatch: (p: Partial<DiamondRow>) => void }) {
  if (!row.rowMarginOn) {
    return (
      <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => onPatch({ rowMarginOn: true })}>
        <Percent className="mr-1 size-3" /> Add Margin
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <Input
        aria-label="Row margin %"
        className="h-8 w-20 text-right"
        type="number"
        min={0}
        step="0.01"
        value={row.rowMarginPct || ""}
        placeholder="0"
        onChange={(e) => onPatch({ rowMarginPct: Math.max(0, toNumber(e.target.value)) })}
      />
      <span className="text-xs">%</span>
      <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Remove row margin" onClick={() => onPatch({ rowMarginOn: false, rowMarginPct: 0 })}>
        <Trash2 className="size-3.5 text-destructive" />
      </Button>
    </div>
  );
}
