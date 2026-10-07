import { queryOptions, useQuery } from "@tanstack/react-query";
import { listDropdownOptions, type DropdownOption } from "@/lib/dropdowns.functions";
import { CATEGORIES } from "@/lib/types";

export const dropdownsQuery = queryOptions({
  queryKey: ["dropdown-options"],
  queryFn: () => listDropdownOptions(),
  staleTime: 30_000,
});

export type Choice = { value: string; label: string };

/** Active options for one list; the current value is kept even if renamed/removed (history). */
export function choicesFor(
  all: DropdownOption[] | undefined,
  listKey: string,
  fallback: string[],
  current?: string,
): Choice[] {
  const rows = (all ?? []).filter((o) => o.list_key === listKey && o.active);
  const list: Choice[] = all ? rows.map((o) => ({ value: o.value, label: o.label })) : fallback.map((v) => ({ value: v, label: v }));
  if (current && !list.some((c) => c.value === current)) list.push({ value: current, label: current });
  return list;
}

export function useDropdowns() {
  const q = useQuery(dropdownsQuery);
  const all = q.data;
  const diamondTypeLabel = (v: string) =>
    all?.find((o) => o.list_key === "diamond_type" && o.value === v)?.label ??
    (v === "Moissanite" ? "Moissanite Diamond" : "Lab Grown Diamond");
  return {
    all,
    categories: (current?: string) => choicesFor(all, "category", [...CATEGORIES], current),
    shapes: (fallback: string[], current?: string) => {
      const list = choicesFor(all, "shape", fallback, current);
      return list.length ? list : fallback.map((v) => ({ value: v, label: v }));
    },
    diamondTypeLabel,
  };
}
