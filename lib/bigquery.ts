/**
 * bigquery.ts
 * -----------
 * All BigQuery query logic lives here.
 *
 * Authentication: the BigQuery client supports two env-var approaches:
 *   1. GOOGLE_APPLICATION_CREDENTIALS — path to a service-account JSON file.
 *      The @google-cloud/bigquery SDK picks this up automatically.
 *   2. BIGQUERY_CREDENTIALS_JSON — the JSON content as a string.
 *      We parse this and pass it as `credentials` when constructing the client.
 */

import { BigQuery } from "@google-cloud/bigquery";
import { unstable_cache } from "next/cache";
import type {
  Company,
  Contact,
  Deal,
  DashboardKPIs,
  BreakdownRow,
} from "@/types";

// ---------------------------------------------------------------------------
// BigQuery client — singleton
// ---------------------------------------------------------------------------

function createBigQueryClient(): BigQuery {
  const credentialsJson = process.env.BIGQUERY_CREDENTIALS_JSON;

  if (credentialsJson) {
    // Parse the JSON string and pass credentials directly.
    // This is the preferred approach on hosting platforms where you can't
    // mount files but can set environment variables.
    const credentials = JSON.parse(credentialsJson);
    return new BigQuery({
      projectId: "minority-report2",
      credentials,
    });
  }

  // Fall back to file-based ADC via GOOGLE_APPLICATION_CREDENTIALS.
  // The SDK reads this env var automatically — no extra config needed.
  return new BigQuery({ projectId: "minority-report2" });
}

const bigquery = createBigQueryClient();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DATASET =
  "engine-room-analytics.hevo_dataset_engine_room_analytics_sEip";

const COMPANIES_TABLE = `\`${DATASET}.companies\``;
const CONTACTS_TABLE = `\`${DATASET}.contacts\``;
const DEALS_TABLE = `\`${DATASET}.deals\``;
const OWNERS_TABLE = `\`${DATASET}.owners\``;

/**
 * Filter fragment that scopes a query to "currently live UK5K companies".
 * Use this in the WHERE clause of every company-level query so archived
 * rows (still present in the Hevo sync but deleted in HubSpot) are excluded.
 */
const ACTIVE_UK5K_COMPANY_FILTER = `
  CAST(c.uk10k AS BOOL) = TRUE
  AND (c.archived IS NULL OR c.archived = FALSE)
`;

// How long to cache BigQuery results (1 hour)
const CACHE_TTL = 3600;

// ---------------------------------------------------------------------------
// Helper: run a query and return typed rows
// ---------------------------------------------------------------------------

async function runQuery<T>(sql: string, params?: unknown[]): Promise<T[]> {
  const options: Parameters<typeof bigquery.query>[0] = { query: sql };
  if (params && params.length > 0) {
    options.params = params;
  }
  const [rows] = await bigquery.query(options);
  return rows as T[];
}

// ---------------------------------------------------------------------------
// Dashboard KPIs
// ---------------------------------------------------------------------------

/**
 * Returns the four top-level KPI counts for the dashboard.
 * All counts are scoped to uk10k = TRUE.
 */
export const getDashboardKPIs = unstable_cache(
  async (): Promise<DashboardKPIs> => {
    const sql = `
      SELECT
        COUNT(*)                                                    AS totalCompanies,
        COUNTIF(planhat_customer_status = 'customer')               AS totalCustomers,
        COUNTIF(
          hs_last_sales_activity_timestamp IS NOT NULL
          AND TIMESTAMP(hs_last_sales_activity_timestamp)
              >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 365 DAY)
        )                                                           AS spokenToLast12Months,
        COUNTIF(hs_is_target_account = TRUE)                        AS targetAccounts
      FROM ${COMPANIES_TABLE} AS c
      WHERE ${ACTIVE_UK5K_COMPANY_FILTER}
    `;

    const rows = await runQuery<{
      totalCompanies: { value: string } | number;
      totalCustomers: { value: string } | number;
      spokenToLast12Months: { value: string } | number;
      targetAccounts: { value: string } | number;
    }>(sql);

    // BigQuery returns INT64 as an object with a `value` string — normalise it
    const toNumber = (v: { value: string } | number): number =>
      typeof v === "object" ? parseInt(v.value, 10) : Number(v);

    const row = rows[0];
    return {
      totalCompanies: toNumber(row.totalCompanies),
      totalCustomers: toNumber(row.totalCustomers),
      spokenToLast12Months: toNumber(row.spokenToLast12Months),
      targetAccounts: toNumber(row.targetAccounts),
    };
  },
  ["dashboard-kpis"],
  { revalidate: CACHE_TTL }
);

// ---------------------------------------------------------------------------
// Dashboard breakdown tables
// ---------------------------------------------------------------------------

/**
 * Returns one row per product group with aggregated metrics.
 * Companies with NULL beauhurst_product are grouped under "Unknown".
 */
