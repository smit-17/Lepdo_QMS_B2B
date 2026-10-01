import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { z } from "zod";
import { QuotationForm } from "@/components/quotation/QuotationForm";
import { getQuotation, listDiamondPrices, listMetalPrices } from "@/lib/api.functions";

export const diamondPricesQuery = queryOptions({
  queryKey: ["diamond-prices"],
  queryFn: () => listDiamondPrices(),
  staleTime: 5 * 60 * 1000,
});

export const metalPricesQuery = queryOptions({
  queryKey: ["metal-prices"],
  queryFn: () => listMetalPrices(),
  staleTime: 5 * 60 * 1000,
});

const quotationQuery = (id: string) =>
  queryOptions({
    queryKey: ["quotation", id],
    queryFn: () => getQuotation({ data: { id } }),
  });

export const Route = createFileRoute("/_app/")({
  validateSearch: z.object({ edit: z.string().optional(), duplicate: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "New Quotation — Lepdo QMS" },
      {
        name: "description",
        content: "Build a jewellery quotation with live metal rates and diamond pricing.",
      },
      { property: "og:title", content: "New Quotation — Lepdo QMS" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      {
        property: "og:description",
        content: "Build a jewellery quotation with live metal rates and diamond pricing.",
      },
    ],
  }),
  loaderDeps: ({ search }) => ({ edit: search.edit, duplicate: search.duplicate }),
  loader: async ({ context, deps }) => {
    const source = deps.edit ?? deps.duplicate;
    await Promise.all([
      context.queryClient.ensureQueryData(diamondPricesQuery),
      context.queryClient.ensureQueryData(metalPricesQuery),
      source ? context.queryClient.ensureQueryData(quotationQuery(source)) : null,
    ]);
  },
  component: NewQuotationPage,
});

function NewQuotationPage() {
  const { edit, duplicate } = Route.useSearch();
  const source = edit ?? duplicate;
  const diamondPrices = useSuspenseQuery(diamondPricesQuery).data;
  const metalPrices = useSuspenseQuery(metalPricesQuery).data;
  const existing = useSuspenseQuery({
    queryKey: ["quotation", source ?? "new"],
    queryFn: source ? () => getQuotation({ data: { id: source } }) : async () => null,
  }).data;

  const initial = edit
    ? existing
    : duplicate && existing
      ? { ...existing, id: "", images: [], quotationDate: new Date().toISOString() }
      : null;

  return (
    <QuotationForm
      key={edit ?? (duplicate ? `dup-${duplicate}` : "new")}
      diamondPrices={diamondPrices}
      metalPrices={metalPrices}
      initial={initial}
    />
  );
}