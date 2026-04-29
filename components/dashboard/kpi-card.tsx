/**
 * KpiCard — displays a single top-level metric on the dashboard.
 */

import type { KpiTrendPoint } from "@/lib/bigquery";

type AccentColor = "indigo" | "emerald" | "amber" | "rose";

interface KpiCardProps {
  label: string;
  value: number;
  /** Optional supplementary text shown below the number */
  subtext?: string;
  /** Optional icon — rendered as a small coloured square in the card header */
  accentColor?: AccentColor;
  /** Optional weekly snapshot history; sparkline renders only with ≥ 2 points */
  trend?: KpiTrendPoint[];
}

const accentStyles: Record<AccentColor, string> = {
  indigo: "bg-indigo-100 text-indigo-700",
  emerald: "bg-emerald-100 text-emerald-700",
  amber: "bg-amber-100 text-amber-700",
  rose: "bg-rose-100 text-rose-700",
};

const sparklineStroke: Record<AccentColor, string> = {
  indigo: "#6366f1",
  emerald: "#10b981",
  amber: "#f59e0b",
  rose: "#f43f5e",
};

export function KpiCard({
  label,
  value,
  subtext,
  accentColor = "indigo",
  trend,
}: KpiCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      {/* Accent dot */}
      <div
        className={[
          "mb-3 inline-flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold",
          accentStyles[accentColor],
        ].join(" ")}
        aria-hidden="true"
      >
        {/* Just a coloured square — the label carries the meaning */}
        &nbsp;
      </div>

      {/* Number */}
      <p className="text-3xl font-bold tracking-tight text-slate-900">
        {value.toLocaleString()}
      </p>

      {/* Label */}
      <p className="mt-1 text-sm font-medium text-slate-500">{label}</p>

      {/* Optional subtext */}
      {subtext && <p className="mt-2 text-xs text-slate-400">{subtext}</p>}

      {/* Optional sparkline — needs ≥ 2 points to draw a line */}
      {trend && trend.length >= 2 && (
        <Sparkline points={trend} stroke={sparklineStroke[accentColor]} />
      )}
    </div>
  );
}

interface SparklineProps {
  points: KpiTrendPoint[];
  stroke: string;
}

const SPARK_W = 120;
const SPARK_H = 28;
const SPARK_PAD = 2;

function Sparkline({ points, stroke }: SparklineProps) {
  const counts = points.map((p) => p.count);
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  const range = max - min || 1; // avoid divide-by-zero on a flat line

  const innerW = SPARK_W - SPARK_PAD * 2;
  const innerH = SPARK_H - SPARK_PAD * 2;
  const stepX = points.length > 1 ? innerW / (points.length - 1) : 0;

  const coords = counts.map((c, i) => {
    const x = SPARK_PAD + i * stepX;
    const y = SPARK_PAD + innerH - ((c - min) / range) * innerH;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return (
    <svg
      className="mt-3 block"
      width={SPARK_W}
      height={SPARK_H}
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      aria-hidden="true"
    >
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={coords.join(" ")}
      />
    </svg>
  );
}
