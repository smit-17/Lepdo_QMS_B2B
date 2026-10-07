import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { dropdownsQuery } from "@/hooks/use-dropdowns";
import { saveDropdownList, type DropdownOption } from "@/lib/dropdowns.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/dropdowns")({
  head: () => ({
    meta: [
      { title: "Manage Dropdowns · Lepdo QMS" },
      { name: "description", content: "Add, rename, reorder and remove dropdown options used across Lepdo QMS." },
      { property: "og:title", content: "Manage Dropdowns · Lepdo QMS" },
      { property: "og:description", content: "Central manager for every dropdown list in Lepdo QMS." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DropdownsPage,
});

type Draft = { id?: string; label: string; active: boolean };

const LISTS: { key: "category" | "shape" | "diamond_type"; title: string; section: string; renameOnly?: boolean; note?: string }[] = [
  { key: "category", title: "Jewellery categories", section: "Item details · Quotations search" },
  { key: "shape", title: "Diamond shapes", section: "Diamond rows" },
  {
    key: "diamond_type",
    title: "Diamond / stone types",
    section: "Diamond rows",
    renameOnly: true,
    note: "Each type has its own price per carat, so new types can't be added here — rename only.",
  },
];

function ListEditor({ listKey, title, section, renameOnly, note, rows }: Omit<(typeof LISTS)[number], "key"> & { listKey: (typeof LISTS)[number]["key"]; rows: DropdownOption[] }) {
  const qc = useQueryClient();
  const initial = () => rows.map((r) => ({ id: r.id, label: r.label, active: r.active }));
  const [draft, setDraft] = useState<Draft[]>(initial);
  const [newLabel, setNewLabel] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(initial()), [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (i: number, patch: Partial<Draft>) => setDraft((d) => d.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, dir: -1 | 1) =>
    setDraft((d) => {
      const n = [...d];
      const j = i + dir;
      if (j < 0 || j >= n.length) return d;
      [n[i], n[j]] = [n[j]!, n[i]!];
      return n;
    });

  function add() {
    const l = newLabel.trim();
    if (!l) { toast.error("Option can't be blank"); return; }
    if (draft.some((r) => r.label.trim().toLowerCase() === l.toLowerCase())) { toast.error("That option already exists"); return; }
    setDraft((d) => [...d, { label: l, active: true }]);
    setNewLabel("");
  }

  async function save() {
    const labels = draft.map((r) => r.label.trim());
    if (labels.some((l) => !l)) { toast.error("Options can't be blank"); return; }
    if (new Set(labels.map((l) => l.toLowerCase())).size !== labels.length) { toast.error("Remove duplicate options first"); return; }
    setSaving(true);
    try {
      await saveDropdownList({ data: { listKey, options: draft.map((r) => ({ ...r, label: r.label.trim() })) } });
      await qc.invalidateQueries({ queryKey: dropdownsQuery.queryKey });
      toast.success(`${title} saved`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">Used in: {section}</p>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </CardHeader>
      <CardContent className="space-y-2">
        {draft.map((r, i) => (
          <div key={r.id ?? `new-${i}`} className={cn("flex items-center gap-1.5", !r.active && "opacity-60")}>
            <Input aria-label={`${title} option ${i + 1}`} value={r.label} onChange={(e) => set(i, { label: e.target.value })} className="h-9" />
            <Button type="button" size="icon" variant="ghost" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp className="size-4" /></Button>
            <Button type="button" size="icon" variant="ghost" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === draft.length - 1}><ArrowDown className="size-4" /></Button>
            {!renameOnly &&
              (r.active ? (
                <Button type="button" size="icon" variant="ghost" aria-label={`Remove ${r.label}`} onClick={() => (r.id ? set(i, { active: false }) : setDraft((d) => d.filter((_, j) => j !== i)))}><Trash2 className="size-4" /></Button>
              ) : (
                <Button type="button" size="icon" variant="ghost" aria-label={`Restore ${r.label}`} onClick={() => set(i, { active: true })}><RotateCcw className="size-4" /></Button>
              ))}
          </div>
        ))}
        {draft.some((r) => !r.active) && <p className="text-xs text-muted-foreground">Faded options are removed: hidden from new selections, kept on old quotations.</p>}
        {!renameOnly && (
          <div className="flex gap-1.5 pt-1">
            <Input placeholder="New option" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())} className="h-9" />
            <Button type="button" variant="outline" onClick={add}><Plus className="mr-1 size-4" />Add</Button>
          </div>
        )}
        <Button type="button" onClick={save} disabled={saving} className="w-full"><Save className="mr-1 size-4" />{saving ? "Saving…" : "Save changes"}</Button>
      </CardContent>
    </Card>
  );
}

function DropdownsPage() {
  const { data, isLoading, error } = useQuery(dropdownsQuery);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">Manage Dropdowns</h1>
        <p className="text-sm text-muted-foreground">Changes apply everywhere the list is used. Old quotations keep the values they were saved with.</p>
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">Could not load the lists.</p>}
      {data && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {LISTS.map((l) => (
            <ListEditor key={l.key} listKey={l.key} title={l.title} section={l.section} renameOnly={Boolean(l.renameOnly)} note={l.note ?? ""} rows={data.filter((o) => o.list_key === l.key)} />
          ))}
        </div>
      )}
      <Card>
        <CardHeader><CardTitle className="text-base">Other dropdowns</CardTitle></CardHeader>
        <CardContent className="space-y-1.5 text-sm text-muted-foreground">
          <p><b className="text-foreground">Customers</b> — managed from Step 1 of a quotation (saved when name, mobile, address and seller are filled).</p>
          <p><b className="text-foreground">Currency (INR / USD)</b> and <b className="text-foreground">Metal purity (18KT, 14KT, 10KT, Silver, Platinum)</b> — tied to conversion and weight formulas, so they can't be added without calculation settings. Rates are set on the <Link to="/metal-prices" className="underline">Metal Rates</Link> page.</p>
          <p><b className="text-foreground">Size, Color, Clarity, Cut, Certificate</b> — typed by hand, no list.</p>
        </CardContent>
      </Card>
    </div>
  );
}
