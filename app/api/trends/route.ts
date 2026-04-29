/**
 * GET /api/trends?metric=...&dimension=...
 *
 * Returns weekly snapshot counts for a single metric/dimension pair.
 * Used by the dashboard breakdown tables to lazy-fetch a trend on row click.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getKpiTrend } from "@/lib/bigquery";

const ALLOWED_METRICS = new Set([
  "companies_by_product",
  "companies_by_industry",
]);

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const metric = url.searchParams.get("metric");
  const dimension = url.searchParams.get("dimension");

  if (!metric || !ALLOWED_METRICS.has(metric)) {
    return NextResponse.json({ error: "Invalid metric" }, { status: 400 });
  }
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
