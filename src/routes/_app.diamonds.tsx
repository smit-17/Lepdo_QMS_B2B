import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { Download, Loader2, Plus, Save, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable, Section } from "@/components/quotation/DataTable";
import {
  bulkImportDiamondPrices,
  bulkUpdateDiamondPrices,
  deleteDiamondPrice,
  saveDiamondPrice,
} from "@/lib/api.functions";
import { formatINR, toNumber } from "@/lib/calc";
import { diamondPricesQuery } from "./_app.index";
import type { DiamondPrice } from "@/lib/types";

export const Route = createFileRoute("/_app/diamonds")({
  head: () => ({
    meta: [
      { title: "Diamond Price Chart — Lepdo QMS" },
      {
        name: "description",
        content: "Master per-carat diamond rates by shape and carat size band.",
      },
      { property: "og:title", content: "Diamond Price Chart — Lepdo QMS" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      {
        property: "og:description",
        content: "Master per-carat diamond rates by shape and carat size band.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(diamondPricesQuery),
  component: DiamondsPage,
});

const EMPTY = {
  shape: "",
  size_label: "",
  size_order: "",
  lgd_price_ct: "",
  moiss_price_ct: "",
};

const CSV_HEADERS = ["Shape", "Size", "Size Order", "LGD /CT (₹)", "Moiss /CT (₹)"];

const PRICE_FIELDS = [
  { key: "lgd_price_ct", label: "LGD /CT (₹)" },
  { key: "moiss_price_ct", label: "Moiss /CT (₹)" },
] as const;

type PriceField = (typeof PRICE_FIELDS)[number]["key"];

function parseCsv(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, "")));
}

function DiamondsPage() {
  const queryClient = useQueryClient();
  const prices = useSuspenseQuery(diamondPricesQuery).data;
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<DiamondPrice | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [visible, setVisible] = useState(60);
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [bulkFields, setBulkFields] = useState<PriceField[]>(["lgd_price_ct"]);
  const [bulkMode, setBulkMode] = useState<"percent" | "amount">("percent");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkScope, setBulkScope] = useState<"selected" | "all">("selected");

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return prices;
    return prices.filter(
      (d) =>
        d.shape.toLowerCase().includes(term) || d.size_label.toLowerCase().includes(term),
    );
  }, [prices, query]);

  const page = filtered.slice(0, visible);
  const allPageSelected = page.length > 0 && page.every((d) => selected.includes(d.id));

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["diamond-prices"] });
    await queryClient.invalidateQueries({ queryKey: ["quotations"] });
  }

  function startEdit(row: DiamondPrice) {
    setEditing(row);
    setForm({
      shape: row.shape,
      size_label: row.size_label,
      size_order: String(row.size_order),
      lgd_price_ct: String(row.lgd_price_ct),
      moiss_price_ct: String(row.moiss_price_ct),
    });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditing(null);
    setForm({ ...EMPTY });
  }

  async function handleSave() {
    if (!form.shape.trim() || !form.size_label.trim()) {
      toast.warning("Shape and size band are required");
      return;
    }
    setSaving(true);
    try {
      await saveDiamondPrice({
        data: {
          id: editing?.id,
          shape: form.shape.trim().toUpperCase(),
          size_label: form.size_label.trim().toUpperCase(),
          size_order: Math.max(0, Math.round(toNumber(form.size_order))),
          lgd_price_ct: toNumber(form.lgd_price_ct),
          moiss_price_ct: toNumber(form.moiss_price_ct),
        },
      });
      toast.success(editing ? "Price updated" : "Price added");
      resetForm();
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the price");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteDiamondPrice({ data: { id } });
      setSelected((s) => s.filter((i) => i !== id));
      toast.success("Row deleted");
      await refresh();
    } catch {
      toast.error("Could not delete this row");
    }
  }

  function exportCsv() {
    const rows = [
      CSV_HEADERS,
      ...filtered.map((d) => [
        d.shape,
        d.size_label,
        String(d.size_order),
        String(d.lgd_price_ct),
        String(d.moiss_price_ct),
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "diamond-price-chart.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importCsv(file: File, replaceAll: boolean) {
    setBusy(true);
    try {
      const rows = parseCsv(await file.text());
      const body = rows
        .filter((r, index) => !(index === 0 && /shape/i.test(r[0] ?? "")))
        .map((r) => ({
          shape: (r[0] ?? "").toUpperCase(),
          size_label: (r[1] ?? "").toUpperCase(),
          size_order: Math.max(0, Math.round(toNumber(r[2]))),
          lgd_price_ct: toNumber(r[3]),
          moiss_price_ct: toNumber(r[4]),
        }))
        .filter((r) => r.shape && r.size_label);
      if (!body.length) {
        toast.warning("No usable rows found in that CSV");
        return;
      }
      const result = await bulkImportDiamondPrices({ data: { rows: body, replaceAll } });
      toast.success(`${result.imported} rows imported`);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function applyBulk() {
    const value = toNumber(bulkValue);
    if (!bulkFields.length) {
      toast.warning("Pick at least one price column");
      return;
    }
    if (!value) {
      toast.warning("Enter an adjustment value");
      return;
    }
    if (bulkScope === "selected" && !selected.length) {
      toast.warning("Select rows first, or switch the scope to all rows");
      return;
    }
    setBusy(true);
    try {
      const result = await bulkUpdateDiamondPrices({
        data: {
          ids: bulkScope === "selected" ? selected : [],
          applyToAll: bulkScope === "all",
          fields: bulkFields,
          mode: bulkMode,
          value,
        },
      });
      toast.success(`${result.updated} rows updated`);
      setBulkValue("");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">Diamond Price Chart</h1>
        <p className="text-sm text-muted-foreground">
          Per-carat rates by shape and carat band. New quotations always use these rates.
        </p>
      </div>

      <Section
        title={editing ? `Edit ${editing.shape} · ${editing.size_label}` : "Add price row"}
        description="Shape plus a carat size band such as 1CT DOWN, 1 CT, 2 CT."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-2">
            <Label htmlFor="shape">Shape</Label>
            <Input
              id="shape"
              value={form.shape}
              onChange={(e) => setForm({ ...form, shape: e.target.value })}
              placeholder="ROUND"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="size_label">Size band</Label>
            <Input
              id="size_label"
              value={form.size_label}
              onChange={(e) => setForm({ ...form, size_label: e.target.value })}
              placeholder="1CT DOWN"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="size_order">Sort order</Label>
            <Input
              id="size_order"
              type="number"
              min="0"
              value={form.size_order}
              onChange={(e) => setForm({ ...form, size_order: e.target.value })}
              placeholder="0"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lgd_price_ct">LGD / CT (₹)</Label>
            <Input
              id="lgd_price_ct"
              type="number"
              inputMode="decimal"
              min="0"
              value={form.lgd_price_ct}
              onChange={(e) => setForm({ ...form, lgd_price_ct: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="moiss_price_ct">Moiss / CT (₹)</Label>
            <Input
              id="moiss_price_ct"
              type="number"
              inputMode="decimal"
              min="0"
              value={form.moiss_price_ct}
              onChange={(e) => setForm({ ...form, moiss_price_ct: e.target.value })}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : editing ? (
              <Save className="mr-2 size-4" />
            ) : (
              <Plus className="mr-2 size-4" />
            )}
            {editing ? "Update row" : "Add row"}
          </Button>
          {editing && (
            <Button variant="ghost" onClick={resetForm}>
              Cancel
            </Button>
          )}
        </div>
      </Section>

      <Section
        title="Bulk tools"
        description="Import or export the full chart, or shift prices by percentage or fixed rupees."
      >
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportCsv}>
            <Download className="mr-2 size-4" />
            Export CSV
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Upload className="mr-2 size-4" />
            Import CSV
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const replaceAll = window.confirm(
                "Replace the entire price chart with this file?\n\nOK = replace everything, Cancel = merge into the existing chart.",
              );
              void importCsv(file, replaceAll);
            }}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label>Columns</Label>
            <div className="flex flex-wrap gap-3 pt-1">
              {PRICE_FIELDS.map((field) => (
                <label key={field.key} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={bulkFields.includes(field.key)}
                    onCheckedChange={(checked) =>
                      setBulkFields((f) =>
                        checked ? [...new Set([...f, field.key])] : f.filter((k) => k !== field.key),
                      )
                    }
                  />
                  {field.label}
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Adjustment</Label>
            <Select value={bulkMode} onValueChange={(v) => setBulkMode(v as "percent" | "amount")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">Percentage (%)</SelectItem>
                <SelectItem value="amount">Fixed amount (₹)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bulkValue">Value (negative to reduce)</Label>
            <Input
              id="bulkValue"
              type="number"
              inputMode="decimal"
              value={bulkValue}
              onChange={(e) => setBulkValue(e.target.value)}
              placeholder={bulkMode === "percent" ? "e.g. 10" : "e.g. 500"}
            />
          </div>
          <div className="space-y-2">
            <Label>Apply to</Label>
            <Select value={bulkScope} onValueChange={(v) => setBulkScope(v as "selected" | "all")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="selected">Selected rows ({selected.length})</SelectItem>
                <SelectItem value="all">All rows</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={applyBulk} disabled={busy}>
          {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
          Apply bulk update
        </Button>
      </Section>

      <Section title={`Price list (${filtered.length})`}>
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setVisible(60);
            }}
            placeholder="Search shape or size band"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <Checkbox
              checked={allPageSelected}
              onCheckedChange={(checked) =>
                setSelected((s) =>
                  checked
                    ? [...new Set([...s, ...page.map((d) => d.id)])]
                    : s.filter((id) => !page.some((d) => d.id === id)),
                )
              }
            />
            Select visible
          </label>
          {selected.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
              Clear selection ({selected.length})
            </Button>
          )}
        </div>

        <DataTable
          headers={["", "Shape", "Size", "LGD /CT (₹)", "Moiss /CT (₹)", ""]}
          empty="No price rows found."
          rows={page.map((row) => [
            <Checkbox
              key="c"
              checked={selected.includes(row.id)}
              aria-label={`Select ${row.shape} ${row.size_label}`}
              onCheckedChange={(checked) =>
                setSelected((s) => (checked ? [...s, row.id] : s.filter((id) => id !== row.id)))
              }
            />,
            row.shape,
            row.size_label,
            formatINR(row.lgd_price_ct),
            formatINR(row.moiss_price_ct),
            <div key="a" className="flex gap-1">
              <Button size="sm" variant="secondary" onClick={() => startEdit(row)}>
                Edit
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Delete row"
                onClick={() => handleDelete(row.id)}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>,
          ])}
        />

        {page.length < filtered.length && (
          <Button variant="outline" onClick={() => setVisible((v) => v + 60)}>
            Load more
          </Button>
        )}
      </Section>
    </div>
  );
}
