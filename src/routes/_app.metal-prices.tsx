import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataTable, Section } from "@/components/quotation/DataTable";
import { updateMasterPrices } from "@/lib/api.functions";
import {
  GOLD_BASE,
  GOLD_KARATS,
  autoGoldRate,
  deriveMetalPrices,
  formatINR,
  isGoldPurity,
  mastersFromPrices,
  toNumber,
  type MasterPrices,
} from "@/lib/calc";
import { metalPricesQuery } from "./_app.index";

export const Route = createFileRoute("/_app/metal-prices")({
  head: () => ({
    meta: [
      { title: "Metal Rates — Lepdo QMS" },
      {
        name: "description",
        content: "Update gold, silver and platinum rates and making charges per gram.",
      },
      { property: "og:title", content: "Metal Rates — Lepdo QMS" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      {
        property: "og:description",
        content: "Update gold, silver and platinum rates and making charges per gram.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(metalPricesQuery),
  component: MetalPricesPage,
});

type Draft = {
  gold14: string;
  silver: string;
  platinum: string;
  goldMaking: string;
  silverMaking: string;
  platinumMaking: string;
};

function toDraft(m: MasterPrices): Draft {
  return {
    gold14: String(m.gold14),
    silver: String(m.silver),
    platinum: String(m.platinum),
    goldMaking: String(m.goldMaking),
    silverMaking: String(m.silverMaking),
    platinumMaking: String(m.platinumMaking),
  };
}

function MetalPricesPage() {
  const queryClient = useQueryClient();
  const prices = useSuspenseQuery(metalPricesQuery).data;
  const initial = useMemo(() => mastersFromPrices(prices), [prices]);
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial));
  const [overrides, setOverrides] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(initial.overrides).map(([k, v]) => [k, String(v)])),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(toDraft(initial));
    setOverrides(
      Object.fromEntries(Object.entries(initial.overrides).map(([k, v]) => [k, String(v)])),
    );
  }, [initial]);

  const master: MasterPrices = {
    gold14: toNumber(draft.gold14),
    silver: toNumber(draft.silver),
    platinum: toNumber(draft.platinum),
    goldMaking: toNumber(draft.goldMaking),
    silverMaking: toNumber(draft.silverMaking),
    platinumMaking: toNumber(draft.platinumMaking),
    overrides: Object.fromEntries(
      Object.entries(overrides).map(([k, v]) => [k, toNumber(v)]),
    ),
  };
  const derived = deriveMetalPrices(master);

  function field(key: keyof Draft, label: string, help?: string) {
    return (
      <div className="space-y-2">
        <Label htmlFor={key}>{label}</Label>
        <Input
          id={key}
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={draft[key]}
          onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
        />
        {help && <p className="text-xs text-muted-foreground">{help}</p>}
      </div>
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      const result = await updateMasterPrices({ data: master });
      queryClient.setQueryData(["metal-prices"], result.prices);
      toast.success("Rates updated. New quotations will use these rates.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the rates");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="min-w-0">
        <h1 className="text-xl font-bold sm:text-2xl">Metal Rates</h1>
        <p className="text-sm text-muted-foreground">
          Enter the 24KT gold rate — 18KT = 76%, 14KT = 62%, 10KT = 41% of the 24KT rate. Any
          karat can be overridden manually and reset to automatic.
        </p>
      </div>

      <Section title="Base rates" description="Rate per gram">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {field("gold14", "24KT Gold rate / gram", "Other gold karats derive from this value.")}
          {field("silver", "Silver rate / gram", "Separate from gold karat calculation.")}
          {field("platinum", "Platinum rate / gram", "Separate from gold karat calculation.")}
        </div>
      </Section>

      <Section title="Making charges" description="Charged per gram of metal weight.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {field("goldMaking", "Gold making / gram", "Same for every gold karat.")}
          {field("silverMaking", "Silver making / gram")}
          {field("platinumMaking", "Platinum making / gram")}
        </div>
      </Section>

      <Section title="Gold karat rates" description="Automatic from 24KT unless overridden.">
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Purity</th>
                <th className="px-3 py-2 text-right">Automatic rate</th>
                <th className="px-3 py-2 text-right">Applied rate / gram</th>
                <th className="px-3 py-2 text-left">Mode</th>
              </tr>
            </thead>
            <tbody>
              {GOLD_KARATS.map(({ purity, pct }) => {
                const auto = autoGoldRate(master.gold14, purity);
                const isBase = purity === GOLD_BASE;
                const manual = !isBase && overrides[purity] !== undefined;
                return (
                  <tr key={purity} className="border-t border-border">
                    <td className="px-3 py-2 font-medium">
                      {purity}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {isBase ? "base" : `${Math.round(pct * 100) / 100}% of 24KT`}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatINR(auto)}</td>
                    <td className="px-3 py-2 text-right">
                      {isBase ? (
                        <span className="tabular-nums">{formatINR(auto)}</span>
                      ) : (
                        <Input
                          className="ml-auto h-8 w-36 text-right"
                          type="number"
                          min={0}
                          step="0.01"
                          value={manual ? overrides[purity] : String(auto)}
                          onChange={(e) =>
                            setOverrides((o) => ({ ...o, [purity]: e.target.value }))
                          }
                        />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {manual ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setOverrides((o) => {
                              const next = { ...o };
                              delete next[purity];
                              return next;
                            })
                          }
                        >
                          <RotateCcw className="mr-1 size-3" /> Reset to auto
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Automatic</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Rates to be saved" description="Live preview.">
        <DataTable
          headers={["Purity", "Rate / gram (₹)", "Making / gram (₹)", "Source"]}
          empty="No rates"
          rows={derived.map((row) => [
            row.purity,
            formatINR(row.price),
            formatINR(row.making_charge),
            row.manual ? "Manual" : isGoldPurity(row.purity) ? "Auto (24KT)" : "Base",
          ])}
        />

        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Save className="mr-2 size-4" />
          )}
          Save rates
        </Button>
      </Section>
    </div>
  );
}
