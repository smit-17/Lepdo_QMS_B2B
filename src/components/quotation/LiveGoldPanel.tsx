import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getLiveRates, setManualGoldRate } from "@/lib/api.functions";
import { round2, toNumber } from "@/lib/calc";
import type { AppliedRates, Currency } from "@/lib/types";

const REFRESH_MS = 10 * 60 * 1000;

function when(iso?: string) {
  return iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";
}
const inr = (v: number) => `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(v)}`;
const usd = (v: number) => `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(v)}`;

/**
 * Live Surat 24 KT reference (separate from the quotation's own gold base box).
 * Nothing changes the quotation until "Use Live Rate" is pressed.
 */
export function LiveGoldPanel({
  currency,
  onUse,
}: {
  currency: Currency;
  onUse: (ratePerGram: number, snapshot: AppliedRates) => void;
}) {
  const qc = useQueryClient();
  const [manual, setManual] = useState("");
  const q = useQuery({
    queryKey: ["live-rates"],
    queryFn: () => getLiveRates(),
    refetchInterval: REFRESH_MS,
    staleTime: 60_000,
  });
  const manualMut = useMutation({
    mutationFn: (v: number) => setManualGoldRate({ data: { inrPer10g: v } }),
    onSuccess: () => {
      setManual("");
      toast.success("Manual 24 KT rate saved");
      qc.invalidateQueries({ queryKey: ["live-rates"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });

  const d = q.data;
  const gold = d?.gold ?? null;
  const fx = d?.fx ?? null;
  const per10 = gold?.value ?? 0;
  const perGram = round2(per10 / 10);
  const rate = fx?.value ?? 0;
  const usd10 = rate ? round2(per10 / rate) : 0;
  const usdGram = rate ? round2(perGram / rate) : 0;

  function use() {
    if (!gold) {
      toast.error("No 24 KT rate available yet");
      return;
    }
    if (currency === "USD" && !rate) {
      toast.error("No USD/INR rate available to convert");
      return;
    }
    const value = currency === "USD" ? usdGram : perGram;
    onUse(value, {
      gold24InrPer10g: per10,
      goldSource: gold.source,
      goldUpdatedAt: gold.updatedAt,
      ...(fx ? { usdInr: rate, fxSource: fx.source, fxUpdatedAt: fx.updatedAt } : {}),
      appliedAt: new Date().toISOString(),
      currency,
    });
  }

  const tile = (label: string, value: string) => (
    <div className="rounded-md border border-border bg-background p-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
    </div>
  );

  return (
    <section className="space-y-3 rounded-lg border border-border bg-muted/30 p-3" aria-label="Live Surat 24 KT gold rate">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Live reference · Surat 24 KT gold</h3>
          <p className="text-xs text-muted-foreground">Reference only — separate from the gold base box above. Refreshes every 10 minutes.</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
            {q.isFetching ? <Loader2 className="mr-1 size-4 animate-spin" /> : <RefreshCw className="mr-1 size-4" />} Refresh Rates
          </Button>
          <Button type="button" size="sm" onClick={use} disabled={!gold}>Use Live Rate</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-5">
        {tile("24 KT Gold — INR per 10 g", gold ? inr(per10) : "Unavailable")}
        {tile("24 KT Gold — INR per gram", gold ? inr(perGram) : "Unavailable")}
        {tile("Exchange rate", rate ? `1 USD = ₹${rate.toFixed(4)}` : "Unavailable")}
        {tile("24 KT Gold — USD per 10 g", gold && rate ? usd(usd10) : "Unavailable")}
        {tile("24 KT Gold — USD per gram", gold && rate ? usd(usdGram) : "Unavailable")}
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <p>
          Gold: {gold ? <>{gold.kind === "manual" ? "Entered manually" : <a className="text-primary underline" href={gold.source} target="_blank" rel="noopener noreferrer">allindiabullion.com (Surat)</a>} · updated {when(gold.updatedAt)}</> : "no value yet"}
          {d?.goldStale && (
            <span className="ml-1 inline-flex items-center gap-1 font-medium text-destructive">
              <AlertTriangle className="size-3" /> {gold ? "Stale" : "Unavailable"} — {d.goldError}
            </span>
          )}
        </p>
        <p>
          Exchange rate: {fx ? <>{fx.source} · updated {when(fx.updatedAt)}</> : "no value yet"}
          {d?.fxStale && (
            <span className="ml-1 inline-flex items-center gap-1 font-medium text-destructive">
              <AlertTriangle className="size-3" /> {fx ? "Stale" : "Unavailable"} — {d.fxError}
            </span>
          )}
        </p>
        <p>Use Live Rate fills the 24 KT base box in {currency} ({currency === "USD" ? "USD per gram = INR per gram ÷ INR per USD" : "INR per gram = INR per 10 g ÷ 10"}); 18/14/10 KT follow from it.</p>
      </div>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = toNumber(manual);
          if (!(v > 0)) {
            toast.error("Enter the 24 KT rate per 10 g");
            return;
          }
          manualMut.mutate(v);
        }}
      >
        <label className="grid gap-1 text-xs">
          <span className="text-muted-foreground">Manual 24 KT rate per 10 g (₹), if the website can't be read</span>
          <Input className="h-9 w-48" type="number" min={0} step="1" value={manual} onChange={(e) => setManual(e.target.value)} autoComplete="off" />
        </label>
        <Button type="submit" size="sm" variant="secondary" disabled={manualMut.isPending}>Save manual rate</Button>
      </form>
    </section>
  );
}
