import type { ReactNode } from "react";

export function DataTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: ReactNode[][];
  empty: string;
}) {
  if (!rows.length) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
        {empty}
      </p>
    );
  }

  return (
    <div className="max-w-full overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[640px] border-collapse text-sm max-sm:hidden">
        <thead>
          <tr className="bg-secondary text-secondary-foreground">
            {headers.map((header, headerIndex) => (
              <th
                key={`${header}-${headerIndex}`}

                className="px-3 py-2.5 text-left text-xs font-semibold whitespace-nowrap"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-t border-border even:bg-muted/40">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="num px-3 py-2 whitespace-nowrap">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="divide-y divide-border sm:hidden">
        {rows.map((row, index) => <dl key={index} className="grid grid-cols-2 gap-x-3 gap-y-2 p-3 text-sm">
          {row.map((cell, cellIndex) => <div key={cellIndex} className="min-w-0"><dt className="text-xs text-muted-foreground break-words">{headers[cellIndex]}</dt><dd className="num break-all font-medium">{cell}</dd></div>)}
        </dl>)}
      </div>
    </div>
  );
}

export function Section({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="card-elevated p-4 sm:p-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold sm:text-lg">{title}</h2>
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{description}</p>
          )}
        </div>
        {action}
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}