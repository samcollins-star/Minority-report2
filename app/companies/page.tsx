import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getAllCompanies } from "@/lib/bigquery";
import { CompanyTable } from "@/components/company/company-table";

/**
 * Companies list page.
 * Data is fetched server-side and cached; the client component handles search.
 */
export default async function CompaniesPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/auth/signin");
  }

  const companies = await getAllCompanies();

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Page heading */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Companies</h1>
        <p className="mt-1 text-sm text-slate-500">
          All uk10k companies — {companies.length.toLocaleString()} total
        </p>
      </div>

      {/* Client component owns the search interaction */}
      <CompanyTable companies={companies} />
    </div>
  );
}
