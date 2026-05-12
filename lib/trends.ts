import type { KpiTrendPoint } from "@/lib/bigquery";

/**
 * Zip companies + customers snapshot series by date and emit a percent series
 * (customers / companies * 100). Drops rows where companies is 0/missing or
 * customers is missing on the matching date.
 *
 * Output is keyed on the labels present in `companies`; callers pick their
 * own ordering when building chart series.
 */
export function derivePenetration(
  companies: Record<string, KpiTrendPoint[]>,
  customers: Record<string, KpiTrendPoint[]>
): Record<string, KpiTrendPoint[]> {
  const out: Record<string, KpiTrendPoint[]> = {};
  for (const [label, cArr] of Object.entries(companies)) {
    const custByDate = new Map(
      (customers[label] ?? []).map((p) => [p.snapshotDate, p.count])
    );
    const points: KpiTrendPoint[] = [];
    for (const c of cArr) {
      if (!c.count) continue;
      const cust = custByDate.get(c.snapshotDate);
      if (cust == null) continue;
      points.push({
        snapshotDate: c.snapshotDate,
        count: (cust / c.count) * 100,
      });
    }
    out[label] = points;
  }
  return out;
}
