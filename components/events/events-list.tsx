"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import type {
  DashboardEvent,
  DashboardEventKind,
} from "@/lib/bigquery";
import { SELECT_CLS } from "@/components/company/company-table";
import { DateRangeSelect } from "@/components/events/date-range-select";

const KIND_ORDER: DashboardEventKind[] = [
  "joined",
  "renewed",
  "churned",
  "stale_12m",
];

const ALLOWED_KINDS = new Set<DashboardEventKind>(KIND_ORDER);

interface KindMeta {
  /** Short pill label */
  label: string;
  /** Full title shown in the row */
  title: string;
  /** Solid background for the active pill */
  activeBg: string;
  /** Background for the row icon */
  iconBg: string;
  /** Foreground for the row icon */
  iconFg: string;
}

const KIND_META: Record<DashboardEventKind, KindMeta> = {
  joined: {
    label: "Joined",
    title: "Joined as a customer",
    activeBg: "bg-emerald-600",
    iconBg: "bg-emerald-100",
    iconFg: "text-emerald-700",
  },
  renewed: {
    label: "Renewed",
    title: "Renewed as a customer",
    activeBg: "bg-indigo-600",
    iconBg: "bg-indigo-100",
    iconFg: "text-indigo-700",
  },
  churned: {
    label: "Churned",
    title: "Churned",
    activeBg: "bg-rose-600",
    iconBg: "bg-rose-100",
    iconFg: "text-rose-700",
  },
  stale_12m: {
    label: "Stale 12m",
    title: "Crossed 12 months without contact",
    activeBg: "bg-amber-600",
    iconBg: "bg-amber-100",
    iconFg: "text-amber-700",
  },
};

function KindIcon({ kind }: { kind: DashboardEventKind }) {
  if (kind === "renewed") {
    return (
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 12a9 9 0 1 1-3.34-7" />
        <path d="M21 4v5h-5" />
      </svg>
    );
  }
  if (kind === "stale_12m") {
    return (
      <span className="font-bold leading-none" aria-hidden="true">
        !
      </span>
    );
  }
  return (
    <span className="text-lg leading-none" aria-hidden="true">
      ●
    </span>
  );
}

function relativeDay(iso: string): string {
  const then = new Date(iso + "T00:00:00Z").getTime();
  const today = new Date();
  const todayUtc = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  const days = Math.round((todayUtc - then) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 60) return "1 month ago";
  return `${Math.floor(days / 30)} months ago`;
}

function EventRow({ event }: { event: DashboardEvent }) {
  const meta = KIND_META[event.kind];
  return (
    <li className="flex items-start gap-4 px-6 py-4">
      <span
        className={[
          "mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full",
          meta.iconBg,
          meta.iconFg,
        ].join(" ")}
        aria-hidden="true"
      >
        <KindIcon kind={event.kind} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900">{meta.title}</p>
        <p className="mt-0.5 text-sm text-slate-600">
          <Link
            href={`/companies/${event.companyId}`}
            className="font-medium text-indigo-700 hover:text-indigo-900 hover:underline"
          >
            {event.companyName}
          </Link>{" "}
          {event.industry ? (
            <span className="text-slate-500">in {event.industry}</span>
          ) : (
            <span className="text-slate-400">— industry unknown</span>
          )}
        </p>
      </div>
      <span className="flex-none whitespace-nowrap text-xs text-slate-400">
        {relativeDay(event.occurredAt)}
      </span>
    </li>
  );
}

