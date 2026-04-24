# AutoCTR — Google CTR Simulation Tool

AutoCTR is a full-stack tool that automates Google CTR (Click-Through Rate) simulation. Users create traffic campaigns specifying a target website and keyword; the system then distributes visits across a 24-hour window and executes them via headless Chromium browsers using rotating proxies and stealth techniques to mimic real human behaviour.

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
2. The user creates a campaign — providing a target URL, keyword, total visits, CTR %, mobile/desktop split, and dwell time range.
3. On activation, the system generates one `traffic_details` row per visit, with randomised type (click/impression), device (mobile/desktop), and a smart-scheduled timestamp spread across the next 24 hours weighted toward peak traffic hours.
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
│   │   └── 005_add_paused_status.sql
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
│   │   └── NewCampaignForm.tsx
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

# Proxy provider
PROXY_API_KEY=your-proxy-api-key

# CAPTCHA extension path (relative to project root)
REKTCAPTCHA_PATH=./extensions/rektcaptcha
```

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

### Development

Run the API server and dashboard in separate terminals:

```bash
# Terminal 1 — API server (port 3000, auto-restarts on file change)
npm run dev

# Terminal 2 — Dashboard (port 3001)
npm run dashboard
```

### Production (with PM2)

```bash
# Start everything
pm2 start ecosystem.config.js

# Start only the API
pm2 start ecosystem.config.js --only ctr-api

# Start only the workers (scales to all CPU cores)
pm2 start ecosystem.config.js --only ctr-worker

# View logs
pm2 logs

# Monitor
pm2 monit

# Stop all
pm2 stop all
```

PM2 processes:

| Name | Script | Instances | Mode |
|---|---|---|---|
| `ctr-api` | `src/server.js` | 1 | fork |
| `ctr-worker` | `src/workers/trafficWorker.js` | max (all CPUs) | cluster |

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

### Create Campaign — Request Body

```json
{
  "website": "https://example.com",
  "keyword": "buy widgets online",
  "required_visits": 1000,
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
| `required_visits` | integer | 1–100,000 | Total visits to simulate |
| `ctr` | integer | 1–100 | % of visits that click through |
| `mobile_desktop_ratio` | integer | 0–100 | % of visits from mobile devices |
| `min_dwell_seconds` | integer | 10–1800 | Min time on site (clicks only) |
| `max_dwell_seconds` | integer | ≥ min, ≤ 1800 | Max time on site (clicks only) |

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
| `/dashboard/campaigns/:id` | Campaign detail with live progress (polls every 5s) |

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

Workers run as PM2 cluster instances (`ctr-worker`). Each instance independently polls the database in a tight loop:

```
Every 5 seconds:
  1. SELECT up to 5 pending+due visits WHERE campaign.status = 'running'
     FOR UPDATE SKIP LOCKED  ← prevents double-claiming
  2. For each visit (up to 3 in parallel):
     a. Mark visit → 'running'
     b. Acquire rotating proxy
     c. Launch stealth Chromium → Google → keyword search → (click target) → dwell
     d. Mark visit → 'completed' or 'failed'
     e. Check if campaign is now fully complete
```

`FOR UPDATE SKIP LOCKED` ensures no two workers process the same visit even when running on the same machine or across distributed infrastructure.

**Graceful shutdown:** On `SIGTERM`, the worker stops accepting new batches and waits up to 30 seconds for in-flight jobs to finish before exiting.

---

## Proxy Integration

Proxies are assigned at **execution time**, never at campaign creation.

The proxy service iterates through registered providers in order, falling back to the next if one fails. Currently one provider is integrated:

- **Shoplike** (`src/providers/shoplikeProxy.js`) — calls the Shoplike rotating proxy API using `PROXY_API_KEY`

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

**Default peak hours:** 9 AM, 1 PM, 6 PM

Visits within peak windows are 3× more likely to be scheduled than off-peak slots. A minimum gap of 30 seconds is enforced between consecutive visits. All times are relative to `NOW()` and spread across a 24-hour window.

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
→ Ensure `.env` exists in the project root and is correctly formatted.

**`Cannot find module 'autoprefixer'`**
→ Run `npm install` inside the `dashboard/` folder.

**`required_visits must be an integer` on campaign create**
→ Ensure all numeric form fields are sent as integers in the API request body (snake_case field names).

**Workers not picking up jobs**
→ Confirm `npm run db:migrate` has been run (migration 005 adds the `paused` enum value). Without it, the `campaign_status` type doesn't include `paused` and queries may fail.

**CAPTCHA extension not loading**
→ Check that `./extensions/rektcaptcha/manifest.json` exists. The path in `.env` must point to the unpacked extension directory.

**Visits stuck in `running` after a worker crash**
→ Stale `running` rows won't block completion — `campaignCompletionService` only waits for `pending` and `running` rows. On worker restart, those rows will remain `running` permanently. A future cleanup job can reset them to `failed` after a timeout.
