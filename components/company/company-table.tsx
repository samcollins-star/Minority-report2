"use client";

/**
 * CompanyTable — client component that owns the search bar, filters, and
 * filtering logic. The full company list is passed in from the server component
 * as a prop, so there are no network round-trips on each interaction.
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
  activeColor,
}: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
  activeColor: "emerald" | "violet";
}) {
  const activeClass =
    activeColor === "emerald"
      ? "bg-emerald-600 text-white"
      : "bg-violet-600 text-white";
  return (
    <span
      className={[
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
        active ? activeClass : "bg-slate-100 text-slate-600",
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

const SELECT_CLS =
  "rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm " +
  "text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none " +
  "focus:ring-1 focus:ring-indigo-500";

export function CompanyTable({ companies }: CompanyTableProps) {
  const [query, setQuery] = useState("");
  const [productGroup, setProductGroup] = useState("");
  const [industry, setIndustry] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");   // "" | "yes" | "no"
  const [targetFilter, setTargetFilter] = useState("");       // "" | "yes" | "no"
  const [contactedFilter, setContactedFilter] = useState(""); // "" | "yes" | "no"
  const [ownerFilter, setOwnerFilter] = useState("");         // "" | "__unassigned__" | <owner name>

  // Distinct sorted values for the dropdown options
  const productGroups = useMemo(
    () =>
      [...new Set(companies.map((c) => c.beauhurst_product).filter(Boolean))]
        .sort() as string[],
    [companies]
  );

  const industries = useMemo(
    () =>
      [
        ...new Set(
          companies.map((c) => c.new_beauhurst_industries).filter(Boolean)
        ),
      ].sort() as string[],
    [companies]
  );

  const owners = useMemo(
    () =>
      [...new Set(companies.map((c) => c.owner_name).filter(Boolean))]
        .sort() as string[],
    [companies]
  );

  // Apply all filters with AND logic
  const filtered = useMemo(() => {
    const lower = query.trim().toLowerCase();
    const now = Date.now();
    const oneYear = 365 * 24 * 60 * 60 * 1000;

    return companies.filter((c) => {
      // Name search
      if (lower && !(c.name ?? "").toLowerCase().includes(lower)) return false;

      // Product group
      if (productGroup && (c.beauhurst_product ?? "") !== productGroup)
        return false;

      // Industry
      if (industry && (c.new_beauhurst_industries ?? "") !== industry)
        return false;

      // Customer?
      if (customerFilter === "yes" && c.planhat_customer_status !== "customer")
        return false;
      if (customerFilter === "no" && c.planhat_customer_status === "customer")
        return false;

      // Target account?
      if (targetFilter === "yes" && !Boolean(c.hs_is_target_account))
        return false;
      if (targetFilter === "no" && Boolean(c.hs_is_target_account))
        return false;

      // Contacted in last 12 months
      if (contactedFilter !== "") {
        const ts = c.hs_last_sales_activity_timestamp;
        const wasContacted =
          ts != null && now - new Date(ts).getTime() <= oneYear;
        if (contactedFilter === "yes" && !wasContacted) return false;
        if (contactedFilter === "no" && wasContacted) return false;
      }

      // Owner
      if (ownerFilter === "__unassigned__" && c.owner_name != null) return false;
      if (
        ownerFilter !== "" &&
        ownerFilter !== "__unassigned__" &&
        c.owner_name !== ownerFilter
      )
        return false;

      return true;
    });
  }, [
    companies,
    query,
    productGroup,
    industry,
    customerFilter,
    targetFilter,
    contactedFilter,
    ownerFilter,
  ]);

  const anyFilterActive =
    query.trim() !== "" ||
    productGroup !== "" ||
    industry !== "" ||
    customerFilter !== "" ||
    targetFilter !== "" ||
    contactedFilter !== "" ||
    ownerFilter !== "";

  function clearFilters() {
    setQuery("");
    setProductGroup("");
    setIndustry("");
    setCustomerFilter("");
    setTargetFilter("");
    setContactedFilter("");
    setOwnerFilter("");
  }

  return (
    <div>
      {/* ── Filters ── */}
      <div className="mb-6 space-y-3">
        {/* Row 1: name search */}
        <div>
          <label htmlFor="company-search" className="sr-only">
            Search companies
          </label>
          <div className="relative">
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
        </div>

        {/* Row 2: dropdown filters */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={productGroup}
            onChange={(e) => setProductGroup(e.target.value)}
            aria-label="Filter by product group"
            className={SELECT_CLS}
          >
            <option value="">All product groups</option>
            {productGroups.map((pg) => (
              <option key={pg} value={pg}>
                {pg}
              </option>
            ))}
          </select>

          <select
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            aria-label="Filter by industry"
            className={SELECT_CLS}
          >
            <option value="">All industries</option>
            {industries.map((ind) => (
              <option key={ind} value={ind}>
                {ind}
              </option>
            ))}
          </select>

          <select
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
            aria-label="Filter by customer status"
            className={SELECT_CLS}
          >
            <option value="">Customer: all</option>
            <option value="yes">Customer: yes</option>
            <option value="no">Customer: no</option>
          </select>

          <select
            value={targetFilter}
            onChange={(e) => setTargetFilter(e.target.value)}
            aria-label="Filter by target account"
            className={SELECT_CLS}
          >
            <option value="">Target account: all</option>
            <option value="yes">Target account: yes</option>
            <option value="no">Target account: no</option>
          </select>

          <select
            value={contactedFilter}
            onChange={(e) => setContactedFilter(e.target.value)}
            aria-label="Filter by recent contact"
            className={SELECT_CLS}
          >
            <option value="">Contacted (12 mo): all</option>
            <option value="yes">Contacted (12 mo): yes</option>
            <option value="no">Contacted (12 mo): no</option>
          </select>

          <select
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            aria-label="Filter by company owner"
            className={SELECT_CLS}
          >
            <option value="">All owners</option>
            <option value="__unassigned__">Unassigned</option>
            {owners.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          {anyFilterActive && (
            <button
              onClick={clearFilters}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 shadow-sm hover:bg-slate-50 hover:text-slate-700"
            >
              Clear filters
            </button>
          )}
        </div>

        <p className="text-xs text-slate-400">
          {filtered.length.toLocaleString()} of{" "}
          {companies.length.toLocaleString()} companies
        </p>
      </div>

      {/* ── Table ── */}
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
                      activeColor="emerald"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      active={Boolean(company.hs_is_target_account)}
                      activeLabel="Target"
                      inactiveLabel="Not target"
                      activeColor="violet"
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
