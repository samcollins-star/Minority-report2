/**
 * GET /api/companies/[id]/activity
 *
 * Returns recent activity (calls + meetings) for a company. Used by the client
 * "Show older" button on the company detail page to refetch a wider window.
 *
 * Query params:
 *   days  — how many days back to look (default 60, clamped to 1..365)
 *   limit — max items to return       (default 20, clamped to 1..100)
 */

import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getRecentActivityByCompanyId } from "@/lib/bigquery";

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const parsed = raw == null ? NaN : parseInt(raw, 10);
  const n = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawId = params.id;
  if (!/^\d+$/.test(rawId)) {
    return NextResponse.json({ error: "Invalid company id" }, { status: 400 });
  }

  const url = new URL(req.url);
  const days = clampInt(url.searchParams.get("days"), 60, 1, 365);
  const limit = clampInt(url.searchParams.get("limit"), 20, 1, 100);

  try {
    const activity = await getRecentActivityByCompanyId(rawId, days, limit);
    return NextResponse.json(activity);
  } catch (err) {
    console.error("[api/activity] BigQuery fetch failed:", err);
    return NextResponse.json(
      { error: "Failed to fetch activity" },
      { status: 500 }
    );
  }
}
