# spec-02 — Database Schema & Migrations

**Status:** complete
**Depends on:** spec-01
**Blocks:** spec-03, spec-04

---

## Goal
Create the Neon PostgreSQL tables and a lightweight migration runner. After this spec, running `npm run db:migrate` creates all tables from scratch against the Neon database.

---

## Files to Create/Modify
```
src/
  models/
    db.js             ← Neon client singleton
    migrate.js        ← migration runner (CLI script)
  migrations/
    001_create_users.sql
    002_create_traffic_summaries.sql
    003_create_traffic_details.sql
    004_create_migrations_table.sql   ← tracks which ran
    005_add_paused_status.sql         ← adds 'paused' to campaign_status enum
    006_add_campaign_duration.sql     ← multi-day campaign fields
```

Add to `package.json` scripts:
```json
"db:migrate": "node src/models/migrate.js"
```

---

## Implementation Details

### `src/models/db.js`
Use `@neondatabase/serverless` with `neon()` for simple queries and `Pool` for transactions.

```js
const { neon, Pool } = require('@neondatabase/serverless');
const config = require('../config');

const sql = neon(config.DATABASE_URL);
const pool = new Pool({ connectionString: config.DATABASE_URL });

module.exports = { sql, pool };
```

### Migration Runner (`src/models/migrate.js`)
- Reads all `.sql` files from `src/migrations/` sorted by filename
- Creates a `_migrations` table if it doesn't exist
- Skips already-applied migrations (tracked by filename)
- Runs each pending migration in a transaction
- Logs each applied migration

### SQL Schema

#### `001_create_users.sql` (needed for spec-03 auth)
```sql
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### `002_create_traffic_summaries.sql`
```sql
CREATE TYPE IF NOT EXISTS campaign_status AS ENUM ('pending', 'running', 'completed');

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
  campaign_duration_days  INTEGER        NOT NULL DEFAULT 1,
  initial_daily_visits    INTEGER,
  daily_increase_pct      NUMERIC(5, 2)  NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### `003_create_traffic_details.sql`
```sql
CREATE TYPE IF NOT EXISTS visit_type AS ENUM ('impression', 'click');
CREATE TYPE IF NOT EXISTS visit_device AS ENUM ('mobile', 'desktop');
CREATE TYPE IF NOT EXISTS visit_status AS ENUM ('pending', 'running', 'completed', 'failed');

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
  actual_dwell_seconds INTEGER,   -- null for impressions; elapsed on-site seconds for clicks
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_traffic_details_poll
  ON traffic_details(status, scheduled_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_traffic_details_summary
  ON traffic_details(traffic_summary_id);
```

#### `005_add_paused_status.sql`
```sql
ALTER TYPE campaign_status ADD VALUE IF NOT EXISTS 'paused';
```

#### `006_add_campaign_duration.sql`
```sql
ALTER TABLE traffic_summaries
  ADD COLUMN IF NOT EXISTS campaign_duration_days  INTEGER        NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS initial_daily_visits    INTEGER,
  ADD COLUMN IF NOT EXISTS daily_increase_pct      NUMERIC(5, 2)  NOT NULL DEFAULT 0;
```
- `initial_daily_visits = NULL` → legacy single-day distribution path (backward compatible)
- `initial_daily_visits IS NOT NULL` → multi-day compound growth path

---

## Acceptance Criteria
- [ ] `npm run db:migrate` runs without error on a fresh Neon database
- [ ] Running it again is idempotent (no duplicate table errors)
- [ ] All four tables exist in Neon: `_migrations`, `users`, `traffic_summaries`, `traffic_details`
- [ ] ENUMs and FK constraints are in place
- [ ] The poll index on `traffic_details` exists
- [ ] `campaign_status` enum includes `paused` value
- [ ] Migration 006 adds `campaign_duration_days`, `initial_daily_visits`, `daily_increase_pct` columns to `traffic_summaries`
