/**
 * BreakdownTable — renders one of the two breakdown tables on the dashboard
 * (by Product Group or by Industry).
 */

import type { BreakdownRow } from "@/types";

interface BreakdownTableProps {
  title: string;
  rows: BreakdownRow[];
  /** When provided, rows become clickable and call this with the row's data. */
  onRowClick?: (row: BreakdownRow) => void;
  /**
   * Optional per-row swatch. Returns a Tailwind background class (e.g. `bg-red-600`)
   * to render an 8px circular dot before the row label, or null to omit.
   */
  swatchFor?: (row: BreakdownRow) => string | null;
  /**
   * Optional multi-select state. When provided, a checkbox column is rendered
   * before the label, selected rows are highlighted, and `onToggle` fires when
   * the user ticks/unticks a row. When `maxReached` is true, unticked rows'
   * checkboxes are disabled with a tooltip hint.
   */
  selection?: {
    selectedSet: Set<string>;
    onToggle: (label: string) => void;
    maxReached: boolean;
    /** Optional tooltip text shown on disabled checkboxes (default: "Max reached"). */
    maxReachedHint?: string;
  };
  /**
   * Optional toolbar rendered in the table header alongside the title
   * (e.g. a Compare button + Clear-selection link).
   */
  toolbar?: React.ReactNode;
}

/** Format a number as compact currency: £1.2m, £34k, £999 etc. */
function formatCurrency(value: number): string {
  if (value >= 1_000_000) {
    return `£${(value / 1_000_000).toFixed(1)}m`;
  }
  if (value >= 1_000) {
    return `£${Math.round(value / 1_000)}k`;
  }
  return `£${Math.round(value)}`;
}

/** Colour-coded penetration badge */
function PenetrationBadge({ pct }: { pct: number }) {
  const colour =
    pct >= 50
      ? "bg-emerald-600 text-white"
      : pct >= 20
        ? "bg-amber-600 text-white"
        : "bg-slate-500 text-white";

  return (
    <span
      className={[
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
        colour,
      ].join(" ")}
    >
      {pct}%
    </span>
  );
}

export function BreakdownTable({
  title,
  rows,
  onRowClick,
  swatchFor,
  selection,
  toolbar,
}: BreakdownTableProps) {
  const interactive = typeof onRowClick === "function";
  const selectable = !!selection;

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <p className="mt-4 text-sm text-slate-500">No data available.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Table header */}
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-6 py-4">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {toolbar ? <div className="flex items-center gap-3">{toolbar}</div> : null}
      </div>

      {/* Scrollable table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left">
              {selectable && (
                <th
                  scope="col"
                  className="w-10 px-4 py-3"
                  aria-label="Select for compare"
                />
              )}
              <th className="px-6 py-3 font-medium text-slate-500">Group</th>
              <th className="px-4 py-3 text-right font-medium text-slate-500">
                Companies
              </th>
              <th className="px-4 py-3 text-right font-medium text-slate-500">
                Customers
              </th>
              <th className="px-4 py-3 text-right font-medium text-slate-500">
                Penetration
              </th>
              <th className="px-4 py-3 text-right font-medium text-slate-500">
                Spoken to (12m)
              </th>
              <th className="px-4 py-3 text-right font-medium text-slate-500">
                Target accounts
              </th>
              <th className="px-6 py-3 text-right font-medium text-slate-500">
                Deal value
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              const isSelected = selectable
                ? selection!.selectedSet.has(row.label)
                : false;
              const checkboxDisabled =
                selectable && selection!.maxReached && !isSelected;
              return (
                <tr
                  key={row.label}
                  onClick={interactive ? () => onRowClick!(row) : undefined}
                  onKeyDown={
                    interactive
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onRowClick!(row);
                          }
                        }
                      : undefined
                  }
                  tabIndex={interactive ? 0 : undefined}
                  role={interactive ? "button" : undefined}
                  aria-label={
                    interactive ? `View trend for ${row.label}` : undefined
                  }
                  className={[
                    "transition-colors hover:bg-slate-50",
                    interactive
                      ? "cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400"
                      : "",
                    isSelected ? "bg-slate-50" : "",
                  ].join(" ")}
                >
                  {selectable && (
                    <td
                      className="px-4 py-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={checkboxDisabled}
                        onChange={() => selection!.onToggle(row.label)}
                        title={
                          checkboxDisabled
                            ? selection!.maxReachedHint ?? "Max reached"
                            : undefined
                        }
                        aria-label={`Select ${row.label} for comparison`}
                        className="h-4 w-4 cursor-pointer rounded border-slate-300 text-slate-700 focus:ring-2 focus:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </td>
                  )}
                  <td className="px-6 py-3 font-medium text-slate-900">
                    {swatchFor ? (
                      <span className="inline-flex items-center gap-2">
                        {(() => {
                          const swatch = swatchFor(row);
                          return swatch ? (
                            <span
                              aria-hidden="true"
                              className={[
                                "inline-block h-2 w-2 rounded-full",
                                swatch,
                              ].join(" ")}
                            />
                          ) : null;
                        })()}
                        {row.label}
                      </span>
                    ) : (
                      row.label
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {row.totalCompanies.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {row.customerCount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <PenetrationBadge pct={row.penetrationPct} />
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {row.spokenToCount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {row.targetAccountCount.toLocaleString()}
                  </td>
                  <td className="px-6 py-3 text-right font-medium text-slate-700">
                    {formatCurrency(row.totalDealValue)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
