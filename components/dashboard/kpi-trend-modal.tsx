"use client";

import { useEffect, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { KpiTrendPoint } from "@/lib/bigquery";

export type MetricKey =
  | "companies"
  | "customers"
  | "penetration"
  | "target"
  | "spoken_to_12m";

export interface MetricOption {
  key: MetricKey;
  label: string;
  formatter: "count" | "percent";
}

type Scope = "product" | "industry";

interface KpiTrendModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  unit?: string;
  accentColor: string;

  // ---- Single-metric mode (existing behaviour, used by KpiCard) -----------
  /** Pre-fetched series; required when `scope` is null/undefined. */
  data?: KpiTrendPoint[];
  /** Header value shown when in single-metric mode. */
  currentValue?: number;

  // ---- Multi-metric mode (used by breakdown row clicks) ------------------
  /**
   * When set, the modal renders a metric tab strip and fetches each metric's
   * series itself via /api/trends. When null/undefined, behaves as single-metric.
   */
  scope?: Scope | null;
  dimension?: string | null;
  metricsAvailable?: MetricOption[];
  initialMetric?: MetricKey;
  /** Header value per metric — used so flipping tabs updates the headline number. */
  currentValueByMetric?: Partial<Record<MetricKey, number>>;
}

const tickFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
});
const tooltipFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const fullFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function parseISO(iso: string): Date {
  // Treat the yyyy-mm-dd string as a calendar date in UTC to avoid
  // timezone shifts that can drop a day in en-GB formatting.
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatTick(iso: string): string {
  return tickFmt.format(parseISO(iso));
}

function formatTooltipLabel(iso: string): string {
  return tooltipFmt.format(parseISO(iso));
}

function formatFullDate(iso: string): string {
  return fullFmt.format(parseISO(iso));
}

function formatHeaderValue(value: number, formatter: "count" | "percent") {
  if (formatter === "percent") return `${value.toFixed(1)}%`;
  return value.toLocaleString();
}

function formatChartValue(value: number, formatter: "count" | "percent") {
  if (formatter === "percent") return `${value.toFixed(1)}%`;
  return value.toLocaleString();
}

/**
 * Map a (metric, scope) pair to the corresponding snapshot metric_key.
 * Penetration is derived client-side from companies + customers, so it has
 * no single backing metric_key.
 */
function metricKeyFor(metric: MetricKey, scope: Scope): string | null {
  switch (metric) {
    case "companies":
      return `companies_by_${scope}`;
    case "customers":
      return `customers_by_${scope}`;
    case "target":
      return `target_by_${scope}`;
    case "spoken_to_12m":
      return `spoken_to_12m_by_${scope}`;
    case "penetration":
      return null;
  }
}

async function fetchSeries(
  metricKey: string,
  dimension: string
): Promise<KpiTrendPoint[]> {
  const params = new URLSearchParams({ metric: metricKey, dimension });
  const res = await fetch(`/api/trends?${params.toString()}`);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return (await res.json()) as KpiTrendPoint[];
}

/**
 * For penetration: fetch companies + customers in parallel and zip by
 * snapshot_date. Drop rows where companies is 0 or missing on either side.
 * The output's `count` field carries the percent (0-100 float).
 */
async function fetchPenetration(
  scope: Scope,
  dimension: string
): Promise<KpiTrendPoint[]> {
  const [companies, customers] = await Promise.all([
    fetchSeries(`companies_by_${scope}`, dimension),
    fetchSeries(`customers_by_${scope}`, dimension),
  ]);
  const customersByDate = new Map(
    customers.map((p) => [p.snapshotDate, p.count])
  );
  const points: KpiTrendPoint[] = [];
  for (const c of companies) {
    if (!c.count) continue;
    const cust = customersByDate.get(c.snapshotDate);
    if (cust == null) continue;
    points.push({
      snapshotDate: c.snapshotDate,
      count: (cust / c.count) * 100,
    });
  }
  return points;
}

export function KpiTrendModal({
  open,
  onClose,
  title,
  unit,
  accentColor,
  data,
  currentValue,
  scope,
  dimension,
  metricsAvailable,
  initialMetric,
  currentValueByMetric,
}: KpiTrendModalProps) {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  // ---- Esc + initial focus ---------------------------------------------
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    closeBtnRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // ---- Multi-metric mode bookkeeping -----------------------------------
  const isMulti = !!scope && !!dimension && !!metricsAvailable?.length;
  const tabs = metricsAvailable ?? [];
  const [activeMetric, setActiveMetric] = useState<MetricKey>(
    initialMetric ?? tabs[0]?.key ?? "companies"
  );

  // Per-(dimension, metric) cache. Keyed on `${dimension}::${metric}` so
  // re-opening the modal for a different row doesn't surface stale series.
  const cacheRef = useRef<Map<string, KpiTrendPoint[]>>(new Map());
  const [series, setSeries] = useState<KpiTrendPoint[] | null>(null);
  const [fetchState, setFetchState] = useState<
    "idle" | "loading" | "error" | "ready"
  >("idle");
  const [fetchError, setFetchError] = useState<string | null>(null);
  const reqRef = useRef(0);

  // Reset active metric to the initial whenever the dimension changes
  // (so opening a different row starts on Companies).
  useEffect(() => {
    if (!isMulti) return;
    setActiveMetric(initialMetric ?? tabs[0]?.key ?? "companies");
    // We deliberately exclude `tabs`/`initialMetric` from deps — this should
    // only fire when the *target dimension* changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimension, scope, isMulti]);

  // Fetch (or read cache) whenever scope/dimension/activeMetric changes.
  useEffect(() => {
    if (!open || !isMulti || !scope || !dimension) return;
    const cacheKey = `${dimension}::${activeMetric}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setSeries(cached);
      setFetchState("ready");
      setFetchError(null);
      return;
    }

    const reqId = ++reqRef.current;
    setSeries(null);
    setFetchError(null);
    setFetchState("loading");

    const promise =
      activeMetric === "penetration"
        ? fetchPenetration(scope, dimension)
        : (() => {
            const key = metricKeyFor(activeMetric, scope);
            if (!key) return Promise.resolve([]);
            return fetchSeries(key, dimension);
          })();

    promise
      .then((points) => {
        if (reqId !== reqRef.current) return;
        cacheRef.current.set(cacheKey, points);
        setSeries(points);
        setFetchState("ready");
      })
      .catch((err) => {
        if (reqId !== reqRef.current) return;
        setFetchError(
          err instanceof Error ? err.message : "Failed to load trend"
        );
        setFetchState("error");
      });
  }, [open, isMulti, scope, dimension, activeMetric]);

  // Clear the cache when the modal closes so stale data doesn't surface
  // if the underlying snapshots change between sessions.
  useEffect(() => {
    if (!open) cacheRef.current.clear();
  }, [open]);

  if (!open) return null;

  // ---- Resolve the active series + formatter ---------------------------
  const activeOption = isMulti
    ? tabs.find((t) => t.key === activeMetric)
    : undefined;
  const formatter: "count" | "percent" = activeOption?.formatter ?? "count";

  const renderedData: KpiTrendPoint[] = isMulti ? (series ?? []) : (data ?? []);
  const headerValue = isMulti
    ? currentValueByMetric?.[activeMetric] ?? null
    : currentValue ?? null;

  // ---- Render ----------------------------------------------------------
  return (
    <div
      className="fixed inset-0 bg-slate-900/40 z-40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${title} trend`}
        className="bg-white rounded-2xl shadow-xl max-w-3xl w-full p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={closeBtnRef}
          type="button"
          onClick={onClose}
          aria-label="Close trend chart"
          className="absolute top-4 right-4 inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M3 3l10 10M13 3L3 13"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <header className="mb-6 pr-10">
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-1 text-4xl font-bold tracking-tight text-slate-900">
            {headerValue == null
              ? "—"
              : formatHeaderValue(headerValue, formatter)}
          </p>
          {unit && <p className="mt-1 text-xs text-slate-400">{unit}</p>}
          {renderedData.length > 0 && (
            <p className="mt-2 text-xs text-slate-400">
              Last updated{" "}
              {formatFullDate(
                renderedData[renderedData.length - 1].snapshotDate
              )}
            </p>
          )}
        </header>

        {isMulti && tabs.length > 0 && (
          <div
            role="tablist"
            aria-label="Metric"
            className="mb-4 flex flex-wrap gap-1 border-b border-slate-200"
          >
            {tabs.map((t) => {
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
        )}

        <ChartBody
          state={
            isMulti
              ? fetchState === "ready" && renderedData.length === 0
                ? "empty"
                : fetchState
              : renderedData.length === 0
                ? "empty"
                : "ready"
          }
          error={fetchError}
          data={renderedData}
          accentColor={accentColor}
          formatter={formatter}
          title={activeOption?.label ?? title}
        />

        {renderedData.length > 0 && (
          <p className="mt-4 text-xs text-slate-400">
            {renderedData.length} snapshot
            {renderedData.length === 1 ? "" : "s"} over the last{" "}
            {spanWeeks(renderedData)} week
            {spanWeeks(renderedData) === 1 ? "" : "s"}
          </p>
        )}
      </div>
    </div>
  );
}

function spanWeeks(data: KpiTrendPoint[]): number {
  if (data.length < 2) return 1;
  const first = parseISO(data[0].snapshotDate);
  const last = parseISO(data[data.length - 1].snapshotDate);
  const days = (last.getTime() - first.getTime()) / 86_400_000;
  return Math.max(1, Math.round(days / 7));
}

interface ChartBodyProps {
  state: "idle" | "loading" | "error" | "empty" | "ready";
  error: string | null;
  data: KpiTrendPoint[];
  accentColor: string;
  formatter: "count" | "percent";
  title: string;
}

function ChartBody({
  state,
  error,
  data,
  accentColor,
  formatter,
  title,
}: ChartBodyProps) {
  if (state === "loading" || state === "idle") {
    return <p className="text-sm text-slate-500">Loading trend…</p>;
  }
  if (state === "error") {
    return (
      <p className="text-sm text-slate-500">
        Couldn&apos;t load trend{error ? `: ${error}` : ""}
      </p>
    );
  }
  if (state === "empty") {
    return (
      <p className="text-sm text-slate-500">
        No snapshot history yet for this metric. Check back next week.
      </p>
    );
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart
          data={data}
          margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="snapshotDate"
            tickFormatter={formatTick}
            tick={{ fill: "#64748b", fontSize: 12 }}
          />
          <YAxis
            tick={{ fill: "#64748b", fontSize: 12 }}
            // Count metrics (companies, customers, etc.) are whole numbers —
            // never show fractional ticks like 72.25.
            allowDecimals={formatter === "percent"}
            // For percent metrics, anchor at 0 so tiny variations don't get
            // visually exaggerated by tight auto-scaling.
            domain={
              formatter === "percent"
                ? [0, (dataMax: number) => Math.max(1, Math.ceil(dataMax + 1))]
                : ["auto", "auto"]
            }
            tickFormatter={(v: number) =>
              formatter === "percent"
                ? `${v.toFixed(1)}%`
                : v.toLocaleString()
            }
          />
          <Tooltip
            formatter={(value) => [
              formatChartValue(Number(value), formatter),
              title,
            ]}
            labelFormatter={(label) => formatTooltipLabel(String(label))}
            contentStyle={{
              background: "white",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
            }}
          />
          <Line
            type="monotone"
            dataKey="count"
            stroke={accentColor}
            strokeWidth={2}
            dot={{ r: 3, fill: accentColor }}
            activeDot={{ r: 5, fill: accentColor }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

