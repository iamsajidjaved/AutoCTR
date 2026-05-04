DO $$ BEGIN
  CREATE TYPE visit_type AS ENUM ('impression', 'click');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE visit_device AS ENUM ('mobile', 'desktop');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE visit_status AS ENUM ('pending', 'running', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS traffic_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  traffic_summary_id UUID NOT NULL REFERENCES traffic_summaries(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  type visit_type NOT NULL,
  device visit_device NOT NULL,
  ip TEXT,
  status visit_status NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  actual_dwell_seconds INTEGER,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_traffic_details_poll
  ON traffic_details(status, scheduled_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_traffic_details_summary
  ON traffic_details(traffic_summary_id);