export const getBreakdownByProductGroup = unstable_cache(
  async (): Promise<BreakdownRow[]> => {
    const sql = `
      WITH company_deals AS (
        -- Sum deal amounts per company
        SELECT
          associated_primary_company_id,
          SUM(CAST(amount AS FLOAT64)) AS total_deal_value
        FROM ${DEALS_TABLE}
        WHERE amount IS NOT NULL
        GROUP BY associated_primary_company_id
      )
      SELECT
        COALESCE(c.beauhurst_product, 'Unknown')  AS label,
        COUNT(*)                                   AS totalCompanies,
        COUNTIF(c.planhat_customer_status = 'customer')
                                                   AS customerCount,
        COUNTIF(
          c.hs_last_sales_activity_timestamp IS NOT NULL
          AND TIMESTAMP(c.hs_last_sales_activity_timestamp)
              >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 365 DAY)
        )                                          AS spokenToCount,
        COUNTIF(c.hs_is_target_account = TRUE)     AS targetAccountCount,
        COALESCE(SUM(cd.total_deal_value), 0)      AS totalDealValue
      FROM ${COMPANIES_TABLE} c
      LEFT JOIN company_deals cd
        ON CAST(c.hs_object_id AS STRING) = CAST(cd.associated_primary_company_id AS STRING)
      WHERE ${ACTIVE_UK5K_COMPANY_FILTER}
      GROUP BY label
      ORDER BY totalCompanies DESC
    `;

    const raw = await runQuery<{
      label: string;
      totalCompanies: { value: string } | number;
      customerCount: { value: string } | number;
      spokenToCount: { value: string } | number;
      targetAccountCount: { value: string } | number;
      totalDealValue: number;
    }>(sql);

    const toNum = (v: { value: string } | number): number =>
      typeof v === "object" ? parseInt(v.value, 10) : Number(v);

    return raw.map((row) => {
      const total = toNum(row.totalCompanies);
      const customers = toNum(row.customerCount);
      return {
        label: row.label,
        totalCompanies: total,
        customerCount: customers,
        penetrationPct: total > 0 ? Math.round((customers / total) * 100) : 0,
        spokenToCount: toNum(row.spokenToCount),
        targetAccountCount: toNum(row.targetAccountCount),
        totalDealValue: Number(row.totalDealValue) || 0,
      };
    });
  },
  ["breakdown-by-product-group"],
  { revalidate: CACHE_TTL }
);

/**
 * Returns one row per industry with aggregated metrics.
 * Companies with NULL new_beauhurst_industries are grouped under "Unknown".
 */
export const getBreakdownByIndustry = unstable_cache(
  async (): Promise<BreakdownRow[]> => {
    const sql = `
      WITH company_deals AS (
        SELECT
          associated_primary_company_id,
          SUM(CAST(amount AS FLOAT64)) AS total_deal_value
        FROM ${DEALS_TABLE}
        WHERE amount IS NOT NULL
        GROUP BY associated_primary_company_id
      )
      SELECT
        COALESCE(c.new_beauhurst_industries, 'Unknown') AS label,
        COUNT(*)                                         AS totalCompanies,
        COUNTIF(c.planhat_customer_status = 'customer') AS customerCount,
        COUNTIF(
          c.hs_last_sales_activity_timestamp IS NOT NULL
          AND TIMESTAMP(c.hs_last_sales_activity_timestamp)
              >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 365 DAY)
        )                                               AS spokenToCount,
        COUNTIF(c.hs_is_target_account = TRUE)          AS targetAccountCount,
        COALESCE(SUM(cd.total_deal_value), 0)           AS totalDealValue
      FROM ${COMPANIES_TABLE} c
      LEFT JOIN company_deals cd
        ON CAST(c.hs_object_id AS STRING) = CAST(cd.associated_primary_company_id AS STRING)
      WHERE ${ACTIVE_UK5K_COMPANY_FILTER}
      GROUP BY label
      ORDER BY totalCompanies DESC
      LIMIT 50
    `;

    const raw = await runQuery<{
      label: string;
      totalCompanies: { value: string } | number;
      customerCount: { value: string } | number;
      spokenToCount: { value: string } | number;
      targetAccountCount: { value: string } | number;
      totalDealValue: number;
    }>(sql);

    const toNum = (v: { value: string } | number): number =>
      typeof v === "object" ? parseInt(v.value, 10) : Number(v);

    return raw.map((row) => {
      const total = toNum(row.totalCompanies);
      const customers = toNum(row.customerCount);
      return {
        label: row.label,
        totalCompanies: total,
        customerCount: customers,
        penetrationPct: total > 0 ? Math.round((customers / total) * 100) : 0,
        spokenToCount: toNum(row.spokenToCount),
        targetAccountCount: toNum(row.targetAccountCount),
        totalDealValue: Number(row.totalDealValue) || 0,
      };
    });
  },
  ["breakdown-by-industry"],
  { revalidate: CACHE_TTL }
);

// ---------------------------------------------------------------------------
// Company list
// ---------------------------------------------------------------------------

/**
 * Returns all uk10k companies with the fields needed for the list view.
 * We fetch everything and let the client filter by name — the dataset is
 * bounded enough that this is fine, and it avoids a per-keystroke round-trip.
 */
