"use client";

import { useMemo, useState } from "react";
import type { BreakdownRow } from "@/types";
import type { KpiTrendPoint } from "@/lib/bigquery";
import {
  TARGET_INDUSTRIES,
  TARGET_INDUSTRY_COLOURS,
  type TargetIndustry,
} from "@/lib/target-industries";
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

interface TargetIndustriesSectionProps {
  rows: BreakdownRow[];
  /**
   * Pre-fetched trends for the five target industries, one Record per metric,
   * each keyed on industry label. Empty arrays for industries with no snapshot
   * rows. Penetration is derived client-side from companies + customers.
   */
  trends: {
    companies: Record<string, KpiTrendPoint[]>;
    customers: Record<string, KpiTrendPoint[]>;
    target: Record<string, KpiTrendPoint[]>;
    spokenTo: Record<string, KpiTrendPoint[]>;
  };
}

const METRIC_TABS: MetricOption[] = [
  { key: "companies", label: "Companies", formatter: "count" },
  { key: "customers", label: "Customers", formatter: "count" },
  { key: "penetration", label: "Penetration", formatter: "percent" },
  { key: "target", label: "Target", formatter: "count" },
  { key: "spoken_to_12m", label: "Spoken to (12m)", formatter: "count" },
];

const SUBTITLE: Record<MetricKey, (weeks: string) => string> = {
  companies: (w) => `Company counts ${w}`,
  customers: (w) => `Customer counts ${w}`,
  penetration: (w) => `Customer penetration (% of companies) ${w}`,
  target: (w) => `Target accounts ${w}`,
  spoken_to_12m: (w) => `Companies spoken to in last 12 months, ${w}`,
};

function colourFor(label: string): string {
  return (
    TARGET_INDUSTRY_COLOURS[label as TargetIndustry] ?? "#94a3b8"
  );
}

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

interface OpenTrend {
  dimension: string;
  title: string;
  accentColor: string;
  currentValueByMetric: Partial<Record<MetricKey, number>>;
}

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

export function TargetIndustriesSection({
  rows,
  trends,
}: TargetIndustriesSectionProps) {
  const [openTrend, setOpenTrend] = useState<OpenTrend | null>(null);
  const [metric, setMetric] = useState<MetricKey>("companies");

  const metricOption = useMemo<MetricOption>(
    () => METRIC_TABS.find((t) => t.key === metric) ?? METRIC_TABS[0],
    [metric]
  );

  const series = useMemo<MultiLineSeries[]>(() => {
    const data: Record<string, KpiTrendPoint[]> =
      metric === "companies"
        ? trends.companies
        : metric === "customers"
          ? trends.customers
          : metric === "target"
            ? trends.target
            : metric === "spoken_to_12m"
              ? trends.spokenTo
              : derivePenetration(trends.companies, trends.customers);
    return TARGET_INDUSTRIES.map((label) => ({
      label,
      hex: colourFor(label),
      data: data[label] ?? [],
    }));
  }, [metric, trends]);

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

  const handleRowClick = (row: BreakdownRow) => {
    setOpenTrend({
      dimension: row.label,
      title: row.label,
      accentColor: colourFor(row.label),
      currentValueByMetric: rowToCurrentValueByMetric(row),
    });
  };

  return (
    <>
      <BreakdownTable
        title="Target industries"
        rows={rows}
        onRowClick={handleRowClick}
      />

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-slate-900">
            Target industry trends
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {SUBTITLE[metric](
              spanWeeks
                ? `over the last ${spanWeeks} week${spanWeeks === 1 ? "" : "s"}`
                : "over time"
            )}
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Target industry trends metric"
          className="mb-4 flex flex-wrap gap-1 border-b border-slate-200"
        >
          {METRIC_TABS.map((t) => {
            const selected = t.key === metric;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setMetric(t.key)}
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
          series={series}
          formatter={metricOption.formatter}
        />
      </div>

      {openTrend && (
        <KpiTrendModal
          open
          onClose={() => setOpenTrend(null)}
          title={openTrend.title}
          accentColor={openTrend.accentColor}
          scope="industry"
          dimension={openTrend.dimension}
          metricsAvailable={METRIC_TABS}
          initialMetric="companies"
          currentValueByMetric={openTrend.currentValueByMetric}
        />
      )}
    </>
  );
}
