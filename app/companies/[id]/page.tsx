import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import {
  getCompanyById,
  getCompanySummary,
  getContactsByCompanyId,
  getDealsByCompanyId,
  getOwnerNameById,
} from "@/lib/bigquery";
import {
  getLiveActivitiesByCompanyId,
  getLiveContactsByCompanyId,
} from "@/lib/hubspot";
import type { Activity, Company, Contact } from "@/types";
import { CompanyOverview } from "@/components/company/overview";
import { ContactsTable } from "@/components/company/contacts-table";
import { DealsTable } from "@/components/company/deals-table";
import { ActivityFeed } from "@/components/company/activity-feed";
import { SnapshotCard } from "@/components/company/snapshot-card";

const SNAPSHOT_DAYS = 365;

const HUBSPOT_PORTAL_ID = process.env.HUBSPOT_PORTAL_ID ?? "329016";

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

  // Fetch company, live contacts (HubSpot), deals, and recent activity in parallel.
  // Live contacts fall back to BigQuery if HubSpot is unavailable.
  // Snapshot needs a 12-month-single-item activity window, separate from the
  // 60-day feed, so the "not contacted in past year" rule has full visibility.
  const [
    rawCompany,
    liveContactsOrNull,
    deals,
    activity,
    summary,
    snapshotActivity,
  ] = await Promise.all([
    getCompanyById(rawId),
    getLiveContactsByCompanyId(rawId).catch((err: unknown) => {
      console.error("[contacts] HubSpot fetch failed — will fall back to BigQuery:", err);
      return null;
    }),
    getDealsByCompanyId(rawId),
    getLiveActivitiesByCompanyId(rawId).catch((err: unknown) => {
      console.error("[activity] HubSpot fetch failed:", err);
      return [] as Activity[];
    }),
    getCompanySummary(rawId).catch((err: unknown) => {
      console.error("[summary] BigQuery fetch failed:", err);
      return null;
    }),
    getLiveActivitiesByCompanyId(rawId, SNAPSHOT_DAYS, 1).catch((err: unknown) => {
      console.error("[snapshot-activity] HubSpot fetch failed:", err);
      return [] as Activity[];
    }),
  ]);

  const latestForSnapshot = snapshotActivity[0] ?? null;
  const latestActorName = latestForSnapshot?.meta.actorOwnerId
    ? await getOwnerNameById(latestForSnapshot.meta.actorOwnerId).catch(
        (err: unknown) => {
          console.error("[snapshot-owner] lookup failed:", err);
          return null;
        }
      )
    : null;

  let contacts: Contact[];
  let contactsFromFallback = false;
  if (liveContactsOrNull !== null) {
    contacts = liveContactsOrNull;
  } else {
    contacts = await getContactsByCompanyId(rawId).catch((err: unknown) => {
      console.error("[contacts] BigQuery fallback also failed:", err);
      return [] as Contact[];
    });
    contactsFromFallback = true;
  }

  if (!rawCompany) {
    notFound();
  }

  // BigQueryTimestamp serialises as { value: "<ISO string>" } rather than a
  // plain string — extract .value before the JSON round-trip, same as the
  // companies list page.
  const tsField = rawCompany.hs_last_sales_activity_timestamp as unknown;
  const ts: string | null =
    tsField == null
      ? null
      : typeof tsField === "object"
      ? ((tsField as { value: string }).value ?? null)
      : (tsField as string);
  const company: Company = {
    ...(JSON.parse(JSON.stringify(rawCompany)) as Company),
    hs_last_sales_activity_timestamp: ts,
  };

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

      {/* Sticky page heading + external links + snapshot card.
          On md+ this becomes a flex row with the snapshot pinned to the right
          and sticks to the top of the viewport as you scroll. On mobile the
          sticky behaviour is dropped and the card stacks below. */}
      <div className="static z-30 border-b border-slate-200 bg-white/95 py-4 backdrop-blur supports-[backdrop-filter]:bg-white/80 md:sticky md:top-14">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-slate-900">
              {company.name ?? "Unknown company"}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              hs_object_id: {company.hs_object_id}
            </p>

            {/* External links */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
          {/* HubSpot — always available */}
          <a
            href={`https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/company/${company.hs_object_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition-colors hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
          >
            {/* HubSpot sprocket icon */}
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18.164 9.713a3.27 3.27 0 0 0-.497-.244V7.33a1.842 1.842 0 0 0 1.065-1.663V5.56a1.843 1.843 0 0 0-1.843-1.843h-.107a1.843 1.843 0 0 0-1.843 1.843v.107c0 .74.436 1.38 1.065 1.663v2.14a3.29 3.29 0 0 0-1.398.612L8.63 6.041a2.585 2.585 0 0 0 .064-.557 2.598 2.598 0 1 0-2.598 2.597c.49 0 .947-.138 1.337-.375l5.92 3.976a3.294 3.294 0 0 0-.085 2.564l-1.79 1.79a2.189 2.189 0 0 0-.645-.098 2.202 2.202 0 1 0 2.202 2.201 2.188 2.188 0 0 0-.326-1.145l1.772-1.772a3.296 3.296 0 1 0 3.683-5.509z"/>
            </svg>
            HubSpot
          </a>

          {/* Website — only if present */}
          {company.website && (
            <a
              href={company.website.startsWith("http") ? company.website : `https://${company.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900"
            >
              {/* Globe icon */}
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
              </svg>
              Website
            </a>
          )}

          {/* LinkedIn — only if present */}
          {company.linkedin_company_page && (
            <a
              href={company.linkedin_company_page}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
            >
              {/* LinkedIn icon */}
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
              LinkedIn
            </a>
          )}

          {/* Beauhurst — only if present */}
          {company.beauhurst_data_beauhurst_url && (
            <a
              href={company.beauhurst_data_beauhurst_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition-colors hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
            >
              {/* Beauhurst "B" wordmark icon */}
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M6 4h7.5C16.433 4 18 5.567 18 8c0 1.26-.51 2.4-1.338 3.2A4 4 0 0 1 18 15c0 2.761-2.239 5-5 5H6V4zm2 2v5h5.5C15.433 11 17 9.433 17 7.5S15.433 4 13.5 4H8v2zm0 7v6h5C15.105 19 17 17.105 17 15s-1.895-4-4-4H8v2z"/>
              </svg>
              Beauhurst
            </a>
          )}
        </div>
          </div>

          {/* Snapshot card — right column on desktop, stacked below on mobile */}
          {summary && (
            <div className="md:w-80 md:flex-shrink-0">
              <SnapshotCard
                summary={summary}
                latestActivity={
                  latestForSnapshot
                    ? {
                        kind: latestForSnapshot.kind,
                        timestamp: latestForSnapshot.timestamp,
                        actorName: latestActorName,
                      }
                    : null
                }
                activityDaysBack={SNAPSHOT_DAYS}
              />
            </div>
          )}
        </div>
      </div>

      {/* Four sections stacked vertically */}
      <div className="mt-6 space-y-6">
        {/* 1. Overview */}
        <CompanyOverview company={company} />

        {/* 2. Contacts */}
        <ContactsTable contacts={contacts} fallback={contactsFromFallback} />

        {/* 3. Deals */}
        <DealsTable deals={deals} />

        {/* 4. Activity */}
        <ActivityFeed
          companyId={rawId}
          initial={activity}
          portalId={HUBSPOT_PORTAL_ID}
        />
      </div>
    </div>
  );
}
