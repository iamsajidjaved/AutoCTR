DO $$ BEGIN
  CREATE TYPE campaign_status AS ENUM ('pending', 'running', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS traffic_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  website TEXT NOT NULL,
  keyword TEXT NOT NULL,
  required_visits INTEGER NOT NULL CHECK (required_visits > 0),
  ctr INTEGER NOT NULL CHECK (ctr BETWEEN 1 AND 100),
  mobile_desktop_ratio INTEGER NOT NULL CHECK (mobile_desktop_ratio BETWEEN 0 AND 100),
  min_dwell_seconds INTEGER NOT NULL DEFAULT 30 CHECK (min_dwell_seconds >= 10),
  max_dwell_seconds INTEGER NOT NULL DEFAULT 120 CHECK (max_dwell_seconds >= min_dwell_seconds AND max_dwell_seconds <= 1800),
  status campaign_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
