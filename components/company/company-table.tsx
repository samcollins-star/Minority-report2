"use client";

/**
 * CompanyTable — client component that owns the search bar and filtering logic.
 * The full company list is passed in from the server component as a prop, so
 * there are no network round-trips on each keystroke.
 */

import { useState, useMemo } from "react";
import Link from "next/link";
import type { Company } from "@/types";

interface CompanyTableProps {
  companies: Company[];
}

/** Pill badge for boolean statuses */
function StatusBadge({
  active,
  activeLabel,
  inactiveLabel,
}: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
}) {
  return (
    <span
      className={[
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
        active
          ? "bg-emerald-100 text-emerald-700"
          : "bg-slate-100 text-slate-500",
      ].join(" ")}
    >
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}

/** Format a timestamp string into a readable date, or return "—" */
function formatDate(ts: string | null): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

export function CompanyTable({ companies }: CompanyTableProps) {
  const [query, setQuery] = useState("");

  // Filter companies client-side based on the search query
  const filtered = useMemo(() => {
    const lower = query.trim().toLowerCase();
    if (!lower) return companies;
    return companies.filter((c) =>
      (c.name ?? "").toLowerCase().includes(lower)
    );
  }, [companies, query]);

  return (
    <div>
      {/* Search bar */}
      <div className="mb-6">
        <label htmlFor="company-search" className="sr-only">
          Search companies
        </label>
        <div className="relative">
          {/* Search icon */}
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <svg
              className="h-4 w-4 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
              />
            </svg>
          </div>
          <input
            id="company-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by company name…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm text-slate-900 placeholder-slate-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:max-w-sm"
          />
        </div>
        <p className="mt-2 text-xs text-slate-400">
          {filtered.length.toLocaleString()} of{" "}
          {companies.length.toLocaleString()} companies
        </p>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left">
              <th className="px-6 py-3 font-medium text-slate-500">Company</th>
              <th className="px-4 py-3 font-medium text-slate-500">
                Product group
              </th>
              <th className="px-4 py-3 font-medium text-slate-500">Industry</th>
              <th className="px-4 py-3 font-medium text-slate-500">
                Customer?
              </th>
              <th className="px-4 py-3 font-medium text-slate-500">
                Target account?
              </th>
              <th className="px-6 py-3 font-medium text-slate-500">
                Last activity
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-6 py-10 text-center text-sm text-slate-400"
                >
                  No companies match your search.
                </td>
              </tr>
            ) : (
              filtered.map((company) => (
                <tr
                  key={company.hs_object_id}
                  className="transition-colors hover:bg-indigo-50/30"
                >
                  <td className="px-6 py-3">
                    <Link
                      href={`/companies/${company.hs_object_id}`}
                      className="font-medium text-indigo-700 hover:text-indigo-900 hover:underline"
                    >
                      {company.name ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {company.beauhurst_product ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {company.new_beauhurst_industries ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      active={company.planhat_customer_status === "customer"}
                      activeLabel="Customer"
                      inactiveLabel="Not customer"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      active={Boolean(company.hs_is_target_account)}
                      activeLabel="Target"
                      inactiveLabel="Not target"
                    />
                  </td>
                  <td className="px-6 py-3 text-slate-500">
                    {formatDate(company.hs_last_sales_activity_timestamp)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
