/**
 * GET /api/trends?metric=...&dimension=...
 * GET /api/trends?metric=...&dimensions=a,b,c
 *
 * Returns weekly snapshot counts for one or more dimensions.
 * - Single-dimension form returns a KpiTrendPoint[].
 * - Multi-dimension form (`dimensions=`) returns a { [dimension]: KpiTrendPoint[] } object map.
 *
 * Used by the dashboard breakdown tables to lazy-fetch a trend on row click,
 * and by the industry compare modal for batch fetches.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getKpiTrend, getKpiTrendsBatch } from "@/lib/bigquery";

const ALLOWED_METRICS = new Set([
  // Headline KPIs (no dimension)
  "total_companies",
  "customer_count",
  "target_account_count",
  "spoken_to_12m_count",
  // Per-product breakdowns
  "companies_by_product",
  "customers_by_product",
  "target_by_product",
  "spoken_to_12m_by_product",
  // Per-industry breakdowns
  "companies_by_industry",
  "customers_by_industry",
  "target_by_industry",
  "spoken_to_12m_by_industry",
]);

const MAX_BATCH_DIMENSIONS = 8;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const metric = url.searchParams.get("metric");
  const dimension = url.searchParams.get("dimension");
  const dimensionsParam = url.searchParams.get("dimensions");

  if (!metric || !ALLOWED_METRICS.has(metric)) {
    return NextResponse.json({ error: "Invalid metric" }, { status: 400 });
  }

  // Multi-dimension batch
  if (dimensionsParam) {
    const dimensions = Array.from(
      new Set(
        dimensionsParam
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      )
    );
    if (dimensions.length === 0) {
      return NextResponse.json(
        { error: "No dimensions provided" },
        { status: 400 }
      );
    }
    if (dimensions.length > MAX_BATCH_DIMENSIONS) {
      return NextResponse.json(
        { error: `Too many dimensions (max ${MAX_BATCH_DIMENSIONS})` },
        { status: 400 }
      );
    }

    try {
      const map = await getKpiTrendsBatch(metric, dimensions);
      const out: Record<string, unknown> = {};
      for (const d of dimensions) out[d] = map.get(d) ?? [];
      return NextResponse.json(out);
    } catch (err) {
      console.error("[api/trends] batch fetch failed:", err);
      return NextResponse.json(
        { error: "Failed to fetch trends" },
        { status: 500 }
      );
    }
  }

  // Single-dimension (existing behaviour)
  if (!dimension) {
    return NextResponse.json({ error: "Missing dimension" }, { status: 400 });
  }
  try {
    const trend = await getKpiTrend(metric, dimension);
    return NextResponse.json(trend);
  } catch (err) {
    console.error("[api/trends] BigQuery fetch failed:", err);
    return NextResponse.json(
      { error: "Failed to fetch trend" },
      { status: 500 }
    );
  }
}
