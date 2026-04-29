"use client";

import { useEffect, useState } from "react";
import type { BreakdownRow } from "@/types";
import type { KpiTrendPoint } from "@/lib/bigquery";
import { BreakdownTable } from "./breakdown-table";
import { KpiTrendModal } from "./kpi-trend-modal";

interface BreakdownsWithTrendsProps {
  productGroupRows: BreakdownRow[];
  industryRows: BreakdownRow[];
}

interface OpenTrend {
  metricKey: "companies_by_product" | "companies_by_industry";
  dimension: string;
  title: string;
  currentValue: number;
  accentColor: string;
}

const PRODUCT_ACCENTS: Record<string, string> = {
  BeauhurstSales: "#4f46e5",
  BeauhurstAdvise: "#059669",
  BeauhurstImpact: "#d97706",
  BeauhurstInvest: "#7c3aed",
  Unknown: "#64748b",
};

const INDUSTRY_DEFAULT_ACCENT = "#4f46e5";

export function BreakdownsWithTrends({
  productGroupRows,
  industryRows,
}: BreakdownsWithTrendsProps) {
  const [openTrend, setOpenTrend] = useState<OpenTrend | null>(null);
  const [trendData, setTrendData] = useState<KpiTrendPoint[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch trend data when a row is clicked.
  useEffect(() => {
    if (!openTrend) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setTrendData(null);

    const url = `/api/trends?metric=${encodeURIComponent(openTrend.metricKey)}&dimension=${encodeURIComponent(openTrend.dimension)}`;
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return res.json() as Promise<KpiTrendPoint[]>;
      })
      .then((points) => {
        if (cancelled) return;
        setTrendData(points);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load trend");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [openTrend]);

  const close = () => {
    setOpenTrend(null);
    setTrendData(null);
    setError(null);
  };

  const handleProductClick = (row: BreakdownRow) => {
    setOpenTrend({
      metricKey: "companies_by_product",
      dimension: row.label,
      title: row.label,
      currentValue: row.totalCompanies,
      accentColor: PRODUCT_ACCENTS[row.label] ?? "#64748b",
    });
  };

  const handleIndustryClick = (row: BreakdownRow) => {
    setOpenTrend({
      metricKey: "companies_by_industry",
      dimension: row.label,
      title: row.label,
      currentValue: row.totalCompanies,
      accentColor: INDUSTRY_DEFAULT_ACCENT,
    });
  };

  return (
    <>
      <BreakdownTable
        title="By Product Group"
        rows={productGroupRows}
        onRowClick={handleProductClick}
      />
      <BreakdownTable
        title="By Industry"
        rows={industryRows}
        onRowClick={handleIndustryClick}
      />

      {openTrend && (loading || error || (trendData && trendData.length === 0)) && (
        <PlaceholderDialog
          title={openTrend.title}
          currentValue={openTrend.currentValue}
          state={loading ? "loading" : error ? "error" : "empty"}
          message={error ?? undefined}
          onClose={close}
        />
      )}

      {openTrend && trendData && trendData.length > 0 && (
        <KpiTrendModal
          open
          onClose={close}
          title={openTrend.title}
          currentValue={openTrend.currentValue}
          data={trendData}
          accentColor={openTrend.accentColor}
        />
      )}
    </>
  );
}

interface PlaceholderDialogProps {
  title: string;
  currentValue: number;
  state: "loading" | "error" | "empty";
  message?: string;
  onClose: () => void;
}

function PlaceholderDialog({
  title,
  currentValue,
  state,
  message,
  onClose,
}: PlaceholderDialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const body =
    state === "loading"
      ? "Loading trend…"
      : state === "error"
        ? `Couldn't load trend${message ? `: ${message}` : ""}`
        : "No snapshot history yet for this group. Check back next week.";

  return (
    <div
      className="fixed inset-0 bg-slate-900/40 z-40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${title} trend`}
        className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
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

        <header className="mb-4 pr-10">
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-1 text-4xl font-bold tracking-tight text-slate-900">
            {currentValue.toLocaleString()}
          </p>
        </header>

        <p className="text-sm text-slate-500">{body}</p>
      </div>
    </div>
  );
}
