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
  Activity,
  Company,
  CompanySummary,
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
const DEALS_PIPELINE_STAGES_TABLE = `\`${DATASET}.deals_pipeline_stages\``;
const OWNERS_TABLE = `\`${DATASET}.owners\``;
const ENGAGEMENT_CALLS_TABLE = `\`${DATASET}.engagement_calls_v3\``;
const ENGAGEMENT_MEETINGS_TABLE = `\`${DATASET}.engagement_meetings_v3\``;

const SNAPSHOTS_TABLE =
  "`engine-room-analytics.minority_report.dashboard_snapshots`";

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

// Activity is fresher-sensitive — 5 minutes
const ACTIVITY_CACHE_TTL = 300;

// Snapshot card — 5 minutes, so ARR / open-deal changes surface quickly
const SUMMARY_CACHE_TTL = 300;

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
        CAST(d.id AS STRING)              AS id,
        d.dealname,
        CAST(d.amount AS FLOAT64)         AS amount,
        d.dealstage,
        s.label                           AS dealstage_label,
        CAST(d.closedate AS STRING)       AS closedate
      FROM ${DEALS_TABLE} AS d
      LEFT JOIN ${DEALS_PIPELINE_STAGES_TABLE} AS s
        ON d.dealstage = s.id
      WHERE CAST(d.associated_primary_company_id AS STRING) = '${companyId.replace(/'/g, "")}'
      ORDER BY d.closedate DESC
    `;

    return runQuery<Deal>(safeSql);
  },
  ["deals-by-company"],
  { revalidate: CACHE_TTL }
);

// ---------------------------------------------------------------------------
// Activity feed — calls and meetings
// ---------------------------------------------------------------------------

// Decode a small set of HTML entities without pulling in a dependency.
// These cover the cases we actually see from HubSpot rich-text bodies.
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// Convert HubSpot HTML bodies to plain text, preserving paragraph/line breaks.
function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<[^>]*>/g, " ")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n +/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// First ~160 chars, flattened to a single line, trimmed at word boundary.
function makePreview(text: string): string | null {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return null;
  if (flat.length <= 160) return flat;
  const cut = flat.slice(0, 160);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 100 ? cut.slice(0, lastSpace) : cut) + "…";
}

function clampInt(value: number, min: number, max: number): number {
  const n = Math.floor(value);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

interface CallRow {
  id: string;
  timestamp: string | null;
  title: string | null;
  body_raw: string | null;
  disposition: string | null;
  duration_ms: { value: string } | number | null;
}

export const getRecentCallsByCompanyId = unstable_cache(
  async (companyId: string, daysBack: number = 60): Promise<Activity[]> => {
    const safeId = companyId.replace(/'/g, "");
    const safeDays = clampInt(daysBack, 1, 365);
    const sql = `
      SELECT
        CAST(id AS STRING)                      AS id,
        CAST(hs_timestamp AS STRING)            AS timestamp,
        hs_call_title                           AS title,
        COALESCE(hs_call_body, hs_body_preview) AS body_raw,
        hs_call_disposition                     AS disposition,
        CAST(hs_call_duration AS INT64)         AS duration_ms
      FROM ${ENGAGEMENT_CALLS_TABLE}
      WHERE CAST(company_record_id AS STRING) = '${safeId}'
        AND (archived IS NULL OR archived = FALSE)
        AND hs_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${safeDays} DAY)
      ORDER BY hs_timestamp DESC
      LIMIT 30
    `;

    const rows = await runQuery<CallRow>(sql);
    return rows.map<Activity>((r) => {
      const body = stripHtml(r.body_raw);
      const durationMs =
        r.duration_ms == null
          ? null
          : typeof r.duration_ms === "object"
          ? parseInt(r.duration_ms.value, 10)
          : Number(r.duration_ms);
      return {
        id: r.id,
        kind: "call",
        timestamp: r.timestamp ?? "",
        title: r.title ?? null,
        body: body || null,
        preview: body ? makePreview(body) : null,
        meta: {
          disposition: r.disposition ?? null,
          durationMs,
        },
      };
    });
  },
  ["recent-calls-by-company"],
  { revalidate: ACTIVITY_CACHE_TTL }
);

interface MeetingRow {
  id: string;
  timestamp: string | null;
  title: string | null;
  body_raw: string | null;
  outcome: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  internal_notes: string | null;
}

export const getRecentMeetingsByCompanyId = unstable_cache(
  async (companyId: string, daysBack: number = 60): Promise<Activity[]> => {
    const safeId = companyId.replace(/'/g, "");
    const safeDays = clampInt(daysBack, 1, 365);
    const sql = `
      SELECT
        CAST(id AS STRING)                                             AS id,
        CAST(COALESCE(hs_meeting_start_time, hs_timestamp) AS STRING)  AS timestamp,
        hs_meeting_title                                               AS title,
        COALESCE(hs_meeting_body, hs_body_preview)                     AS body_raw,
        hs_meeting_outcome                                             AS outcome,
        CAST(hs_meeting_start_time AS STRING)                          AS start_time,
        CAST(hs_meeting_end_time AS STRING)                            AS end_time,
        hs_meeting_location                                            AS location,
        hs_internal_meeting_notes                                      AS internal_notes
      FROM ${ENGAGEMENT_MEETINGS_TABLE}
      WHERE CAST(company_record_id AS STRING) = '${safeId}'
        AND (archived IS NULL OR archived = FALSE)
        AND COALESCE(hs_meeting_start_time, hs_timestamp)
            >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${safeDays} DAY)
      ORDER BY COALESCE(hs_meeting_start_time, hs_timestamp) DESC
      LIMIT 30
    `;

    const rows = await runQuery<MeetingRow>(sql);
    return rows.map<Activity>((r) => {
      const body = stripHtml(r.body_raw);
      const notes = stripHtml(r.internal_notes);
      return {
        id: r.id,
        kind: "meeting",
        timestamp: r.timestamp ?? "",
        title: r.title ?? null,
        body: body || null,
        preview: body ? makePreview(body) : null,
        meta: {
          outcome: r.outcome ?? null,
          startTime: r.start_time ?? null,
          endTime: r.end_time ?? null,
          location: r.location ?? null,
          internalNotes: notes || null,
        },
      };
    });
  },
  ["recent-meetings-by-company"],
  { revalidate: ACTIVITY_CACHE_TTL }
);

/**
 * Returns the most recent activity across both engagement types, sorted newest-first.
 * The inner fetchers are each cached; this helper is a thin composition.
 */
export async function getRecentActivityByCompanyId(
  companyId: string,
  daysBack: number = 60,
  limit: number = 20
): Promise<Activity[]> {
  const [calls, meetings] = await Promise.all([
    getRecentCallsByCompanyId(companyId, daysBack),
    getRecentMeetingsByCompanyId(companyId, daysBack),
  ]);
  const merged = [...calls, ...meetings];
  merged.sort((a, b) =>
    a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0
  );
  return merged.slice(0, clampInt(limit, 1, 100));
}

// ---------------------------------------------------------------------------
// Snapshot — owner, customer status, ARR, open deal in one call
// ---------------------------------------------------------------------------

interface CompanySummaryRow {
  owner_id: string | null;
  owner_name_raw: string | null;
  owner_email: string | null;
  customer_status: string | null;
  current_arr: number | null;
  open_deal_name: string | null;
  open_deal_amount: number | null;
  open_deal_stage: string | null;
}

export const getCompanySummary = unstable_cache(
  async (companyId: string): Promise<CompanySummary | null> => {
    const safeId = companyId.replace(/'/g, "");
    const sql = `
      WITH open_deal AS (
        SELECT
          d.associated_primary_company_id     AS company_id,
          d.dealname                          AS dealname,
          CAST(d.amount AS FLOAT64)           AS amount,
          s.label                             AS stage_label,
          d.closedate                         AS closedate
        FROM ${DEALS_TABLE} d
        LEFT JOIN ${DEALS_PIPELINE_STAGES_TABLE} s
          ON d.dealstage = s.id
        WHERE (s.is_closed IS NULL OR LOWER(s.is_closed) != 'true')
        QUALIFY ROW_NUMBER() OVER (
          PARTITION BY d.associated_primary_company_id
          ORDER BY d.closedate DESC NULLS LAST, d.hs_lastmodifieddate DESC
        ) = 1
      ),
      arr AS (
        SELECT
          pc.hubspot_company_id,
          pci.current_arr
        FROM \`engine-room-analytics.RetentionReporting.planhat_company\` pc
        LEFT JOIN \`engine-room-analytics.RetentionReporting.planhat_company_info\` pci
          ON CAST(pc.external_id AS STRING) = pci.external_id
      )
      SELECT
        CAST(o.id AS STRING)                AS owner_id,
        NULLIF(
          TRIM(CONCAT(COALESCE(o.first_name, ''), ' ', COALESCE(o.last_name, ''))),
          ''
        )                                   AS owner_name_raw,
        o.email                             AS owner_email,
        c.planhat_customer_status           AS customer_status,
        arr.current_arr                     AS current_arr,
        od.dealname                         AS open_deal_name,
        od.amount                           AS open_deal_amount,
        od.stage_label                      AS open_deal_stage
      FROM ${COMPANIES_TABLE} AS c
      LEFT JOIN ${OWNERS_TABLE} o
        ON CAST(c.hubspot_owner_id AS STRING) = CAST(o.id AS STRING)
      LEFT JOIN arr
        ON CAST(c.hs_object_id AS STRING) = arr.hubspot_company_id
      LEFT JOIN open_deal od
        ON CAST(c.hs_object_id AS STRING) = CAST(od.company_id AS STRING)
      WHERE CAST(c.hs_object_id AS STRING) = '${safeId}'
        AND ${ACTIVE_UK5K_COMPANY_FILTER}
      LIMIT 1
    `;

    const rows = await runQuery<CompanySummaryRow>(sql);
    const row = rows[0];
    if (!row) return null;

    const openDeal =
      row.open_deal_name != null
        ? {
            name: row.open_deal_name,
            amount:
              row.open_deal_amount == null ? null : Number(row.open_deal_amount),
            stage: row.open_deal_stage,
          }
        : null;

    return {
      ownerId: row.owner_id,
      ownerName: row.owner_name_raw ?? row.owner_email ?? null,
      isCustomer: row.customer_status === "customer",
      currentArr: row.current_arr == null ? null : Number(row.current_arr),
      openDeal,
    };
  },
  ["company-summary"],
  { revalidate: SUMMARY_CACHE_TTL, tags: ["company-summary"] }
);