export function EventsList({
  events,
  days,
}: {
  events: DashboardEvent[];
  days: number;
}) {
  const router = useRouter();
  const params = useSearchParams();

  // Read & validate filter state directly from the URL — single source of truth
  const rawKind = params.get("kind");
  const kind: DashboardEventKind | null =
    rawKind && ALLOWED_KINDS.has(rawKind as DashboardEventKind)
      ? (rawKind as DashboardEventKind)
      : null;
  const industry = params.get("industry") || null;
  const product = params.get("product") || null;
  const rawCustomer = params.get("customer");
  const customer: "yes" | "no" | null =
    rawCustomer === "yes" || rawCustomer === "no" ? rawCustomer : null;

  // Unfiltered-derived metadata (counts + dropdown options)
  const kindCounts = useMemo(() => {
    const out: Record<DashboardEventKind, number> = {
      joined: 0,
      renewed: 0,
      churned: 0,
      stale_12m: 0,
    };
    for (const e of events) out[e.kind]++;
    return out;
  }, [events]);

  const industries = useMemo(
    () =>
      [...new Set(events.map((e) => e.industry).filter(Boolean) as string[])]
        .sort((a, b) => a.localeCompare(b)),
    [events],
  );

  const productGroups = useMemo(
    () =>
      [...new Set(events.map((e) => e.productGroup).filter(Boolean) as string[])]
        .sort((a, b) => a.localeCompare(b)),
    [events],
  );

  // Apply filters
  const filtered = useMemo(
    () =>
      events.filter((e) => {
        if (kind && e.kind !== kind) return false;
        if (industry && e.industry !== industry) return false;
        if (product && e.productGroup !== product) return false;
        if (customer === "yes" && !e.isCustomer) return false;
        if (customer === "no" && e.isCustomer) return false;
        return true;
      }),
    [events, kind, industry, product, customer],
  );

  const anyFilterActive =
    kind != null || industry != null || product != null || customer != null;

  function updateParam(
    key: "kind" | "industry" | "product" | "customer",
    value: string | null,
  ) {
    const next = new URLSearchParams(params.toString());
    if (value == null || value === "") next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    router.replace(qs ? `/events?${qs}` : "/events");
  }

  function clearFilters() {
    const next = new URLSearchParams();
    next.set("days", String(days));
    router.replace(`/events?${next.toString()}`);
  }

  // Empty-state copy that reflects active filters
  function emptyMessage(): string {
    const kindFragment = kind ? KIND_META[kind].label.toLowerCase() : "";
    const head = kind ? `No ${kindFragment} events` : "No events";
    const locParts: string[] = [];
    if (customer === "yes") locParts.push("for customers");
    else if (customer === "no") locParts.push("for non-customers");
    if (industry) locParts.push(`in ${industry}`);
    if (product) locParts.push(`for ${product}`);
    const loc = locParts.length ? " " + locParts.join(" ") : "";
    return `${head}${loc} over the last ${days} days.`;
  }

  return (
    <div>
      {/* ── Filter row ── */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {/* Pill strip */}
        <button
          type="button"
          onClick={() => updateParam("kind", null)}
          className={[
            "rounded-full px-3 py-1 text-sm font-medium transition-colors",
            kind == null
              ? "bg-slate-600 text-white"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200",
          ].join(" ")}
        >
          All
        </button>
        {KIND_ORDER.map((k) => {
          const meta = KIND_META[k];
          const active = kind === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => {
                if (!active) updateParam("kind", k);
              }}
              className={[
                "rounded-full px-3 py-1 text-sm font-medium transition-colors",
                active
                  ? `${meta.activeBg} text-white`
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200",
              ].join(" ")}
            >
              {meta.label} ({kindCounts[k]})
            </button>
          );
        })}

        {/* Industry */}
        <select
          value={industry ?? ""}
          onChange={(e) => updateParam("industry", e.target.value || null)}
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

        {/* Product */}
        <select
          value={product ?? ""}
          onChange={(e) => updateParam("product", e.target.value || null)}
          aria-label="Filter by product group"
          className={SELECT_CLS}
        >
          <option value="">All products</option>
          {productGroups.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        {/* Customer */}
        <select
          value={customer ?? ""}
          onChange={(e) => updateParam("customer", e.target.value || null)}
          aria-label="Filter by customer status"
          className={SELECT_CLS}
        >
          <option value="">Customer: all</option>
          <option value="yes">Customer: yes</option>
          <option value="no">Customer: no</option>
        </select>

        {/* Date range */}
        <DateRangeSelect value={days} />

        {anyFilterActive && (
          <button
            type="button"
            onClick={clearFilters}
            className="ml-auto rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 shadow-sm hover:bg-slate-50 hover:text-slate-700"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {filtered.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-400">
            {anyFilterActive
              ? emptyMessage()
              : `No events in the last ${days} days.`}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