type CompanyRow = Omit<Company, "owner_name"> & {
  owner_name_raw: string | null;
  owner_email: string | null;
};

function mapCompanyRow(row: CompanyRow): Company {
  const { owner_name_raw, owner_email, ...rest } = row;
  return {
    ...rest,
    owner_name: owner_name_raw ?? owner_email ?? null,
  };
}

export const getAllCompanies = unstable_cache(
  async (): Promise<Company[]> => {
    const sql = `
      SELECT
        CAST(c.hs_object_id AS STRING)        AS hs_object_id,
        c.name,
        c.uk10k,
        c.planhat_customer_status,
        c.hs_is_target_account,
        c.hs_last_sales_activity_timestamp,
        c.beauhurst_product,
        c.new_beauhurst_industries,
        c.uk_headcount_uk5k,
        c.global_headcount_uk5k,
        c.website,
        c.linkedin_company_page,
        c.beauhurst_data_beauhurst_url,
        CAST(o.id AS STRING)                  AS owner_id,
        NULLIF(
          TRIM(CONCAT(COALESCE(o.first_name, ''), ' ', COALESCE(o.last_name, ''))),
          ''
        )                                     AS owner_name_raw,
        o.email                               AS owner_email
      FROM ${COMPANIES_TABLE} AS c
      LEFT JOIN ${OWNERS_TABLE} o
        ON CAST(c.hubspot_owner_id AS STRING) = CAST(o.id AS STRING)
      WHERE ${ACTIVE_UK5K_COMPANY_FILTER}
      ORDER BY c.name ASC
    `;

    const rows = await runQuery<CompanyRow>(sql);
    return rows.map(mapCompanyRow);
  },
  ["all-companies"],
  { revalidate: CACHE_TTL }
);

// ---------------------------------------------------------------------------
// Company detail
// ---------------------------------------------------------------------------

/**
 * Returns a single company by its hs_object_id.
 * Returns null if not found.
 */
export const getCompanyById = unstable_cache(
  async (id: string): Promise<Company | null> => {
    // We inline the id directly into the SQL string after stripping single quotes.
    // The calling page validates that the id is numeric-only before calling this
    // function, so there is no SQL-injection risk here.
    const safeId = id.replace(/'/g, "");
    const sql = `
      SELECT
        CAST(c.hs_object_id AS STRING)        AS hs_object_id,
        c.name,
        c.uk10k,
        c.planhat_customer_status,
        c.hs_is_target_account,
        c.hs_last_sales_activity_timestamp,
        c.beauhurst_product,
        c.new_beauhurst_industries,
        c.uk_headcount_uk5k,
        c.global_headcount_uk5k,
        c.website,
        c.linkedin_company_page,
        c.beauhurst_data_beauhurst_url,
        CAST(o.id AS STRING)                  AS owner_id,
        NULLIF(
          TRIM(CONCAT(COALESCE(o.first_name, ''), ' ', COALESCE(o.last_name, ''))),
          ''
        )                                     AS owner_name_raw,
        o.email                               AS owner_email
      FROM ${COMPANIES_TABLE} AS c
      LEFT JOIN ${OWNERS_TABLE} o
        ON CAST(c.hubspot_owner_id AS STRING) = CAST(o.id AS STRING)
      WHERE ${ACTIVE_UK5K_COMPANY_FILTER}
        AND CAST(c.hs_object_id AS STRING) = '${safeId}'
      LIMIT 1
    `;

    const rows = await runQuery<CompanyRow>(sql);
    const row = rows[0];
    return row ? mapCompanyRow(row) : null;
  },
  ["company-by-id"],
  { revalidate: CACHE_TTL }
);

/**
 * Returns contacts associated with a company (joined on company's hs_object_id).
 */
export const getContactsByCompanyId = unstable_cache(
  async (companyId: string): Promise<Contact[]> => {
    const safeSql = `
      SELECT
        CAST(id AS STRING)  AS id,
        firstname,
        lastname,
        jobtitle,
        email
      FROM ${CONTACTS_TABLE}
      WHERE CAST(associatedcompanyid AS STRING) = '${companyId.replace(/'/g, "")}'
      ORDER BY lastname ASC, firstname ASC
    `;

    return runQuery<Contact>(safeSql);
  },
  ["contacts-by-company"],
  { revalidate: CACHE_TTL }
);

/**
 * Returns deals associated with a company.
 */
export const getDealsByCompanyId = unstable_cache(
  async (companyId: string): Promise<Deal[]> => {
    const safeSql = `
      SELECT
        CAST(id AS STRING)                AS id,
        dealname,
        CAST(amount AS FLOAT64)           AS amount,
        dealstage,
        CAST(closedate AS STRING)         AS closedate
      FROM ${DEALS_TABLE}
      WHERE CAST(associated_primary_company_id AS STRING) = '${companyId.replace(/'/g, "")}'
      ORDER BY closedate DESC
    `;

    return runQuery<Deal>(safeSql);
  },
  ["deals-by-company"],
  { revalidate: CACHE_TTL }
);
