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

export function BreakdownTable({ title, rows, onRowClick }: BreakdownTableProps) {
  const interactive = typeof onRowClick === "function";

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
      <div className="border-b border-slate-100 px-6 py-4">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      </div>

      {/* Scrollable table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left">
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
            {rows.map((row) => (
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
                ].join(" ")}
              >
                <td className="px-6 py-3 font-medium text-slate-900">
                  {row.label}
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
