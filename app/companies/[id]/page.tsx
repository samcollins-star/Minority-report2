import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import {
  getCompanyById,
  getContactsByCompanyId,
  getDealsByCompanyId,
} from "@/lib/bigquery";
import { CompanyOverview } from "@/components/company/overview";
import { ContactsTable } from "@/components/company/contacts-table";
import { DealsTable } from "@/components/company/deals-table";

interface PageProps {
  params: { id: string };
}

/**
 * Company detail page — shows overview, contacts, deals and an activities placeholder.
 * The `id` segment is the company's hs_object_id (numeric string).
 */
export default async function CompanyDetailPage({ params }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/auth/signin");
  }

  // Validate that the id looks safe before passing to BigQuery
  // hs_object_id values are always numeric strings
  const rawId = params.id;
  if (!/^\d+$/.test(rawId)) {
    notFound();
  }

  // Fetch company, contacts and deals in parallel
  const [company, contacts, deals] = await Promise.all([
    getCompanyById(rawId),
    getContactsByCompanyId(rawId),
    getDealsByCompanyId(rawId),
  ]);

  if (!company) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 text-sm text-slate-400">
        <Link href="/companies" className="hover:text-slate-700">
          Companies
        </Link>
        <span aria-hidden="true">/</span>
        <span className="font-medium text-slate-700">{company.name}</span>
      </nav>

      {/* Page heading */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">
          {company.name ?? "Unknown company"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          hs_object_id: {company.hs_object_id}
        </p>
      </div>

      {/* Four sections stacked vertically */}
      <div className="space-y-6">
        {/* 1. Overview */}
        <CompanyOverview company={company} />

        {/* 2. Contacts */}
        <ContactsTable contacts={contacts} />

        {/* 3. Deals */}
        <DealsTable deals={deals} />

        {/* 4. Activities — coming soon placeholder */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="text-base font-semibold text-slate-900">
              Activities
            </h2>
          </div>
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            {/* Placeholder illustration — a simple clock icon */}
            <svg
              className="mb-4 h-12 w-12 text-slate-200"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              />
            </svg>
            <p className="text-sm font-medium text-slate-400">Coming soon</p>
            <p className="mt-1 text-xs text-slate-300">
              Activity timeline will appear here in a future release.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
