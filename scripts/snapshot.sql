-- Weekly KPI snapshot
--
-- Source-of-truth for headline metric definitions. The SELECT block below must
-- match getDashboardKPIs in lib/bigquery.ts so live and snapshot numbers agree.
--
-- MERGE on (snapshot_date, metric_key, dimension) so manual re-runs on the same
-- day overwrite rather than duplicate.

MERGE `engine-room-analytics.minority_report.dashboard_snapshots` T
USING (
  WITH active_uk5k AS (
    SELECT *
    FROM `engine-room-analytics.hevo_dataset_engine_room_analytics_sEip.companies`
    WHERE CAST(uk10k AS BOOL) = TRUE
      AND (archived IS NULL OR archived = FALSE)
  )
  SELECT CURRENT_DATE() AS snapshot_date, 'total_companies'      AS metric_key, CAST(NULL AS STRING) AS dimension, COUNT(*) AS count FROM active_uk5k
  UNION ALL
  SELECT CURRENT_DATE(),                  'customer_count',                       CAST(NULL AS STRING),             COUNTIF(planhat_customer_status = 'customer') FROM active_uk5k
  UNION ALL
  SELECT CURRENT_DATE(),                  'target_account_count',                 CAST(NULL AS STRING),             COUNTIF(hs_is_target_account = TRUE) FROM active_uk5k
  UNION ALL
  SELECT CURRENT_DATE(),                  'spoken_to_12m_count',                  CAST(NULL AS STRING),
    COUNTIF(
      hs_last_sales_activity_timestamp IS NOT NULL
      AND TIMESTAMP(hs_last_sales_activity_timestamp)
          >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 365 DAY)
    )
  FROM active_uk5k
) S
ON  T.snapshot_date = S.snapshot_date
AND T.metric_key    = S.metric_key
AND T.dimension IS NOT DISTINCT FROM S.dimension
WHEN MATCHED THEN UPDATE SET
  count    = S.count,
  taken_at = CURRENT_TIMESTAMP()
WHEN NOT MATCHED THEN INSERT (snapshot_date, metric_key, dimension, count)
  VALUES (S.snapshot_date, S.metric_key, S.dimension, S.count);
