import { useState } from "react";
import { Check, ChevronsUpDown, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Customer } from "@/lib/types";
import { cn } from "@/lib/utils";

export function CustomerPicker({
  customers,
  selectedId,
  onSelect,
  onNew,
}: {
  customers: Customer[];
  selectedId: string;
  onSelect: (customer: Customer) => void;
  onNew: () => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = customers.find((c) => c.id === selectedId);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
          <span className="truncate">
            {selected
              ? `${selected.name}${selected.mobile ? ` · ${selected.mobile}` : ""}`
              : `Search saved customers (${customers.length})`}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Name or mobile..." autoComplete="off" />
          <CommandList>
            <CommandEmpty>No saved customer found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__new__"
                onSelect={() => {
                  onNew();
                  setOpen(false);
                }}
              >
                <UserPlus className="mr-2 size-4" /> New customer
              </CommandItem>
              {customers.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${c.name} ${c.mobile} ${c.id}`}
                  onSelect={() => {
                    onSelect(c);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("mr-2 size-4", c.id === selectedId ? "opacity-100" : "opacity-0")}
                  />
                  <div className="min-w-0">
                    <div className="truncate">{c.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[c.mobile, c.address].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