// ---------------------------------------------------------------------------
// KPI trend — weekly snapshots from minority_report.dashboard_snapshots
// ---------------------------------------------------------------------------

export interface KpiTrendPoint {
  /** ISO yyyy-mm-dd */
  snapshotDate: string;
  count: number;
}

const TREND_CACHE_TTL = 3600;

export const getKpiTrend = unstable_cache(
  async (
    metricKey: string,
    dimension?: string | null,
    weeks: number = 12
  ): Promise<KpiTrendPoint[]> => {
    const safeWeeks = clampInt(weeks, 1, 104);
    const hasDimension = typeof dimension === "string";
    const dimensionClause = hasDimension
      ? "dimension = ?"
      : "dimension IS NULL";
    const sql = `
      SELECT
        CAST(snapshot_date AS STRING) AS snapshotDate,
        count                         AS count
      FROM ${SNAPSHOTS_TABLE}
      WHERE metric_key = ?
        AND ${dimensionClause}
        AND snapshot_date >= DATE_SUB(CURRENT_DATE(), INTERVAL ${safeWeeks} WEEK)
      ORDER BY snapshot_date ASC
    `;

    const params = hasDimension ? [metricKey, dimension] : [metricKey];
    const rows = await runQuery<{
      snapshotDate: string;
      count: { value: string } | number;
    }>(sql, params);

    return rows.map((r) => ({
      snapshotDate: r.snapshotDate,
      count:
        typeof r.count === "object" ? parseInt(r.count.value, 10) : Number(r.count),
    }));
  },
  ["kpi-trend"],
  { revalidate: TREND_CACHE_TTL, tags: ["kpi-trends"] }
);

// ---------------------------------------------------------------------------
// Owner name lookup — resolves a HubSpot owner id to a display name
// ---------------------------------------------------------------------------

interface OwnerRow {
  owner_name_raw: string | null;
  owner_email: string | null;
}

export const getOwnerNameById = unstable_cache(
  async (ownerId: string): Promise<string | null> => {
    if (!ownerId) return null;
    const safeId = ownerId.replace(/'/g, "");
    const sql = `
      SELECT
        NULLIF(
          TRIM(CONCAT(COALESCE(o.first_name, ''), ' ', COALESCE(o.last_name, ''))),
          ''
        ) AS owner_name_raw,
        o.email AS owner_email
      FROM ${OWNERS_TABLE} o
      WHERE CAST(o.id AS STRING) = '${safeId}'
      LIMIT 1
    `;

    const rows = await runQuery<OwnerRow>(sql);
    const row = rows[0];
    if (!row) return null;
    return row.owner_name_raw ?? row.owner_email ?? null;
  },
  ["owner-by-id"],
  { revalidate: CACHE_TTL, tags: ["owners"] }
);
