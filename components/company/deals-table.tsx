/**
 * DealsTable — lists the deals associated with a company.
 */

import type { Deal } from "@/types";

const HUBSPOT_PORTAL_ID = process.env.HUBSPOT_PORTAL_ID ?? "329016";

interface DealsTableProps {
  deals: Deal[];
}

function formatCurrency(amount: number | null): string {
  if (amount === null || amount === undefined) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

/** Colour-coded chip for deal stage. Prefers the human-readable label; falls back to the raw id. */
function StageBadge({ label, raw }: { label: string | null; raw: string | null }) {
  const display = label ?? raw;
  if (!display) return <span className="text-slate-400">—</span>;

  return (
    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
      {display}
    </span>
  );
}

export function DealsTable({ deals }: DealsTableProps) {
  const totalValue = deals.reduce((sum, d) => sum + (d.amount ?? 0), 0);

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
        <h2 className="text-base font-semibold text-slate-900">
          Deals{" "}
          <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
            {deals.length}
          </span>
        </h2>
        {deals.length > 0 && (
          <p className="text-sm text-slate-500">
            Total:{" "}
            <span className="font-semibold text-slate-900">
              {formatCurrency(totalValue)}
            </span>
          </p>
        )}
      </div>

      {deals.length === 0 ? (
        <p className="px-6 py-8 text-sm text-slate-400">
          No deals found for this company.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                <th className="px-6 py-3 font-medium text-slate-500">
                  Deal name
                </th>
                <th className="px-4 py-3 text-right font-medium text-slate-500">
                  Amount
                </th>
                <th className="px-4 py-3 font-medium text-slate-500">Stage</th>
                <th className="px-6 py-3 font-medium text-slate-500">
                  Close date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {deals.map((deal) => (
                <tr
                  key={deal.id}
                  className="transition-colors hover:bg-slate-50"
                >
                  <td className="px-6 py-3 font-medium">
                    {deal.id ? (
                      <a
                        href={`https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/record/0-3/${deal.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-900 hover:text-indigo-700 hover:underline"
                      >
                        {deal.dealname ?? "Untitled deal"}
                      </a>
                    ) : (
                      <span className="text-slate-900">
                        {deal.dealname ?? "Untitled deal"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-700">
                    {formatCurrency(deal.amount)}
                  </td>
                  <td className="px-4 py-3">
                    <StageBadge label={deal.dealstage_label} raw={deal.dealstage} />
                  </td>
                  <td className="px-6 py-3 text-slate-500">
                    {formatDate(deal.closedate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
