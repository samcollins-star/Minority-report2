"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { BreakdownRow } from "@/types";
import type { KpiTrendPoint } from "@/lib/bigquery";
import { BreakdownTable } from "./breakdown-table";
import {
  KpiTrendModal,
  type MetricKey,
  type MetricOption,
} from "./kpi-trend-modal";
import {
  MultiLineTrendChart,
  type MultiLineSeries,
} from "./multi-line-trend-chart";
import { derivePenetration } from "@/lib/trends";

interface BreakdownsWithTrendsProps {
  productGroupRows: BreakdownRow[];
  industryRows: BreakdownRow[];
  /**
   * Pre-fetched product trends, one Record per metric, each keyed on product
   * label. Empty arrays for products with no snapshot rows. Penetration is
   * derived client-side from companies + customers, so isn't a separate fetch.
   */
  productTrends: {
    companies: Record<string, KpiTrendPoint[]>;
    customers: Record<string, KpiTrendPoint[]>;
    target: Record<string, KpiTrendPoint[]>;
    spokenTo: Record<string, KpiTrendPoint[]>;
  };
  /** Rendered between the product trends chart and the By Industry table. */
  children?: React.ReactNode;
}

interface OpenTrend {
  scope: "product" | "industry";
  dimension: string;
  title: string;
  accentColor: string;
  currentValueByMetric: Partial<Record<MetricKey, number>>;
}

const PRODUCT_BRAND_COLOR: Record<string, { tw: string; hex: string }> = {
  BeauhurstSales: { tw: "bg-red-600", hex: "#dc2626" },
  BeauhurstAdvise: { tw: "bg-fuchsia-600", hex: "#c026d3" },
  BeauhurstImpact: { tw: "bg-blue-600", hex: "#2563eb" },
  BeauhurstInvest: { tw: "bg-green-500", hex: "#22c55e" },
};

function productAccent(label: string) {
  return PRODUCT_BRAND_COLOR[label] ?? { tw: "bg-slate-400", hex: "#94a3b8" };
}

const INDUSTRY_DEFAULT_ACCENT = "#4f46e5";

const PRODUCT_ORDER = [
  "BeauhurstSales",
  "BeauhurstAdvise",
  "BeauhurstImpact",
  "BeauhurstInvest",
];

/**
 * 8-colour CVD-safe-ish palette for industry comparison lines.
 * Cycled in selection order so the first picked industry always gets the
 * first colour. Eight is also the cap on simultaneous selections.
 */
const INDUSTRY_COMPARE_PALETTE = [
  "#4f46e5", // indigo-600
  "#d97706", // amber-600
  "#0284c7", // sky-600
  "#7c3aed", // violet-600
  "#059669", // emerald-600
  "#334155", // slate-700
  "#c026d3", // fuchsia-600
  "#ea580c", // orange-600
];

const MAX_INDUSTRY_COMPARE = 8;

/**
 * Five tabs shown in the per-dimension trend modal. Order is fixed and
 * mirrors the breakdown table's column order.
 */
const BREAKDOWN_METRIC_TABS: MetricOption[] = [
  { key: "companies", label: "Companies", formatter: "count" },
  { key: "customers", label: "Customers", formatter: "count" },
  { key: "penetration", label: "Penetration", formatter: "percent" },
  { key: "target", label: "Target", formatter: "count" },
  { key: "spoken_to_12m", label: "Spoken to (12m)", formatter: "count" },
];

/** Tab definitions for the always-on Product trends chart — same five metrics. */
const PRODUCT_TREND_TABS: MetricOption[] = BREAKDOWN_METRIC_TABS;

/** Subtitle copy keyed on metric — `<X>` is filled in with the data span. */
const PRODUCT_SUBTITLE: Record<MetricKey, (weeks: string) => string> = {
  companies: (w) => `Company counts ${w}`,
  customers: (w) => `Customer counts ${w}`,
  penetration: (w) => `Customer penetration (% of companies) ${w}`,
  target: (w) => `Target accounts ${w}`,
  spoken_to_12m: (w) => `Companies spoken to in last 12 months, ${w}`,
};

