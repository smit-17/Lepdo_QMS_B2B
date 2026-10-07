import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "./db.server";

export type DropdownOption = {
  id: string;
  list_key: string;
  value: string;
  label: string;
  sort_order: number;
  active: boolean;
};

/** Lists users may add to / rename / remove. Diamond type is rename-only (tied to pricing). */
export const EDITABLE_LISTS = ["category", "shape"] as const;
export const RENAME_ONLY_LISTS = ["diamond_type"] as const;

export const listDropdownOptions = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await db
    .from("dropdown_options")
    .select("id,list_key,value,label,sort_order,active")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as DropdownOption[];
});

const saveSchema = z.object({
  listKey: z.enum(["category", "shape", "diamond_type"]),
  options: z
    .array(
      z.object({
        id: z.string().optional(),
        label: z.string().trim().min(1, "Options cannot be blank").max(80),
        active: z.boolean(),
      }),
    )
    .max(200),
});

export const saveDropdownList = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => saveSchema.parse(d))
  .handler(async ({ data }) => {
    const seen = new Set<string>();
    for (const o of data.options) {
      const k = o.label.toLowerCase();
      if (seen.has(k)) throw new Error(`Duplicate option: ${o.label}`);
      seen.add(k);
    }
    const { data: existing, error } = await db
      .from("dropdown_options")
      .select("id,value")
      .eq("list_key", data.listKey);
    if (error) throw new Error(error.message);
    const existingIds = new Set((existing ?? []).map((r) => r.id));
    const renameOnly = data.listKey === "diamond_type";
    if (renameOnly && data.options.some((o) => !o.id || !existingIds.has(o.id))) {
      throw new Error("New diamond types need pricing settings and can't be added here");
    }
    // Clear labels first so renames that swap names don't hit the unique index.
    const now = new Date().toISOString();
    for (const [i, o] of data.options.entries()) {
      if (o.id && existingIds.has(o.id)) {
        const { error: e } = await db
          .from("dropdown_options")
          .update({ label: `__tmp_${o.id}`, updated_at: now })
          .eq("id", o.id);
        if (e) throw new Error(e.message);
      }
      void i;
    }
    for (const [i, o] of data.options.entries()) {
      if (o.id && existingIds.has(o.id)) {
        const patch: { label: string; sort_order: number; updated_at: string; active?: boolean; value?: string } = { label: o.label, sort_order: i + 1, updated_at: now };
        if (!renameOnly) patch["active"] = o.active;
        // Editable lists store the shown label as the value for new selections.
        if (!renameOnly) patch["value"] = o.label;
        const { error: e } = await db.from("dropdown_options").update(patch).eq("id", o.id);
        if (e) throw new Error(e.message);
      } else {
        const { error: e } = await db.from("dropdown_options").insert({
          list_key: data.listKey,
          value: o.label,
          label: o.label,
          sort_order: i + 1,
          active: o.active,
        });
        if (e) throw new Error(e.message);
      }
    }
    // Options removed from the list are deactivated, never deleted (history stays intact).
    const kept = new Set(data.options.map((o) => o.id).filter(Boolean));
    const removed = [...existingIds].filter((id) => !kept.has(id));
    if (removed.length && !renameOnly) {
      const { error: e } = await db
        .from("dropdown_options")
        .update({ active: false, updated_at: now })
        .in("id", removed);
      if (e) throw new Error(e.message);
    }
    return { ok: true };
  });
