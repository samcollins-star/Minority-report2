"use client";

import { useEffect, useRef } from "react";
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

interface KpiTrendModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  currentValue: number;
  unit?: string;
  data: KpiTrendPoint[];
  accentColor: string;
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

export function KpiTrendModal({
  open,
  onClose,
  title,
  currentValue,
  unit,
  data,
  accentColor,
}: KpiTrendModalProps) {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    closeBtnRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const lastPoint = data[data.length - 1];
  const firstPoint = data[0];
  const snapshotCount = data.length;
  const dayMs = 1000 * 60 * 60 * 24;
  const spanDays =
    (parseISO(lastPoint.snapshotDate).getTime() -
      parseISO(firstPoint.snapshotDate).getTime()) /
    dayMs;
  const spanWeeks = Math.max(1, Math.round(spanDays / 7));

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
            {currentValue.toLocaleString()}
          </p>
          {unit && (
            <p className="mt-1 text-xs text-slate-400">{unit}</p>
          )}
          <p className="mt-2 text-xs text-slate-400">
            Last updated {formatFullDate(lastPoint.snapshotDate)}
          </p>
        </header>

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
                domain={["auto", "auto"]}
              />
              <Tooltip
                formatter={(value) => [
                  Number(value).toLocaleString(),
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

        <p className="mt-4 text-xs text-slate-400">
          {snapshotCount} snapshot{snapshotCount === 1 ? "" : "s"} over the last{" "}
          {spanWeeks} week{spanWeeks === 1 ? "" : "s"}
        </p>
      </div>
    </div>
  );
}
