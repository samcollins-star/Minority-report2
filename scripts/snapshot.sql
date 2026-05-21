-- Weekly KPI snapshot
--
-- Source-of-truth for headline metric definitions. The SELECT block below must
-- match getDashboardKPIs in lib/bigquery.ts so live and snapshot numbers agree.
--
-- MERGE on (snapshot_date, metric_key, dimension) so manual re-runs on the same
-- day overwrite rather than duplicate.

-- NOTE: spoken_to_12m_* metrics now use an effective last-contact timestamp
-- combining HubSpot sales-activity with Planhat's curated last_touch_date for
-- customers. Expect a one-time step up in those three metrics the first time
-- this version of the SQL runs — it reflects Planhat-managed customers we
-- previously under-counted, not a behaviour change.

MERGE `engine-room-analytics.minority_report.dashboard_snapshots` T
USING (
  WITH active_uk5k AS (
    SELECT *
    FROM `engine-room-analytics.hevo_dataset_engine_room_analytics_sEip.companies`
    WHERE CAST(uk10k AS BOOL) = TRUE
      AND (archived IS NULL OR archived = FALSE)
  ),
  latest_planhat_touch AS (
    SELECT
      pc.hubspot_company_id,
      ARRAY_AGG(pci.last_touch_date IGNORE NULLS ORDER BY pci.timestamp DESC LIMIT 1)[SAFE_OFFSET(0)] AS last_touch_date
    FROM `engine-room-analytics.hevo_dataset_engine_room_analytics_sEip.planhat_company` pc
    JOIN `engine-room-analytics.hevo_dataset_engine_room_analytics_sEip.planhat_company_info` pci
      ON CAST(pc.external_id AS STRING) = pci.external_id
    WHERE pc.hubspot_company_id IS NOT NULL
    GROUP BY pc.hubspot_company_id
  )
  SELECT CURRENT_DATE() AS snapshot_date, 'total_companies'      AS metric_key, CAST(NULL AS STRING) AS dimension, COUNT(*) AS count FROM active_uk5k
  UNION ALL
  SELECT CURRENT_DATE(),                  'customer_count',                       CAST(NULL AS STRING),             COUNTIF(planhat_customer_status = 'customer') FROM active_uk5k
  UNION ALL
  SELECT CURRENT_DATE(),                  'target_account_count',                 CAST(NULL AS STRING),             COUNTIF(hs_is_target_account = TRUE) FROM active_uk5k
  UNION ALL
  SELECT CURRENT_DATE(),                  'spoken_to_12m_count',                  CAST(NULL AS STRING),
    COUNTIF(
      (CASE
        WHEN c.planhat_customer_status = 'customer' THEN
          NULLIF(
            GREATEST(
              COALESCE(TIMESTAMP(c.hs_last_sales_activity_timestamp), TIMESTAMP('1970-01-01')),
              COALESCE(TIMESTAMP(lpt.last_touch_date),                 TIMESTAMP('1970-01-01'))
            ),
            TIMESTAMP('1970-01-01')
          )
        ELSE
          TIMESTAMP(c.hs_last_sales_activity_timestamp)
      END)
        >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 365 DAY)
    )
  FROM active_uk5k c
  LEFT JOIN latest_planhat_touch lpt
    ON CAST(c.hs_object_id AS STRING) = lpt.hubspot_company_id
  UNION ALL
  SELECT CURRENT_DATE(),
         'companies_by_product'                  AS metric_key,
         COALESCE(beauhurst_product, 'Unknown')  AS dimension,
         COUNT(*)                                 AS count
  FROM active_uk5k
  GROUP BY dimension
  UNION ALL
  SELECT CURRENT_DATE(),
         'companies_by_industry'                        AS metric_key,
         COALESCE(new_beauhurst_industries, 'Unknown')  AS dimension,
         COUNT(*)                                        AS count
  FROM active_uk5k
  GROUP BY dimension
  UNION ALL
  -- customers_by_product
  SELECT CURRENT_DATE(),
         'customers_by_product'                  AS metric_key,
         COALESCE(beauhurst_product, 'Unknown')  AS dimension,
         COUNTIF(planhat_customer_status = 'customer') AS count
  FROM active_uk5k
  GROUP BY dimension
  UNION ALL
  -- customers_by_industry
  SELECT CURRENT_DATE(),
         'customers_by_industry'                        AS metric_key,
         COALESCE(new_beauhurst_industries, 'Unknown')  AS dimension,
         COUNTIF(planhat_customer_status = 'customer')  AS count
  FROM active_uk5k
  GROUP BY dimension
  UNION ALL
  -- target_by_product
  SELECT CURRENT_DATE(),
         'target_by_product'                     AS metric_key,
         COALESCE(beauhurst_product, 'Unknown')  AS dimension,
         COUNTIF(hs_is_target_account = TRUE)    AS count
  FROM active_uk5k
  GROUP BY dimension
  UNION ALL
  -- target_by_industry
  SELECT CURRENT_DATE(),
         'target_by_industry'                           AS metric_key,
         COALESCE(new_beauhurst_industries, 'Unknown')  AS dimension,
         COUNTIF(hs_is_target_account = TRUE)           AS count
  FROM active_uk5k
  GROUP BY dimension
  UNION ALL
  -- spoken_to_12m_by_product
  SELECT CURRENT_DATE(),
         'spoken_to_12m_by_product'                AS metric_key,
         COALESCE(c.beauhurst_product, 'Unknown')  AS dimension,
         COUNTIF(
           (CASE
              WHEN c.planhat_customer_status = 'customer' THEN
                NULLIF(
                  GREATEST(
                    COALESCE(TIMESTAMP(c.hs_last_sales_activity_timestamp), TIMESTAMP('1970-01-01')),
                    COALESCE(TIMESTAMP(lpt.last_touch_date),                 TIMESTAMP('1970-01-01'))
                  ),
                  TIMESTAMP('1970-01-01')
                )
              ELSE
                TIMESTAMP(c.hs_last_sales_activity_timestamp)
            END)
             >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 365 DAY)
         )                                          AS count
  FROM active_uk5k c
  LEFT JOIN latest_planhat_touch lpt
    ON CAST(c.hs_object_id AS STRING) = lpt.hubspot_company_id
  GROUP BY dimension
  UNION ALL
  -- spoken_to_12m_by_industry
  SELECT CURRENT_DATE(),
         'spoken_to_12m_by_industry'                      AS metric_key,
         COALESCE(c.new_beauhurst_industries, 'Unknown')  AS dimension,
         COUNTIF(
           (CASE
              WHEN c.planhat_customer_status = 'customer' THEN
                NULLIF(
                  GREATEST(
                    COALESCE(TIMESTAMP(c.hs_last_sales_activity_timestamp), TIMESTAMP('1970-01-01')),
                    COALESCE(TIMESTAMP(lpt.last_touch_date),                 TIMESTAMP('1970-01-01'))
                  ),
                  TIMESTAMP('1970-01-01')
                )
              ELSE
                TIMESTAMP(c.hs_last_sales_activity_timestamp)
            END)
             >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 365 DAY)
         )                                                AS count
  FROM active_uk5k c
  LEFT JOIN latest_planhat_touch lpt
    ON CAST(c.hs_object_id AS STRING) = lpt.hubspot_company_id
  GROUP BY dimension
) S
ON  T.snapshot_date = S.snapshot_date
AND T.metric_key    = S.metric_key
AND T.dimension IS NOT DISTINCT FROM S.dimension
WHEN MATCHED THEN UPDATE SET
  count    = S.count,
  taken_at = CURRENT_TIMESTAMP()
WHEN NOT MATCHED THEN INSERT (snapshot_date, metric_key, dimension, count)
  VALUES (S.snapshot_date, S.metric_key, S.dimension, S.count);
