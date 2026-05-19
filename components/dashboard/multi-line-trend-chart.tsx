"use client";

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

export interface MultiLineSeries {
  /** Display name (e.g. "BeauhurstSales" or "B2B software") */
  label: string;
  /** Line stroke colour (raw hex — Recharts can't read Tailwind classes) */
  hex: string;
  data: KpiTrendPoint[];
}

interface MultiLineTrendChartProps {
  series: MultiLineSeries[];
  height?: number;
  showLegend?: boolean;
  /**
   * How to format Y-axis ticks and tooltip values.
   * - `count` (default): integer with thousand separators.
   * - `percent`: one-decimal percent for tooltips, integer percent on ticks.
   * The chart stays unaware of metric semantics; it just formats numbers.
   */
  formatter?: "count" | "percent";
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

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatTick(iso: string): string {
  return tickFmt.format(parseISO(iso));
}

function formatTooltipLabel(iso: string): string {
  return tooltipFmt.format(parseISO(iso));
}

/**
 * Merge each series' KpiTrendPoint[] into a single date-keyed row array
 * suitable for a shared Recharts <LineChart>.
 *
 * Output shape: [{ snapshotDate: "...", [label1]: count, [label2]: count }]
 * Missing values for a given (date, label) are simply omitted from the row,
 * which Recharts renders as a gap by default.
 */
function buildChartRows(
  series: MultiLineSeries[]
): Array<{ snapshotDate: string } & Record<string, number | string>> {
  const byDate = new Map<string, Record<string, number>>();
  for (const s of series) {
    for (const p of s.data) {
      const row = byDate.get(p.snapshotDate) ?? {};
      row[s.label] = p.count;
      byDate.set(p.snapshotDate, row);
    }
  }
  const rows = Array.from(byDate.entries())
    .map(([snapshotDate, values]) => ({ snapshotDate, ...values }))
    .sort((a, b) => (a.snapshotDate < b.snapshotDate ? -1 : 1));
  return rows;
}

export function MultiLineTrendChart({
  series,
  height = 280,
  showLegend = true,
  formatter = "count",
}: MultiLineTrendChartProps) {
  // A series with fewer than 2 points renders as either a single dot or
  // nothing at all — drop it so a partially-seeded dashboard doesn't show
  // misleading specks.
  const renderable = series.filter((s) => s.data.length >= 2);

  if (renderable.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Trends will appear once a few weekly snapshots have been captured.
      </p>
    );
  }

  const rows = buildChartRows(renderable);

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={rows}
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
            // For percent metrics, anchor the axis at 0 so tiny variations
            // don't get visually exaggerated by tight auto-scaling.
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
            labelFormatter={(label) => formatTooltipLabel(String(label))}
            formatter={(value, name) => [
              value == null
                ? "—"
                : formatter === "percent"
                  ? `${Number(value).toFixed(1)}%`
                  : Number(value).toLocaleString(),
              String(name),
            ]}
            contentStyle={{
              background: "white",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
            }}
          />
          {renderable.map((s) => (
            <Line
              key={s.label}
              type="monotone"
              dataKey={s.label}
              name={s.label}
              stroke={s.hex}
              strokeWidth={2}
              dot={{ r: 3, fill: s.hex }}
              activeDot={{ r: 5, fill: s.hex }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {showLegend && (
        <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          {renderable.map((s) => {
            const first = s.data[0]?.count;
            const last = s.data[s.data.length - 1]?.count;
            const change =
              typeof first === "number" && typeof last === "number"
                ? last - first
                : null;
            return (
              <li
                key={s.label}
                className="inline-flex items-center gap-2 text-sm text-slate-600"
              >
                <span
                  aria-hidden="true"
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: s.hex }}
                />
                <span>{s.label}</span>
                {typeof last === "number" && (
                  <span className="font-medium text-slate-900">
                    {formatter === "percent"
                      ? `${last.toFixed(1)}%`
                      : last.toLocaleString()}
                  </span>
                )}
                {change != null && change !== 0 && (
                  <span
                    className={
                      change > 0
                        ? "text-emerald-600 text-xs"
                        : "text-rose-600 text-xs"
                    }
                  >
                    {change > 0 ? "+" : ""}
                    {formatter === "percent"
                      ? `${change.toFixed(1)}%`
                      : change.toLocaleString()}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
