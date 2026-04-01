/**
 * KpiCard — displays a single top-level metric on the dashboard.
 */

interface KpiCardProps {
  label: string;
  value: number;
  /** Optional supplementary text shown below the number */
  subtext?: string;
  /** Optional icon — rendered as a small coloured square in the card header */
  accentColor?: "indigo" | "emerald" | "amber" | "rose";
}

const accentStyles: Record<NonNullable<KpiCardProps["accentColor"]>, string> = {
  indigo: "bg-indigo-100 text-indigo-700",
  emerald: "bg-emerald-100 text-emerald-700",
  amber: "bg-amber-100 text-amber-700",
  rose: "bg-rose-100 text-rose-700",
};

export function KpiCard({
  label,
  value,
  subtext,
  accentColor = "indigo",
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
    </div>
  );
}
