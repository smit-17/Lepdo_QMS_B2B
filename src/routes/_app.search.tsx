import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Copy,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Loader2,
  Pencil,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Section } from "@/components/quotation/DataTable";
import { deleteQuotation, listMetalPrices, listQuotations } from "@/lib/api.functions";
import { formatCurrency } from "@/lib/calc";
import { Checkbox } from "@/components/ui/checkbox";
import {
  exportQuotationToPdf,
  exportQuotationsToExcel,
  exportQuotationsToPdfZip,
} from "@/lib/export";
import { CATEGORIES } from "@/lib/types";

const PAGE_SIZE = 12;

const DEFAULT_FILTERS = {
  search: "",
  category: "all",
  from: "",
  to: "",
  metal: "all",
  minAmount: "",
  maxAmount: "",
  sort: "newest",
};

export const Route = createFileRoute("/_app/search")({
  head: () => ({
    meta: [
      { title: "Saved Quotations — Lepdo QMS" },
      {
        name: "description",
        content: "Search, review, export and manage every saved jewellery quotation.",
      },
      { property: "og:title", content: "Saved Quotations — Lepdo QMS" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      {
        property: "og:description",
        content: "Search, review, export and manage every saved jewellery quotation.",
      },
    ],
  }),
  component: SearchPage,
});

function SearchPage() {
  const router = useRouter();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [debounced, setDebounced] = useState(DEFAULT_FILTERS);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [confirmOne, setConfirmOne] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(filters), 300);
    return () => clearTimeout(timer);
  }, [filters]);

  const { data: metalPrices } = useQuery({
    queryKey: ["metal-prices"],
    queryFn: () => listMetalPrices(),
    staleTime: 5 * 60_000,
  });

  const queryInput = useMemo(
    () => ({
      search: debounced.search,
      category: debounced.category === "all" ? "" : debounced.category,
      from: debounced.from,
      to: debounced.to,
      metal: debounced.metal === "all" ? "" : debounced.metal,
      minAmount: Number(debounced.minAmount) || 0,
      maxAmount: Number(debounced.maxAmount) || 0,
      sort: debounced.sort,
      pageSize: PAGE_SIZE,
    }),
    [debounced],
  );

  const {
    data,
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["quotations", queryInput],
    queryFn: ({ pageParam }) => listQuotations({ data: { ...queryInput, page: pageParam } }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, pages) =>
      pages.flatMap((p) => p.items).length < lastPage.total ? pages.length + 1 : undefined,
  });

  const items = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);
  const total = data?.pages[0]?.total ?? 0;

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: "400px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, items.length]);

  const selectedItems = items.filter((q) => selected.includes(q.id));
  const allSelected = items.length > 0 && selectedItems.length === items.length;
  const filtersDirty = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);

  function update(patch: Partial<typeof DEFAULT_FILTERS>) {
    setFilters((f) => ({ ...f, ...patch }));
  }

  function toggleSelected(id: string) {
    setSelected((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));
  }

  async function handleBulkPdfs() {
    if (!selectedItems.length) return;
    setBulkBusy(true);
    try {
      await exportQuotationsToPdfZip(selectedItems, "lepdo-customer-quotations");
      toast.success(
        selectedItems.length === 1
          ? "PDF downloaded"
          : `${selectedItems.length} PDFs downloaded as a ZIP`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not generate the PDFs");
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkDelete() {
    const ids = selectedItems.map((q) => q.id);
    if (!ids.length) return;
    setBulkBusy(true);
    try {
      for (const id of ids) await deleteQuotation({ data: { id } });
      setSelected([]);
      toast.success(`${ids.length} quotation${ids.length === 1 ? "" : "s"} deleted`);
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the quotations");
    } finally {
      setBulkBusy(false);
      setConfirmBulk(false);
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    try {
      await deleteQuotation({ data: { id } });
      setSelected((ids) => ids.filter((i) => i !== id));
      toast.success(`${id} deleted`);
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the quotation");
    } finally {
      setBusyId(null);
      setConfirmOne(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold sm:text-2xl">Saved Quotations</h1>
          <p className="text-sm text-muted-foreground">
            {total} quotation{total === 1 ? "" : "s"} matched
          </p>
        </div>
        <Button
          variant="outline"
          disabled={!items.length}
          onClick={() => exportQuotationsToExcel(items, "lepdo-quotations")}
        >
          <FileSpreadsheet className="mr-2 size-4" />
          <span className="hidden sm:inline">Export loaded</span>
        </Button>
      </div>

      <Section title="Filters">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="q">Search</Label>
            <div className="relative">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="q"
                className="pl-9"
                placeholder="Quotation ID, SKU, customer or product name"
                value={filters.search}
                onChange={(e) => update({ search: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={filters.category} onValueChange={(v) => update({ category: v })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {CATEGORIES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Metal type</Label>
            <Select value={filters.metal} onValueChange={(v) => update({ metal: v })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All metals</SelectItem>
                {(metalPrices ?? []).map((m) => (
                  <SelectItem key={m.purity} value={m.purity}>
                    {m.purity}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="from">From</Label>
            <Input
              id="from"
              type="date"
              value={filters.from}
              onChange={(e) => update({ from: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="to">To</Label>
            <Input
              id="to"
              type="date"
              value={filters.to}
              onChange={(e) => update({ to: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Sort by</Label>
            <Select value={filters.sort} onValueChange={(v) => update({ sort: v })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
                <SelectItem value="price_desc">Price: high to low</SelectItem>
                <SelectItem value="price_asc">Price: low to high</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="min">Min amount (₹)</Label>
            <Input
              id="min"
              type="number"
              inputMode="decimal"
              placeholder="0"
              value={filters.minAmount}
              onChange={(e) => update({ minAmount: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="max">Max amount (₹)</Label>
            <Input
              id="max"
              type="number"
              inputMode="decimal"
              placeholder="Any"
              value={filters.maxAmount}
              onChange={(e) => update({ maxAmount: e.target.value })}
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            disabled={!filtersDirty}
            onClick={() => setFilters(DEFAULT_FILTERS)}
          >
            <X className="mr-2 size-4" />
            Clear all filters
          </Button>
        </div>
      </Section>

      {items.length > 0 && (
        <div className="card-elevated flex flex-wrap items-center gap-3 px-4 py-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={allSelected}
              onCheckedChange={(checked) =>
                setSelected(checked === true ? items.map((q) => q.id) : [])
              }
            />
            Select all loaded quotations
          </label>
          <span className="text-sm text-muted-foreground">
            {selected.length} selected
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            {selected.length > 0 && (
              <Button
                size="sm"
                variant="destructive"
                disabled={bulkBusy}
                onClick={() => setConfirmBulk(true)}
              >
                <Trash2 className="mr-2 size-4" />
                Delete selected
              </Button>
            )}
            <Button size="sm" disabled={!selectedItems.length || bulkBusy} onClick={handleBulkPdfs}>
              {bulkBusy ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <FileText className="mr-2 size-4" />
              )}
              Generate Bulk PDFs
            </Button>
          </div>
        </div>
      )}

      {isFetching && !items.length ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <p className="card-elevated px-4 py-10 text-center text-sm text-muted-foreground">
          No quotations match these filters.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((quotation) => (
            <article key={quotation.id} className="card-elevated overflow-hidden">
              {quotation.images[0] ? (
                <img
                  src={quotation.images[0].url}
                  alt={`${quotation.idSku} preview`}
                  loading="lazy"
                  className="h-40 w-full object-cover"
                />
              ) : (
                <div className="brand-gradient h-2 w-full" />
              )}
              <div className="space-y-3 p-4">
                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2">
                  <Checkbox
                    className="mt-1"
                    aria-label={`Select ${quotation.id}`}
                    checked={selected.includes(quotation.id)}
                    onCheckedChange={() => toggleSelected(quotation.id)}
                  />
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold">{quotation.idSku}</h2>
                    <p className="text-xs text-muted-foreground">
                      {quotation.id} · {quotation.category || "Uncategorised"}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(quotation.quotationDate).toLocaleDateString("en-IN")}
                  </span>
                </div>

                <dl className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-md bg-secondary px-2 py-1.5">
                    <dt className="text-[11px] text-muted-foreground">Items</dt>
                    <dd className="num text-xs font-semibold">{quotation.items.length}</dd>
                  </div>
                  <div className="rounded-md bg-secondary px-2 py-1.5">
                    <dt className="text-[11px] text-muted-foreground">Diamond Wt</dt>
                    <dd className="num text-xs font-semibold">
                      {quotation.totals.totalDiamondWeight.toFixed(2)} CT
                    </dd>
                  </div>
                  <div className="rounded-md bg-secondary px-2 py-1.5">
                    <dt className="text-[11px] text-muted-foreground">Final Amount</dt>
                    <dd className="num text-xs font-semibold">
                      {formatCurrency(quotation.totals.finalAmount, quotation.currency)}
                    </dd>
                  </div>
                </dl>

                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm">
                    <Link to="/quotation/$id" params={{ id: quotation.id }}>
                      <Eye className="mr-1.5 size-3.5" />
                      View
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="secondary">
                    <Link to="/" search={{ edit: quotation.id }}>
                      <Pencil className="mr-1.5 size-3.5" />
                      Edit
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/" search={{ duplicate: quotation.id }}>
                      <Copy className="mr-1.5 size-3.5" />
                      Duplicate
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => exportQuotationToPdf(quotation)}
                  >
                    <Download className="mr-1.5 size-3.5" />
                    Download
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === quotation.id}
                    onClick={() => setConfirmOne(quotation.id)}
                  >
                    <Trash2 className="size-3.5 text-destructive" />
                    <span className="sr-only">Delete</span>
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <div ref={sentinelRef} />

      {items.length > 0 && (
        <div className="flex justify-center py-2 text-sm text-muted-foreground">
          {isFetchingNextPage ? (
            <span className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              Loading more…
            </span>
          ) : hasNextPage ? (
            <Button variant="ghost" size="sm" onClick={() => void fetchNextPage()}>
              Load more
            </Button>
          ) : (
            <span>All quotations loaded</span>
          )}
        </div>
      )}

      <AlertDialog open={confirmBulk} onOpenChange={setConfirmBulk}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.length} quotation
              {selected.length === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the selected quotations. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmOne !== null} onOpenChange={(open) => !open && setConfirmOne(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete quotation {confirmOne}?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmOne && handleDelete(confirmOne)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <p className="text-center text-xs text-muted-foreground">
        Need a new quotation?{" "}
        <button className="underline" onClick={() => router.navigate({ to: "/" })}>
          Start one here
        </button>
      </p>
    </div>
  );
}
