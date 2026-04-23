// ---------------------------------------------------------------------------
// Shared TypeScript types for the Minority Report CRM
// ---------------------------------------------------------------------------

// ---- BigQuery row shapes --------------------------------------------------

/**
 * A company row from the BigQuery companies table.
 * Only the columns we actually use are listed here; the real table may have more.
 */
export interface Company {
  /** Primary identifier — used in URL slugs */
  hs_object_id: string;

  /** Display name */
  name: string;

  /** If TRUE this company is in the uk10k universe */
  uk10k: boolean;

  /** 'customer' | 'prospect' | null etc. */
  planhat_customer_status: string | null;

  /** Whether the sales team has flagged this as a target account */
  hs_is_target_account: boolean;

  /** ISO timestamp of the last recorded sales activity */
  hs_last_sales_activity_timestamp: string | null;

  /** Product group — one of the four Beauhurst products */
  beauhurst_product: string | null;

  /** Primary industry classification */
  new_beauhurst_industries: string | null;

  /** UK headcount band from the uk5k dataset */
  uk_headcount_uk5k: string | null;

  /** Global headcount band from the uk5k dataset */
  global_headcount_uk5k: string | null;

  /** Company website URL (may be bare domain or full https:// URL) */
  website: string | null;

  /** LinkedIn company page URL */
  linkedin_company_page: string | null;

  /** Beauhurst platform URL */
  beauhurst_data_beauhurst_url: string | null;

  /** HubSpot owner id, or null if unassigned */
  owner_id: string | null;

  /** Display name for the owner — "First Last", or email fallback, or null if unassigned */
  owner_name: string | null;
}

/** A contact row, joined to a company via the company's hs_object_id */
export interface Contact {
  id: string;
  firstname: string | null;
  lastname: string | null;
  jobtitle: string | null;
  email: string | null;
  /** HubSpot fit_score custom property — live fetch only */
  fit_score?: number | null;
  /** ISO timestamp of the last time this contact was contacted — live fetch only */
  notes_last_contacted?: string | null;
}

/** One engagement on a company's activity feed. */
export type ActivityKind = "call" | "meeting" | "email" | "note" | "task";

export interface Activity {
  id: string;
  kind: ActivityKind;
  /** ISO string — sourced from hs_timestamp (normalised across kinds by HubSpot). */
  timestamp: string;
  /** Title-like display string */
  title: string | null;
  /** Full body, HTML-stripped */
  body: string | null;
  /** Flattened single-line preview, ≤ 160 chars */
  preview: string | null;
  /** Kind-specific metadata. Only the fields relevant to `kind` are populated. */
  meta: {
    // calls
    disposition?: string | null;
    durationMs?: number | null;
    // meetings
    outcome?: string | null;
    startTime?: string | null;
    endTime?: string | null;
    location?: string | null;
    internalNotes?: string | null;
    // emails
    direction?: "INCOMING_EMAIL" | "FORWARDED_EMAIL" | "EMAIL" | null;
    fromEmail?: string | null;
    toEmails?: string[] | null;
    // tasks
    status?: string | null;
    priority?: string | null;
    dueDate?: string | null;
    // who performed the engagement (HubSpot owner id) — populated by live fetch only
    actorOwnerId?: string | null;
  };
}

/** Compact snapshot of a company for the top-of-page card */
export interface CompanySummary {
  ownerId: string | null;
  ownerName: string | null;
  isCustomer: boolean;
  currentArr: number | null;
  openDeal: { name: string; amount: number | null; stage: string | null } | null;
}

/** A deal row, joined to a company */
export interface Deal {
  id: string;
  dealname: string | null;
  amount: number | null;
  dealstage: string | null;
  /** Human-readable deal stage label (e.g. "Closed Won"). Null if dealstage is unset. */
  dealstage_label: string | null;
  closedate: string | null;
}

// ---- Aggregated / computed shapes ----------------------------------------

/** Top-level KPI counts shown on the dashboard */
export interface DashboardKPIs {
  totalCompanies: number;
  totalCustomers: number;
  spokenToLast12Months: number;
  targetAccounts: number;
}

/**
 * One row in either the "by Product Group" or "by Industry" breakdown table
 * on the dashboard.
 */
export interface BreakdownRow {
  /** The group label (product name or industry name) */
  label: string;

  /** Total number of companies in this group */
  totalCompanies: number;

  /** Number that are customers */
  customerCount: number;

  /** Penetration percentage: customerCount / totalCompanies * 100 */
  penetrationPct: number;

  /** Number spoken to in the last 12 months */
  spokenToCount: number;

  /** Number flagged as target accounts */
  targetAccountCount: number;

  /** Sum of deal amounts (in £) for companies in this group */
  totalDealValue: number;
}
