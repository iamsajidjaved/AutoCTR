-- Adds multi-day campaign scheduling fields to traffic_summaries.
--
-- campaign_duration_days : how many days the campaign runs (1 = legacy single-day)
-- initial_daily_visits   : visits on day 1; daily visits grow by daily_increase_pct
-- daily_increase_pct     : compound daily growth rate (e.g. 10.00 = 10% per day)
--
-- required_visits stays as the pre-computed total (sum of all daily visits).
-- Existing rows keep duration=1, daily_increase_pct=0, and initial_daily_visits=NULL
-- which triggers the legacy single-day distribution path in the worker.

ALTER TABLE traffic_summaries
  ADD COLUMN IF NOT EXISTS campaign_duration_days  INTEGER        NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS initial_daily_visits    INTEGER,
  ADD COLUMN IF NOT EXISTS daily_increase_pct      NUMERIC(5, 2)  NOT NULL DEFAULT 0;
