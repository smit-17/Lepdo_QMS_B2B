import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Copy, Download, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, Section } from "@/components/quotation/DataTable";
import { getQuotation } from "@/lib/api.functions";
import { safeUrl, diamondLabelFor, formatCurrency, itemDiamondWeight, optionRows } from "@/lib/calc";
import { exportQuotationToPdf } from "@/lib/export";
import { DiamondLinkIcon } from "@/components/quotation/QuotationForm";

const quotationQuery = (id: string) =>
  queryOptions({
    queryKey: ["quotation", id],
    queryFn: () => getQuotation({ data: { id } }),
  });

export const Route = createFileRoute("/_app/quotation/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Quotation ${params.id} — Lepdo QMS` },
      { name: "description", content: `Read-only view of jewellery quotation ${params.id}.` },
      { property: "og:title", content: `Quotation ${params.id} — Lepdo QMS` },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      {
        property: "og:description",
        content: `Read-only view of jewellery quotation ${params.id}.`,
      },
    ],
  }),
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(quotationQuery(params.id));
    if (!data) throw notFound();
  },
  errorComponent: () => (
    <p className="card-elevated px-4 py-10 text-center text-sm">Could not load this quotation.</p>
  ),
  notFoundComponent: () => (
    <p className="card-elevated px-4 py-10 text-center text-sm">Quotation not found.</p>
  ),
  component: ViewQuotationPage,
});

function ViewQuotationPage() {
  const { id } = Route.useParams();
  const quotation = useSuspenseQuery(quotationQuery(id)).data;
  const fmt = (v: number) => formatCurrency(v, quotation?.currency ?? "INR");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!quotation) return null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold sm:text-2xl">
            {quotation.customerName || quotation.idSku}
          </h1>
          <p className="text-sm text-muted-foreground">
            {quotation.id} · {quotation.items.length} item
            {quotation.items.length === 1 ? "" : "s"} ·{" "}
            {new Date(quotation.quotationDate).toLocaleDateString("en-IN")}
            {quotation.seller ? ` · Seller: ${quotation.seller}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
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
          <Button size="sm" onClick={() => exportQuotationToPdf(quotation, { allowMultiPage: true })}>
            <Download className="mr-1.5 size-3.5" />
            Download PDF
          </Button>
        </div>
      </div>

      <Section title="Customer">
        <dl className="grid gap-2 sm:grid-cols-3">
          {[
            ["Name", quotation.customerName || "—"],
            ["Mobile", quotation.customerMobile || "—"],
            ["Seller", quotation.seller || "—"],
            ["Address", quotation.customerAddress || "—"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-secondary px-3 py-2">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-sm font-medium break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </Section>

      {quotation.items.map((item, index) => (
        <Section key={item.key} title={`Item ${index + 1} — ${item.idSku || "Untitled"}`}>
          <p className="text-xs text-muted-foreground">{item.category || "Uncategorised"}</p>

          {mounted && item.images.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {item.images.map((image) => (
                <img
                  key={image.path}
                  src={image.url}
                  alt={`${item.idSku} product photo`}
                  loading="lazy"
                  className="h-32 w-full rounded-lg border border-border object-cover"
                />
              ))}
            </div>
          )}

          <DataTable
            headers={["Purity", "Grams", "Rate/g", "Metal", "Making/g", "Making", "Metal + Making", "PDF"]}
            empty="No metal options."
            rows={item.metalOptions.map((o) => [
              o.purity,
              o.grams.toFixed(3),
              fmt(o.ratePerGram),
              fmt(o.metalAmount),
              fmt(o.makingRatePerGram),
              fmt(o.makingCharges),
              fmt(o.total),
              o.visible ? "Shown" : "Hidden",
            ])}
          />

          <DataTable
            headers={["SR", "Description", "Diamond Type", "Shape", "Size", "Color", "Clarity", "Cut", "Certificate", "Pcs", "Wt (CT)", "Price/CT", "Amount", "Link"]}
            empty="No diamond rows."
            rows={item.diamonds.map((d, rowIndex) => [
              String(rowIndex + 1),
              d.description || "—",
              d.type === "Moissanite" ? "Moissanite" : "Lab-Grown",
              d.shape || "—",
              d.size || "—",
              d.color || "—",
              d.clarity || "—",
              d.cut || "—",
              d.certificate || "—",
              String(d.pieces),
              d.totalWeightCt.toFixed(3),
              fmt(d.pricePerCt),
              fmt(d.amount),
              safeUrl(d.link) ? <DiamondLinkIcon key="l" link={d.link} /> : "—",
            ])}
          />

          <DataTable
            headers={["Purity", "Grams", "Metal Total", `${diamondLabelFor(item)} Amount`, `Total (${diamondLabelFor(item)})`, `Final (${diamondLabelFor(item)})`]}
            empty="No summary."
            rows={optionRows(item, quotation.marginPct).map((o) => [
              o.purity,
              o.grams.toFixed(3),
              fmt(o.total),
              fmt(o.selectedAmount),
              fmt(o.selectedTotal),
              fmt(o.selectedFinal),
            ])}
          />
          <p className="text-xs text-muted-foreground">
            Diamond weight {itemDiamondWeight(item).toFixed(3)} CT · each row is an alternative option.
          </p>
        </Section>
      ))}

    </div>
  );
}
