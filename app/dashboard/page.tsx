import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import {
  getDashboardKPIs,
  getBreakdownByProductGroup,
  getBreakdownByIndustry,
  getKpiTrend,
} from "@/lib/bigquery";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { BreakdownsWithTrends } from "@/components/dashboard/breakdowns-with-trends";

/**
 * Dashboard page — the main landing page after sign-in.
 * Fetches all data server-side; the BigQuery queries are cached for 1 hour.
 */
export default async function DashboardPage() {
  // Guard: redirect to sign-in if the user is not authenticated
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/auth/signin");
  }

  // Fetch KPIs, breakdowns, and the four KPI trends in parallel.
  // Trends are read from minority_report.dashboard_snapshots (weekly job).
  const [
    kpis,
    productGroupRows,
    industryRows,
    totalCompaniesTrend,
    customerTrend,
    spokenToTrend,
    targetAccountsTrend,
  ] = await Promise.all([
    getDashboardKPIs(),
    getBreakdownByProductGroup(),
    getBreakdownByIndustry(),
    getKpiTrend("total_companies"),
    getKpiTrend("customer_count"),
    getKpiTrend("spoken_to_12m_count"),
    getKpiTrend("target_account_count"),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Page heading */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Overview of the uk10k company universe
        </p>
      </div>

      {/* KPI tiles */}
      <section
        aria-labelledby="kpi-heading"
        className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <h2 id="kpi-heading" className="sr-only">
          Key metrics
        </h2>
        <KpiCard
          label="Total uk10k companies"
          value={kpis.totalCompanies}
          accentColor="indigo"
          trend={totalCompaniesTrend}
        />
        <KpiCard
          label="Customers"
          value={kpis.totalCustomers}
          accentColor="emerald"
          subtext={`${kpis.totalCompanies > 0 ? Math.round((kpis.totalCustomers / kpis.totalCompanies) * 100) : 0}% of universe`}
          trend={customerTrend}
        />
        <KpiCard
          label="Spoken to in last 12 months"
          value={kpis.spokenToLast12Months}
          accentColor="amber"
          trend={spokenToTrend}
        />
        <KpiCard
          label="Target accounts"
          value={kpis.targetAccounts}
          accentColor="violet"
          trend={targetAccountsTrend}
        />
      </section>

      {/* Breakdown tables */}
      <section aria-labelledby="breakdowns-heading" className="space-y-8">
        <h2 id="breakdowns-heading" className="sr-only">
          Breakdowns
        </h2>
        <BreakdownsWithTrends
          productGroupRows={productGroupRows}
          industryRows={industryRows}
        />
      </section>
    </div>
  );
}
