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
}

/** A contact row, joined to a company via the company's hs_object_id */
export interface Contact {
  id: string;
  firstname: string | null;
  lastname: string | null;
  jobtitle: string | null;
  email: string | null;
}

/** A deal row, joined to a company */
export interface Deal {
  id: string;
  dealname: string | null;
  amount: number | null;
  dealstage: string | null;
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