function rowToCurrentValueByMetric(
  row: BreakdownRow
): Partial<Record<MetricKey, number>> {
  return {
    companies: row.totalCompanies,
    customers: row.customerCount,
    penetration: row.penetrationPct,
    target: row.targetAccountCount,
    spoken_to_12m: row.spokenToCount,
  };
}

export function BreakdownsWithTrends({
  productGroupRows,
  industryRows,
  productTrends,
  children,
}: BreakdownsWithTrendsProps) {
  // ---- single-row click-through ---------------------------------------
  // The modal owns fetching for breakdown rows now; this state just records
  // which row is "open" so the modal knows which dimension/scope to use.
  const [openTrend, setOpenTrend] = useState<OpenTrend | null>(null);

  const close = () => setOpenTrend(null);

  const handleProductClick = (row: BreakdownRow) => {
    setOpenTrend({
      scope: "product",
      dimension: row.label,
      title: row.label,
      accentColor: productAccent(row.label).hex,
      currentValueByMetric: rowToCurrentValueByMetric(row),
    });
  };

  const handleIndustryClick = (row: BreakdownRow) => {
    setOpenTrend({
      scope: "industry",
      dimension: row.label,
      title: row.label,
      accentColor: INDUSTRY_DEFAULT_ACCENT,
      currentValueByMetric: rowToCurrentValueByMetric(row),
    });
  };

  // ---- product trends chart series -------------------------------------
  const [productMetric, setProductMetric] = useState<MetricKey>("companies");

  const productMetricOption = useMemo<MetricOption>(
    () =>
      PRODUCT_TREND_TABS.find((t) => t.key === productMetric) ??
      PRODUCT_TREND_TABS[0],
    [productMetric]
  );

  const productSeries = useMemo<MultiLineSeries[]>(() => {
    const data: Record<string, KpiTrendPoint[]> =
      productMetric === "companies"
        ? productTrends.companies
        : productMetric === "customers"
          ? productTrends.customers
          : productMetric === "target"
            ? productTrends.target
            : productMetric === "spoken_to_12m"
              ? productTrends.spokenTo
              : derivePenetration(
                  productTrends.companies,
                  productTrends.customers
                );
    return PRODUCT_ORDER.map((label) => ({
      label,
      hex: productAccent(label).hex,
      data: data[label] ?? [],
    }));
  }, [productMetric, productTrends]);

  // ---- industry compare selection --------------------------------------
  // Selection is preserved by *insertion order* so palette assignment stays
  // stable as the user ticks/unticks.
  const [selected, setSelected] = useState<string[]>([]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const maxReached = selected.length >= MAX_INDUSTRY_COMPARE;

  const toggleIndustry = (label: string) => {
    setSelected((curr) => {
      if (curr.includes(label)) return curr.filter((l) => l !== label);
      if (curr.length >= MAX_INDUSTRY_COMPARE) return curr;
      return [...curr, label];
    });
  };

  const clearSelection = () => setSelected([]);

  const [compareOpen, setCompareOpen] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [compareData, setCompareData] = useState<CompareData | null>(null);
  // Snapshot of the selection at the moment Compare was clicked, so colour
  // assignment in the modal isn't affected by toggles made while the modal
  // is open.
  const [compareLabels, setCompareLabels] = useState<string[]>([]);

  const compareReqRef = useRef(0);

  const openCompare = () => {
    if (selected.length < 2) return;
    const reqId = ++compareReqRef.current;
    const labels = [...selected];
    setCompareLabels(labels);
    setCompareOpen(true);
    setCompareLoading(true);
    setCompareError(null);
    setCompareData(null);

    const dims = labels.join(",");
    const fetchBatch = (metric: string) =>
      fetch(
        `/api/trends?${new URLSearchParams({ metric, dimensions: dims }).toString()}`
      ).then((res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return res.json() as Promise<Record<string, KpiTrendPoint[]>>;
      });

    Promise.all([
      fetchBatch("companies_by_industry"),
      fetchBatch("customers_by_industry"),
      fetchBatch("target_by_industry"),
      fetchBatch("spoken_to_12m_by_industry"),
    ])
      .then(([companies, customers, target, spokenTo]) => {
        if (reqId !== compareReqRef.current) return;
        setCompareData({ companies, customers, target, spokenTo });
      })
      .catch((err) => {
        if (reqId !== compareReqRef.current) return;
        setCompareError(
          err instanceof Error ? err.message : "Failed to load comparison"
        );
      })
      .finally(() => {
        if (reqId !== compareReqRef.current) return;
        setCompareLoading(false);
      });
  };

  const closeCompare = () => {
    compareReqRef.current++; // invalidate any in-flight request
    setCompareOpen(false);
    setCompareLoading(false);
    setCompareError(null);
    setCompareData(null);
    setCompareLabels([]);
  };

  // Esc to close compare modal
  useEffect(() => {
    if (!compareOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCompare();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [compareOpen]);

  // ---- industry table toolbar ------------------------------------------
  const industryToolbar =
    selected.length === 0 ? null : (
      <>
        <button
          type="button"
          onClick={openCompare}
          disabled={selected.length < 2}
          title={
            selected.length < 2 ? "Pick at least 2 to compare" : undefined
          }
          className="inline-flex items-center rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Compare ({selected.length})
        </button>
        <button
          type="button"
          onClick={clearSelection}
          className="text-xs font-medium text-slate-500 hover:text-slate-700"
        >
          Clear selection
        </button>
      </>
    );

  // Range subtitle for the product chart — derived from the actual data.
  const productSpanWeeks = useMemo(() => {
    const dates = productSeries
      .flatMap((s) => s.data.map((p) => p.snapshotDate))
      .sort();
    if (dates.length < 2) return null;
    const first = parseISO(dates[0]);
    const last = parseISO(dates[dates.length - 1]);
    const days = (last.getTime() - first.getTime()) / 86_400_000;
    return Math.max(1, Math.round(days / 7));
  }, [productSeries]);

  return (
    <>
      <BreakdownTable
        title="By Product Group"
        rows={productGroupRows}
        onRowClick={handleProductClick}
        swatchFor={(row) => productAccent(row.label).tw}
      />

      {/* Always-on product trends chart, fed from server-prefetched data */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-slate-900">
            Product trends
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {PRODUCT_SUBTITLE[productMetric](
              productSpanWeeks
                ? `over the last ${productSpanWeeks} week${productSpanWeeks === 1 ? "" : "s"}`
                : "over time"
            )}
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Product trends metric"
          className="mb-4 flex flex-wrap gap-1 border-b border-slate-200"
        >
          {PRODUCT_TREND_TABS.map((t) => {
            const selected = t.key === productMetric;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setProductMetric(t.key)}
                className={[
                  "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  selected
                    ? "border-slate-900 text-slate-900"
                    : "border-transparent text-slate-500 hover:text-slate-700",
                ].join(" ")}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <MultiLineTrendChart
          series={productSeries}
          formatter={productMetricOption.formatter}
        />
      </div>

      {children}

      <BreakdownTable
        title="By Industry"
        rows={industryRows}
        onRowClick={handleIndustryClick}
        selection={{
          selectedSet,
          onToggle: toggleIndustry,
          maxReached,
          maxReachedHint: `Max ${MAX_INDUSTRY_COMPARE} industries`,
        }}
        toolbar={industryToolbar}
      />

      {openTrend && (
        <KpiTrendModal
          open
          onClose={close}
          title={openTrend.title}
          accentColor={openTrend.accentColor}
          scope={openTrend.scope}
          dimension={openTrend.dimension}
          metricsAvailable={BREAKDOWN_METRIC_TABS}
          initialMetric="companies"
          currentValueByMetric={openTrend.currentValueByMetric}
        />
      )}

      {compareOpen && (
        <CompareDialog
          labels={compareLabels}
          state={
            compareLoading ? "loading" : compareError ? "error" : "ready"
          }
          message={compareError ?? undefined}
          data={compareData}
          onClose={closeCompare}
        />
      )}
    </>
  );
}

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

interface CompareData {
  companies: Record<string, KpiTrendPoint[]>;
  customers: Record<string, KpiTrendPoint[]>;
  target: Record<string, KpiTrendPoint[]>;
  spokenTo: Record<string, KpiTrendPoint[]>;
}

interface CompareDialogProps {
  labels: string[];
  state: "loading" | "error" | "ready";
  message?: string;
  data: CompareData | null;
  onClose: () => void;
}

const COMPARE_SUBTITLE: Record<MetricKey, (n: number, w: string) => string> = {
  companies: (n, w) => `Company counts across ${n} industries ${w}`,
  customers: (n, w) => `Customer counts across ${n} industries ${w}`,
  penetration: (n, w) => `Customer penetration across ${n} industries ${w}`,
  target: (n, w) => `Target accounts across ${n} industries ${w}`,
  spoken_to_12m: (n, w) =>
    `Companies spoken to (last 12 months) across ${n} industries ${w}`,
};

function CompareDialog({
  labels,
  state,
  message,
  data,
  onClose,
}: CompareDialogProps) {
  const [activeMetric, setActiveMetric] = useState<MetricKey>("companies");
  const activeTab =
    BREAKDOWN_METRIC_TABS.find((t) => t.key === activeMetric) ??
    BREAKDOWN_METRIC_TABS[0];

  const series = useMemo<MultiLineSeries[]>(() => {
    if (!data) return [];
    const map: Record<string, KpiTrendPoint[]> =
      activeMetric === "companies"
        ? data.companies
        : activeMetric === "customers"
          ? data.customers
          : activeMetric === "target"
            ? data.target
            : activeMetric === "spoken_to_12m"
              ? data.spokenTo
              : derivePenetration(data.companies, data.customers);
    return labels.map((label, i) => ({
      label,
      hex: INDUSTRY_COMPARE_PALETTE[i % INDUSTRY_COMPARE_PALETTE.length],
      data: map[label] ?? [],
    }));
  }, [data, activeMetric, labels]);

  const spanWeeks = useMemo(() => {
    const dates = series
      .flatMap((s) => s.data.map((p) => p.snapshotDate))
      .sort();
    if (dates.length < 2) return null;
    const first = parseISO(dates[0]);
    const last = parseISO(dates[dates.length - 1]);
    const days = (last.getTime() - first.getTime()) / 86_400_000;
    return Math.max(1, Math.round(days / 7));
  }, [series]);

  const subtitle = COMPARE_SUBTITLE[activeMetric](
    labels.length,
    spanWeeks
      ? `over the last ${spanWeeks} week${spanWeeks === 1 ? "" : "s"}`
      : "over time"
  );

  const allEmpty =
    state === "ready" && series.every((s) => s.data.length === 0);

  return (
    <div
      className="fixed inset-0 bg-slate-900/40 z-40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Industry comparison"
        className="bg-white rounded-2xl shadow-xl max-w-3xl w-full p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close comparison"
          className="absolute top-4 right-4 inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M3 3l10 10M13 3L3 13"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <header className="mb-6 pr-10">
          <p className="text-sm font-medium text-slate-500">
            Industry comparison
          </p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            {labels.length} industries
          </p>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </header>

        <div
          role="tablist"
          aria-label="Industry comparison metric"
          className="mb-4 flex flex-wrap gap-1 border-b border-slate-200"
        >
          {BREAKDOWN_METRIC_TABS.map((t) => {
            const selected = t.key === activeMetric;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveMetric(t.key)}
                className={[
                  "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  selected
                    ? "border-slate-900 text-slate-900"
                    : "border-transparent text-slate-500 hover:text-slate-700",
                ].join(" ")}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {state === "loading" && (
          <p className="text-sm text-slate-500">Loading comparison…</p>
        )}
        {state === "error" && (
          <p className="text-sm text-slate-500">
            Couldn&apos;t load comparison{message ? `: ${message}` : ""}
          </p>
        )}
        {state === "ready" && allEmpty && (
          <p className="text-sm text-slate-500">
            No snapshot history yet for any of the selected industries.
          </p>
        )}
        {state === "ready" && !allEmpty && (
          <MultiLineTrendChart series={series} formatter={activeTab.formatter} />
        )}
      </div>
    </div>
  );
}
