# AutoCTR — Google CTR Simulation Tool

AutoCTR is a full-stack tool that automates Google CTR (Click-Through Rate) simulation. Users create traffic campaigns specifying a target website and keyword; the system then distributes visits across a 24-hour window and executes them via real Chromium browser instances (always headed, required by the RektCaptcha extension) using rotating proxies and stealth techniques to mimic real human behaviour.

---

## Table of Contents

- [How It Works](#how-it-works)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Installation](#installation)
- [Database Setup](#database-setup)
- [Running the Project](#running-the-project)
  - [Development Mode](#development-mode)
  - [Production with PM2](#production-with-pm2)
  - [First-Time Setup Walkthrough](#first-time-setup-walkthrough)
  - [PM2 Quick Reference](#pm2-quick-reference)
- [API Reference](#api-reference)
- [Dashboard](#dashboard)
- [Campaign Lifecycle](#campaign-lifecycle)
- [Worker Architecture](#worker-architecture)
- [Proxy Integration](#proxy-integration)
- [CAPTCHA Handling](#captcha-handling)
- [Smart Scheduling](#smart-scheduling)
- [Production Deployment](#production-deployment)

---

## How It Works

1. A user registers and logs in via the dashboard.
2. The user creates a campaign — providing a target URL, keyword, duration (days), day-1 visits, daily growth rate, CTR %, mobile/desktop split, and dwell time range.
3. On activation, the system computes `required_visits` (compound growth sum) and generates one `traffic_details` row per visit, with randomised type (click/impression), device (mobile/desktop), and a smart-scheduled timestamp. Multi-day campaigns spread visits across per-day 24h windows weighted toward peak traffic hours.
4. PM2 workers poll the database every 5 seconds, claim pending due visits, launch a stealth Puppeteer browser via a rotating proxy, navigate to Google, search the keyword, and — for clicks — click the target website and simulate on-site reading behaviour.
5. Each visit is marked `completed` or `failed`. Once all visits are terminal, the campaign is automatically marked `completed`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **API Server** | Node.js 20+, Express.js 5 |
| **Database** | Neon (serverless PostgreSQL) via `@neondatabase/serverless` |
| **Workers** | PM2 cluster mode |
| **Browser Automation** | Puppeteer + `puppeteer-extra-plugin-stealth` |
| **CAPTCHA** | RektCaptcha Chrome extension (free, no API key) |
| **Proxies** | Shoplike rotating proxy API (pluggable provider architecture) |
| **Authentication** | JWT (jsonwebtoken + bcryptjs) |
| **Dashboard** | Next.js 15, React 19, TypeScript, Tailwind CSS |
| **HTTP Middleware** | helmet, cors, morgan |

---

## Project Structure

```
autoctr/
├── src/
│   ├── server.js                   ← Express entry point
│   ├── app.js                      ← App factory (middleware, routes)
│   ├── config/
│   │   └── index.js                ← All env vars (single access point)
│   ├── migrations/
│   │   ├── 001_create_users.sql
│   │   ├── 002_create_traffic_summaries.sql
│   │   ├── 003_create_traffic_details.sql
│   │   ├── 004_create_migrations_table.sql
│   │   ├── 005_add_paused_status.sql
│   │   └── 006_add_campaign_duration.sql
│   ├── models/
│   │   ├── db.js                   ← Neon client (sql + pool)
│   │   ├── migrate.js              ← Migration runner CLI
│   │   ├── userModel.js
│   │   ├── campaignModel.js
│   │   └── trafficDetailModel.js
│   ├── services/
│   │   ├── authService.js
│   │   ├── campaignService.js
│   │   ├── trafficDistributionService.js
│   │   ├── workerService.js
│   │   ├── puppeteerService.js
│   │   ├── proxyService.js
│   │   ├── captchaService.js
│   │   └── campaignCompletionService.js
│   ├── controllers/
│   │   ├── authController.js
│   │   └── campaignController.js
│   ├── routes/
│   │   ├── index.js
│   │   ├── auth.js
│   │   └── campaigns.js
│   ├── middlewares/
│   │   └── authenticate.js         ← JWT middleware
│   ├── workers/
│   │   └── trafficWorker.js        ← PM2 worker entry point
│   ├── providers/
│   │   └── shoplikeProxy.js        ← Proxy API integration
│   └── utils/
│       ├── scheduler.js            ← Smart timestamp generation
│       ├── humanBehavior.js        ← Puppeteer human-like actions
│       └── deviceProfiles.js       ← Mobile/desktop UA + viewport
├── dashboard/                      ← Next.js frontend
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                ← Redirects to /dashboard or /login
│   │   ├── login/
│   │   ├── register/
│   │   └── dashboard/
│   │       ├── page.tsx            ← Overview: stats + campaign table
│   │       └── campaigns/
│   │           ├── page.tsx        ← Filterable campaign list
│   │           ├── new/page.tsx    ← Create campaign form
│   │           └── [id]/page.tsx   ← Campaign detail + live progress
│   ├── components/
│   │   ├── Sidebar.tsx
│   │   ├── StatCard.tsx
│   │   ├── CampaignTable.tsx
│   │   ├── StatusBadge.tsx
│   │   ├── ProgressBar.tsx
│   │   ├── NewCampaignForm.tsx
│   │   └── VisitsTable.tsx
│   └── lib/
│       ├── api.ts                  ← Axios instance with JWT interceptor
│       └── auth.ts                 ← Login/logout/cookie helpers
├── extensions/
│   └── rektcaptcha/                ← Unpacked Chrome extension
├── specs/                          ← Feature specifications (12 specs)
├── ecosystem.config.js             ← PM2 process config
├── package.json
└── .env                            ← Backend env vars (not committed)
```

---

## Prerequisites

- **Node.js** 20 or later
- **npm** 9 or later
- **PM2** installed globally: `npm install -g pm2`
- A **Neon** account with a database — [neon.tech](https://neon.tech) (free tier works)
- A **proxy provider** API key (Shoplike or compatible)
- (Optional) RektCaptcha Chrome extension unpacked to `./extensions/rektcaptcha`

---

## Environment Variables

Create a `.env` file in the project root:

```env
# Required
DATABASE_URL=postgresql://user:pass@host/dbname?sslmode=require
JWT_SECRET=your-long-random-secret-here

# Optional (defaults shown)
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:3001
# IANA timezone for the Node process and Postgres session (default: Asia/Dubai)
TZ=Asia/Dubai
# Puppeteer always runs headed (headless: false) — required by the
# RektCaptcha Chrome extension. On Windows the launched Chromium window is
# brought to the foreground at startup (best-effort via PowerShell) so you
# can clearly see each run as it executes. Silent no-op on macOS/Linux.

# Shoplike rotating proxy — comma-separated list of API keys
# Each key = one independent rotating IP slot.
# Keys are pooled across all PM2 workers via a cooldown-aware in-process pool;
# they are no longer pinned 1:1 to workers. More keys = more distinct IPs
# available before the per-key 60s rotation window must elapse.
SHOPLIKE_API_KEYS=key1,key2,key3,...

# CAPTCHA extension path (relative to project root)
REKTCAPTCHA_PATH=./extensions/rektcaptcha

# Total in-flight traffic jobs across all PM2 workers. Each worker runs exactly
# one job at a time, so this is also the PM2 ctr-worker instance count.
# Defaults to os.cpus().length when unset.
WORKER_CONCURRENCY=
```

> The legacy variable name `DB_URL` is still accepted as a fallback for back-compat,
> but new installations should use `DATABASE_URL`.

Create `dashboard/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3000
```

> **Never commit `.env` or `dashboard/.env.local` to version control.**

---

## Installation

```bash
# 1. Clone the repository
git clone <repo-url>
cd autoctr

# 2. Install backend dependencies
npm install

# 3. Install dashboard dependencies
cd dashboard
npm install
cd ..
```

---

## Database Setup

Run migrations against your Neon database (creates all tables, indexes, and enums):

```bash
npm run db:migrate
```

This is **idempotent** — safe to run multiple times. Migrations are tracked in the `_migrations` table.

**Tables created:**

| Table | Purpose |
|---|---|
| `users` | Registered accounts |
| `traffic_summaries` | Campaigns (one row per campaign) |
| `traffic_details` | Individual visits (one row per impression/click) |
| `_migrations` | Migration run history |

**Enums:**

| Enum | Values |
|---|---|
| `campaign_status` | `pending`, `running`, `paused`, `completed` |
| `visit_type` | `impression`, `click` |
| `visit_device` | `mobile`, `desktop` |
| `visit_status` | `pending`, `running`, `completed`, `failed` |

---

## Running the Project

### Development Mode

Run the API server and dashboard in separate terminals:

```bash
# Terminal 1 — API server (port 3000, auto-restarts on file change)
npm run dev

# Terminal 2 — Dashboard (port 3001)
npm run dashboard
```

> Workers are not needed in dev mode unless you want to test visit execution. Start them separately with `node src/workers/trafficWorker.js` if needed.

---

### Production with PM2

#### PM2 Processes

| Name | Script | Instances | Mode | Purpose |
|---|---|---|---|---|
| `ctr-api` | `src/server.js` | 1 | fork | Express REST API |
| `ctr-worker` | `src/workers/trafficWorker.js` | = `WORKER_CONCURRENCY` (defaults to host CPU count) | cluster | Visit execution workers — each runs **exactly one job at a time**, so total in-flight impressions = instance count |

#### Start Commands

```bash
# Start everything at once
pm2 start ecosystem.config.js

# Or start processes individually
pm2 start ecosystem.config.js --only ctr-api
pm2 start ecosystem.config.js --only ctr-worker
```

#### Monitoring

```bash
# Real-time process monitor (CPU, memory, restarts)
pm2 monit

# Check all process statuses at a glance
pm2 status

# Stream logs (all processes)
pm2 logs

# Stream logs for a specific process
pm2 logs ctr-api
pm2 logs ctr-worker

# View last N lines
pm2 logs ctr-worker --lines 50
```

#### Persist Across Reboots

```bash
# Save current PM2 process list
pm2 save

# Register PM2 as a system startup service (follow the printed command)
pm2 startup
```

---

### First-Time Setup Walkthrough

Follow these steps in order the first time you run AutoCTR:

**1. Install PM2 globally**
```bash
npm install -g pm2
```

**2. Install all dependencies**
```bash
# Backend
npm install

# Dashboard
cd dashboard && npm install && cd ..
```

**3. Configure environment**

Ensure `.env` in the project root has these values set:
```
DATABASE_URL=...        ← Neon connection string
JWT_SECRET=...          ← Long random string
TZ=Asia/Dubai           ← IANA timezone (process + DB session)
SHOPLIKE_API_KEYS=...   ← Comma-separated proxy API keys (pooled across workers)
REKTCAPTCHA_PATH=...    ← Path to unpacked RektCaptcha extension
WORKER_CONCURRENCY=     ← Optional; defaults to host CPU count
```

Ensure `dashboard/.env.local` contains:
```
NEXT_PUBLIC_API_URL=http://localhost:3000
```

**4. Run database migrations**
```bash
npm run db:migrate
```
You should see each migration filename logged. Run again to confirm it's idempotent.

**5. Start the API server**
```bash
pm2 start ecosystem.config.js --only ctr-api
```
Verify:
```bash
pm2 logs ctr-api --lines 20
# Expected: "Server running on port 3000"
```

**6. Start the dashboard**
```bash
npm run dashboard
```
Open `http://localhost:3001` in your browser.

**7. Register an account and create a campaign**
1. Go to `http://localhost:3001/register` and create your account
2. Navigate to **New Campaign**
3. Fill in: Website URL, Keyword, Duration (days), Day 1 Visits, Daily Increase %, CTR %, Mobile %, Min/Max Dwell Time
4. The form shows an **Estimated total visits** preview in real time
5. Click **Create & Activate Campaign**
6. You'll be redirected to the campaign detail page — status will show `running`

**8. Start the workers**
```bash
pm2 start ecosystem.config.js --only ctr-worker
```
Watch visits being processed:
```bash
pm2 logs ctr-worker
```
Expected output:
```
[worker-1234] starting | NODE_ENV=production | headless=false | worker_concurrency=8 | jobs_per_worker=1
[worker-1234] claimed 1 jobs
[worker-1234] job abc-123 starting (type=click, device=mobile)
[worker-1234] job abc-123 completed
[worker-1234] claimed 1 jobs
[worker-1234] job def-456 starting (type=impression, device=desktop)
[worker-1234] job def-456 completed
```

The campaign detail page on the dashboard auto-refreshes every 5 seconds, showing live progress until the campaign reaches `completed`.

**9. Save PM2 state**
```bash
pm2 save
pm2 startup   # follow the printed command
```

---

### PM2 Quick Reference

| Action | Command |
|---|---|
| Start API | `pm2 start ecosystem.config.js --only ctr-api` |
| Start workers | `pm2 start ecosystem.config.js --only ctr-worker` |
| Start everything | `pm2 start ecosystem.config.js` |
| Stop workers | `pm2 stop ctr-worker` |
| Stop API | `pm2 stop ctr-api` |
| Stop everything | `pm2 stop all` |
| Restart workers | `pm2 restart ctr-worker` |
| Restart API | `pm2 restart ctr-api` |
| Reload workers (zero-downtime) | `pm2 reload ctr-worker` |
| View all processes | `pm2 status` |
| Live monitor | `pm2 monit` |
| Stream all logs | `pm2 logs` |
| Clear all logs | `pm2 flush` |
| Remove all from PM2 | `pm2 delete all` |
| Save process list | `pm2 save` |
| Register startup service | `pm2 startup` |

---

## API Reference

Base URL: `http://localhost:3000`

All campaign routes require `Authorization: Bearer <token>`.

### Auth

| Method | Endpoint | Body | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | `{ email, password }` | Register a new account |
| `POST` | `/api/auth/login` | `{ email, password }` | Login, returns `{ token }` |

### Campaigns

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/campaigns` | List your campaigns |
| `POST` | `/api/campaigns` | Create a campaign |
| `GET` | `/api/campaigns/:id` | Get a single campaign |
| `DELETE` | `/api/campaigns/:id` | Delete campaign (not while running) |
| `POST` | `/api/campaigns/:id/activate` | Start a pending campaign |
| `POST` | `/api/campaigns/:id/pause` | Pause a running campaign immediately |
| `POST` | `/api/campaigns/:id/restart` | Restart a paused or completed campaign from scratch |
| `GET` | `/api/campaigns/:id/progress` | Live progress counts |
| `GET` | `/api/campaigns/:id/visits` | Paginated, filterable per-visit detail (`status`, `type`, `device`, `sort`, `order`, `limit`, `offset`) |

### Create Campaign — Request Body

```json
{
  "website": "https://example.com",
  "keyword": "buy widgets online",
  "campaign_duration_days": 30,
  "initial_daily_visits": 100,
  "daily_increase_pct": 10,
  "ctr": 5,
  "mobile_desktop_ratio": 60,
  "min_dwell_seconds": 30,
  "max_dwell_seconds": 120
}
```

| Field | Type | Range | Description |
|---|---|---|---|
| `website` | string | valid URL | Target website |
| `keyword` | string | max 200 chars | Google search keyword |
| `campaign_duration_days` | integer | 1–365 | How many days to run |
| `initial_daily_visits` | integer | 1–10,000 | Visits on day 1 |
| `daily_increase_pct` | float | 0–100 | Compound daily growth rate (e.g. 10 = +10%/day) |
| `ctr` | integer | 1–100 | % of visits that click through |
| `mobile_desktop_ratio` | integer | 0–100 | % of visits from mobile devices |
| `min_dwell_seconds` | integer | 10–1800 | Min time on site (clicks only) |
| `max_dwell_seconds` | integer | ≥ min, ≤ 1800 | Max time on site (clicks only) |

> `required_visits` is **computed server-side** as the sum of all daily visit counts and is not accepted from the client.  
> Formula: `SUM(round(initial_daily_visits × (1 + daily_increase_pct/100)^d))` for d = 0 … duration−1.  
> Example: 30 days, 100 day-1 visits, 10% growth → ~1,645 total visits.  
> Maximum: 1,000,000 total visits (returns 400 if exceeded).

### Progress Response

```json
{
  "campaign": { "id": "...", "status": "running", ... },
  "progress": {
    "total": 1000,
    "pending": 400,
    "running": 3,
    "completed": 580,
    "failed": 17,
    "percentComplete": 59.7,
    "avgDwellSeconds": 74
  }
}
```

---

## Dashboard

Access at `http://localhost:3001` after running `npm run dashboard`.

### Pages

| Route | Description |
|---|---|
| `/login` | Sign in to your account |
| `/register` | Create a new account |
| `/dashboard` | Overview — stats row + all campaigns table |
| `/dashboard/campaigns` | Filterable campaign list (by status) |
| `/dashboard/campaigns/new` | Create & activate a new campaign |
| `/dashboard/campaigns/:id` | Campaign detail — progress, action buttons, and a paginated/filterable visits table (live-refreshes every 5s while running) |

### Campaign Table Actions

| Status | Available Actions |
|---|---|
| `pending` | View, **Start**, Delete |
| `running` | View, **Pause** |
| `paused` | View, **Restart**, Delete |
| `completed` | View, **Restart**, Delete |

### Status Badge Colours

| Status | Colour |
|---|---|
| `pending` | Gray |
| `running` | Blue (pulsing) |
| `paused` | Yellow |
| `completed` | Green |
| `failed` | Red |

---

## Campaign Lifecycle

```
[created]
    ↓
 pending  ──── activate ────→  running  ──── pause ────→  paused
                                  │                           │
                              (all visits                  restart
                               terminal)                      │
                                  ↓                           │
                             completed  ←──────────────────────
                                  │
                               restart
```

- **Pause** — immediately marks all `pending` and `running` visit rows as `failed` (with `error_message = 'Campaign paused'`), then sets campaign to `paused`. Workers will not pick up visits from paused campaigns.
- **Restart** — deletes all existing `traffic_details`, regenerates a fresh visit schedule, and sets campaign back to `running`.
- **Delete** — allowed for any non-`running` campaign. Running campaigns must be paused first.

---

## Worker Architecture

### Concurrency model — 1 process, 1 job

Workers run as PM2 cluster instances (`ctr-worker`). The number of instances equals `WORKER_CONCURRENCY`, which defaults to the host's CPU core count (`os.cpus().length`). **Each worker processes exactly one traffic visit at a time** — total in-flight impressions across the system therefore never exceed `WORKER_CONCURRENCY`.

When more visits are due than there are workers, the surplus simply waits in the database with `status='pending'` and is drained as workers free up. The `traffic_details` table itself is the queue. Example: on an 8-core box with 80 due visits, exactly 8 run at any moment and the remaining 72 are picked up in waves.

This bounded parallelism is intentional — both to avoid CPU/RAM saturation on the host and to keep CTR realistic. Bursting hundreds of impressions in parallel from one machine is a strong robotic signal to Google's anti-fraud systems.

Override per-host: set `WORKER_CONCURRENCY=4` (for example) in `.env` before `pm2 start`.

### Polling loop

Each instance independently polls the database in a tight loop:

```
Every 5 seconds:
  1. Atomically claim 1 pending+due visit WHERE campaign.status = 'running'
     via UPDATE ... RETURNING wrapping SELECT ... FOR UPDATE SKIP LOCKED
     (locks the row AND flips it to status='running' in one statement)
  2. Acquire a rotating proxy from the cooldown-aware key pool
  3. Launch stealth Chromium → Google → keyword search → (click target) → dwell
  4. Mark visit → 'completed' or 'failed'
  5. Check if campaign is now fully complete
```

`FOR UPDATE SKIP LOCKED` ensures no two workers process the same visit even when running on the same machine or across distributed infrastructure.

**Graceful shutdown:** On `SIGTERM`, the worker stops accepting new batches and waits up to 30 seconds for the in-flight job to finish before exiting (PM2's `kill_timeout` is set to 35s to honour this).

---

## Proxy Integration

Proxies are assigned at **execution time**, never at campaign creation.

The proxy service iterates through registered providers in order, falling back to the next if one fails. Currently one provider is integrated:

- **Shoplike** (`src/providers/shoplikeProxy.js`) — calls the Shoplike rotating proxy API

### Cooldown-aware key pool

Each Shoplike API key controls one rotating IP slot, gated server-side by a ~60s rotation window. Calling `getNewProxy` on a key inside that window returns the SAME live IP it just had.

Worker count is sized to CPU cores (`WORKER_CONCURRENCY`), independent of how many keys you configure. All workers share an in-process **cooldown-aware key pool**: for each job the pool hands out a key whose 60s window has elapsed, marks it in-use, and releases it after the proxy call returns. If no key is currently rotation-ready the worker waits a few seconds rather than reissuing a stale IP.

Configure your keys as a comma-separated list:
```env
SHOPLIKE_API_KEYS=key1,key2,key3,...
```

Operational guidance:

- **More keys = more parallel distinct IPs.** With 8 cores and 8 keys, every concurrent visit can rotate to a fresh IP. With 8 cores and 2 keys, jobs may briefly queue waiting for a key whose cooldown has elapsed.
- **The pool is per worker process.** Cross-worker coordination is not implemented; Shoplike's server-side rotation gate is the ultimate source of truth, so the worst cross-worker race is two impressions sharing one IP within the 60s window.
- **Key:worker is N:M.** Adding or removing a key in `.env` does not change the worker count; only `WORKER_CONCURRENCY` (or CPU count) does.

**Adding a new provider:**

1. Create `src/providers/yourProvider.js` exporting `async getNewProxy()` that returns:
   ```js
   { host, port, username, password, url }
   ```
2. Import it in `src/services/proxyService.js` and add it to the `PROVIDERS` array.

---

## CAPTCHA Handling

AutoCTR uses the **RektCaptcha** Chrome extension (extension ID: `bbdhfoclddncoaomddgkaaphcnddbpdh`) — free, no API key required.

Setup:
1. Download and unpack the extension to `./extensions/rektcaptcha/`
2. Set `REKTCAPTCHA_PATH=./extensions/rektcaptcha` in `.env`

The extension is loaded into each Puppeteer browser instance via `--load-extension`. If the extension directory is not found at startup, a warning is logged and CAPTCHA solving is skipped (visits that hit CAPTCHAs will be marked `failed`).

CAPTCHA checks occur:
1. On first load of `google.com`
2. After submitting the keyword search

---

## Smart Scheduling

Rather than distributing visits at perfectly uniform intervals (which looks robotic), AutoCTR uses a weighted random scheduler that concentrates traffic toward peak hours.

**Default peak hours:** 9 AM, 1 PM, 6 PM (interpreted in `Asia/Dubai`, configurable via the `TZ` env var)

Visits within peak windows are 3× more likely to be scheduled than off-peak slots. A minimum gap of 30 seconds is enforced between consecutive visits. All times are relative to `NOW()` (Dubai local time) and spread across a 24-hour window. Both the Node process (`process.env.TZ`) and the Postgres pool session (`SET TIME ZONE`) are forced to Dubai so wall-clock arithmetic is consistent across the API, workers, and database.

---

## Security Notes

- Passwords are hashed with **bcrypt** (salt rounds: 10)
- JWTs expire after **7 days** and are stored in an `httpOnly`-style cookie on the dashboard
- All API routes are protected by JWT middleware
- Campaign ownership is verified on every operation — users can only access their own campaigns
- Running campaigns cannot be deleted — they must be paused first
- `helmet` sets secure HTTP headers on every response

---

## Troubleshooting

**`DATABASE_URL` / `JWT_SECRET` missing errors**
→ Ensure `.env` exists in the project root and is correctly formatted. The legacy name `DB_URL` is also accepted, but `DATABASE_URL` is preferred. When running under PM2, the daemon child only sees the env keys explicitly forwarded by `ecosystem.config.js` — if you add a new env var, propagate it through the `SHARED_ENV` block there too.

**PM2 process stuck `errored` / restart-looping**
→ Tail the per-process error log: `pm2 logs ctr-worker --err --lines 50` (or `tail -n 100 logs/ctr-worker-err.log`). The most common causes are: (1) `.env` missing in the cwd PM2 was launched from — `ecosystem.config.js` now pins `cwd: __dirname` and loads `.env` from the project root to prevent this; (2) `SHOPLIKE_API_KEYS` empty — every worker throws on startup. Note: Puppeteer always runs headed, so PM2 must be launched from a session with an attached display (or via `pm2-runtime` inside a desktop session) so Chromium can render its window.

**Worker killed mid-job on restart**
→ `ctr-worker` has `kill_timeout: 35000` so PM2 waits up to 35s for the in-flight 30s SIGTERM drain. Don't reduce this without also lowering the worker's drain budget.

**`Cannot find module 'autoprefixer'`**
→ Run `npm install` inside the `dashboard/` folder.

**`required_visits must be an integer` on campaign create**
→ Ensure all numeric form fields are sent as integers in the API request body (snake_case field names). If you've recently changed validation rules and the new bounds aren't being applied, a stale `node src/server.js` process may be holding port 3000, preventing PM2's `ctr-api` from binding. Run `Get-NetTCPConnection -LocalPort 3000 -State Listen` and kill any non-PM2 owner.

**Workers not picking up jobs**
→ Confirm `npm run db:migrate` has been run (migration 005 adds the `paused` enum value). Without it, the `campaign_status` type doesn't include `paused` and queries may fail.

**CAPTCHA extension not loading**
→ Check that `./extensions/rektcaptcha/manifest.json` exists. The path in `.env` must point to the unpacked extension directory.

**Visits stuck in `running` after a worker crash**
→ Stale `running` rows won't block completion — `campaignCompletionService` only waits for `pending` and `running` rows. On worker restart, those rows will remain `running` permanently. A future cleanup job can reset them to `failed` after a timeout.
