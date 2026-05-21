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

export const SELECT_CLS =
  "rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm " +
  "text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none " +
  "focus:ring-1 focus:ring-indigo-500";

// ── Sorting ────────────────────────────────────────────────────────────────

type SortDirection = "asc" | "desc";
type ColumnKey =
  | "name"
  | "product"
  | "industry"
  | "customer"
  | "target"
  | "lastActivity";

interface SortCriterion {
  column: ColumnKey;
  direction: SortDirection;
}

const COLUMN_LABELS: Record<ColumnKey, string> = {
  name: "Company",
  product: "Product group",
  industry: "Industry",
  customer: "Customer?",
  target: "Target account?",
  lastActivity: "Last contact",
};

/**
 * String comparator that treats null/empty as "after" everything else,
 * regardless of direction. Returns 0 if both are nullish.
 */
function compareNullableString(
  a: string | null | undefined,
  b: string | null | undefined,
  dir: SortDirection,
): number {
  const aNull = a == null || a === "";
  const bNull = b == null || b === "";
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  const cmp = a!.localeCompare(b!, undefined, { sensitivity: "base" });
  return dir === "asc" ? cmp : -cmp;
}

/** Boolean comparator — true sorts first in asc, last in desc. */
function compareBool(a: boolean, b: boolean, dir: SortDirection): number {
  if (a === b) return 0;
  const cmp = a ? -1 : 1;
  return dir === "asc" ? cmp : -cmp;
}

/** Timestamp comparator — nulls always last; desc puts most recent first. */
function compareTimestamp(
  a: string | null,
  b: string | null,
  dir: SortDirection,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const at = new Date(a).getTime();
  const bt = new Date(b).getTime();
  if (at === bt) return 0;
  const cmp = at < bt ? -1 : 1;
  return dir === "asc" ? cmp : -cmp;
}

const comparators: Record<
  ColumnKey,
  (a: Company, b: Company, dir: SortDirection) => number
> = {
  name: (a, b, dir) => compareNullableString(a.name, b.name, dir),
  product: (a, b, dir) =>
    compareNullableString(a.beauhurst_product, b.beauhurst_product, dir),
  industry: (a, b, dir) =>
    compareNullableString(
      a.new_beauhurst_industries,
      b.new_beauhurst_industries,
      dir,
    ),
  customer: (a, b, dir) =>
    compareBool(
      a.planhat_customer_status === "customer",
      b.planhat_customer_status === "customer",
      dir,
    ),
  target: (a, b, dir) =>
    compareBool(
      Boolean(a.hs_is_target_account),
      Boolean(b.hs_is_target_account),
      dir,
    ),
  lastActivity: (a, b, dir) =>
    compareTimestamp(
      effectiveLastContact(a),
      effectiveLastContact(b),
      dir,
    ),
};

/**
 * Source-of-truth for the "Last contact" column. Prefers the Planhat-aware
 * `effective_last_contacted` returned by the BigQuery list query, falling
 * back to the raw HubSpot sales-activity timestamp if it isn't projected
 * (e.g. on older cached payloads).
 */
function effectiveLastContact(c: Company): string | null {
  return c.effective_last_contacted ?? c.hs_last_sales_activity_timestamp;
}

/** Arrow icon shown next to active column header. */
function SortArrow({ direction }: { direction: SortDirection }) {
  return (
    <svg
      className="ml-1 inline-block h-3 w-3 text-slate-900"
      viewBox="0 0 12 12"
      fill="currentColor"
      aria-hidden="true"
    >
      {direction === "asc" ? (
        <path d="M6 3l4 5H2z" />
      ) : (
        <path d="M6 9L2 4h8z" />
      )}
    </svg>
  );
}

/** Clickable column header that toggles sort for `column`. */
function SortableHeader({
  column,
  label,
  sortStack,
  onToggle,
  className,
}: {
  column: ColumnKey;
  label: string;
  sortStack: SortCriterion[];
  onToggle: (col: ColumnKey, withShift: boolean) => void;
  className: string;
}) {
  const idx = sortStack.findIndex((c) => c.column === column);
  const criterion = idx === -1 ? null : sortStack[idx];
  const ariaSort: "ascending" | "descending" | "none" = criterion
    ? criterion.direction === "asc"
      ? "ascending"
      : "descending"
    : "none";
  const showBadge = criterion != null && sortStack.length > 1;
  return (
    <th className={className} aria-sort={ariaSort}>
      <button
        type="button"
        title="Click to sort. Shift+click to stack a secondary sort."
        onClick={(e) => onToggle(column, e.shiftKey)}
        className="-mx-1 inline-flex items-center rounded px-1 py-0.5 font-medium text-slate-500 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <span>{label}</span>
        {criterion ? (
          <SortArrow direction={criterion.direction} />
        ) : (
          <svg
            className="ml-1 inline-block h-3 w-3 text-slate-300"
            viewBox="0 0 12 12"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M6 2l3 4H3zM6 10l-3-4h6z" />
          </svg>
        )}
        {showBadge && (
          <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600">
            {idx + 1}
          </span>
        )}
      </button>
    </th>
  );
}

export function CompanyTable({ companies }: CompanyTableProps) {
  const [query, setQuery] = useState("");
  const [productGroup, setProductGroup] = useState("");
  const [industry, setIndustry] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");   // "" | "yes" | "no"
  const [targetFilter, setTargetFilter] = useState("");       // "" | "yes" | "no"
  const [contactedFilter, setContactedFilter] = useState(""); // "" | "yes" | "no"
  const [ownerFilter, setOwnerFilter] = useState("");         // "" | "__unassigned__" | <owner name>
  const [sortStack, setSortStack] = useState<SortCriterion[]>([]);

  function toggleSort(column: ColumnKey, withShift: boolean) {
    setSortStack((prev) => {
      const idx = prev.findIndex((c) => c.column === column);
      if (withShift) {
        if (idx === -1) return [...prev, { column, direction: "asc" }];
        if (prev[idx].direction === "asc") {
          const next = [...prev];
          next[idx] = { column, direction: "desc" };
          return next;
        }
        return prev.filter((_, i) => i !== idx);
      }
      // Regular click — always collapse to a single column
      if (idx === 0) {
        if (prev[0].direction === "asc") return [{ column, direction: "desc" }];
        return [];
      }
      return [{ column, direction: "asc" }];
    });
  }

  function removeFromStack(column: ColumnKey) {
    setSortStack((prev) => prev.filter((c) => c.column !== column));
  }

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
        const ts = effectiveLastContact(c);
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

  // Walk the sort stack: rows are compared by the first criterion, ties broken
  // by the second, etc. Stable sort handles the final tie-break — incoming
  // order is name asc from SQL.
  const sorted = useMemo(() => {
    if (sortStack.length === 0) return filtered;
    return [...filtered].sort((a, b) => {
      for (const { column, direction } of sortStack) {
        const cmp = comparators[column](a, b, direction);
        if (cmp !== 0) return cmp;
      }
      return 0;
    });
  }, [filtered, sortStack]);

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

        {sortStack.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="text-slate-400">Sorted by:</span>
            {sortStack.map((c, i) => (
              <span key={c.column} className="inline-flex items-center gap-2">
                {i > 0 && (
                  <span className="text-slate-300" aria-hidden="true">
                    →
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeFromStack(c.column)}
                  title="Remove from sort"
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium text-slate-700 hover:bg-slate-100"
                >
                  <span>{COLUMN_LABELS[c.column]}</span>
                  <span aria-hidden="true">
                    {c.direction === "asc" ? "↑" : "↓"}
                  </span>
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => setSortStack([])}
              className="ml-auto rounded px-2 py-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* ── Table ── */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left">
              <SortableHeader
                column="name"
                label="Company"
                sortStack={sortStack}
                onToggle={toggleSort}
                className="px-6 py-3"
              />
              <SortableHeader
                column="product"
                label="Product group"
                sortStack={sortStack}
                onToggle={toggleSort}
                className="px-4 py-3"
              />
              <SortableHeader
                column="industry"
                label="Industry"
                sortStack={sortStack}
                onToggle={toggleSort}
                className="px-4 py-3"
              />
              <SortableHeader
                column="customer"
                label="Customer?"
                sortStack={sortStack}
                onToggle={toggleSort}
                className="px-4 py-3"
              />
              <SortableHeader
                column="target"
                label="Target account?"
                sortStack={sortStack}
                onToggle={toggleSort}
                className="px-4 py-3"
              />
              <SortableHeader
                column="lastActivity"
                label="Last contact"
                sortStack={sortStack}
                onToggle={toggleSort}
                className="px-6 py-3"
              />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-6 py-10 text-center text-sm text-slate-400"
                >
                  No companies match your search.
                </td>
              </tr>
            ) : (
              sorted.map((company) => (
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
                    {formatDate(effectiveLastContact(company))}
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
