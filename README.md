# AutoCTR — Google CTR Simulation Tool

AutoCTR is a split-architecture tool that automates Google CTR (Click-Through Rate) simulation:

- **Dashboard + API** — a Next.js app deployed to **Vercel**. Users register, create campaigns, and watch live progress. All HTTP endpoints are Next.js Route Handlers under `/api/*` running on Vercel's Node.js serverless runtime, talking directly to Neon PostgreSQL.
- **Workers** — Node.js + Puppeteer + PM2 processes that run on **local PCs** (one or many). They poll the same Neon database, claim due visits, and execute them headed via stealth Chromium with rotating proxies.

The two halves share nothing but the database. Spin up as many local worker hosts as you need; the Vercel side never sees them.

---

## Table of Contents

- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Repository Layout](#repository-layout)
- [Environment Variables](#environment-variables)
- [Setup](#setup)
  - [Database](#database)
  - [Dashboard on Vercel](#dashboard-on-vercel)
  - [Worker host (local PC)](#worker-host-local-pc)
- [Running Locally (dev)](#running-locally-dev)
- [PM2 Worker Reference](#pm2-worker-reference)
- [API Reference](#api-reference)
- [Campaign Lifecycle](#campaign-lifecycle)
- [Worker Architecture](#worker-architecture)
- [Proxy Integration](#proxy-integration)
- [CAPTCHA Handling](#captcha-handling)
- [Smart Scheduling](#smart-scheduling)
- [Security Notes](#security-notes)
- [Troubleshooting](#troubleshooting)

---

## Architecture

```
                 ┌──────────────────────┐
                 │   Vercel (cloud)     │
                 │  ┌────────────────┐  │
   user ───────► │  │ Next.js App    │  │
   browser       │  │ (UI + /api/*)  │  │
                 │  └───────┬────────┘  │
                 └──────────┼───────────┘
                            │ TLS/HTTP
                            ▼
                 ┌──────────────────────┐
                 │   Neon PostgreSQL    │ ◄────── shared state of truth
                 └──────────┬───────────┘
                            │ TLS/HTTP
              ┌─────────────┼──────────────┐
              ▼             ▼              ▼
         ┌────────┐    ┌────────┐     ┌────────┐
         │ PM2 PC │    │ PM2 PC │ ... │ PM2 PC │   local worker hosts
         │  (n×   │    │  (n×   │     │  (n×   │   (one or many)
         │  cores)│    │  cores)│     │  cores)│
         └────────┘    └────────┘     └────────┘
              │             │              │
              ▼             ▼              ▼
              Stealth Chromium → Google → target site
```

- **No internal API server.** The previous Express `ctr-api` PM2 process is gone — every endpoint is a Next.js Route Handler under `dashboard/app/api/`. The dashboard talks to itself same-origin, so no CORS, no public worker URLs, no tunneling.
- **Workers are passive consumers of the database.** They never expose any port. To add capacity, spin up another PC and `pm2 start ecosystem.config.js`.
- **Shared modules** (`shared/services`, `shared/models`, `shared/config`, `shared/utils`, `shared/providers`) are reused by both halves: imported by the Next.js Route Handlers via the `@server/*` webpack alias (and Vercel's `outputFileTracingRoot`) and by the PM2 workers as ordinary `require(...)` calls. The PM2 entry point is `shared/workers/trafficWorker.js`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Dashboard + API (Vercel)** | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS |
| **Database** | Neon (serverless PostgreSQL) via `@neondatabase/serverless` |
| **Auth** | JWT (`jsonwebtoken` + `bcryptjs`), `js-cookie` on the client |
| **Workers (local PCs)** | Node.js 20+, PM2 cluster mode |
| **Browser Automation** | Puppeteer + `puppeteer-extra-plugin-stealth` |
| **CAPTCHA** | RektCaptcha Chrome extension (free, no API key) |
| **Proxies** | Shoplike rotating proxy API (pluggable provider architecture) |

---

## Repository Layout

```
autoctr/
├── dashboard/                    ← Vercel project root (set Root Directory = dashboard/)
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── login/                ← Next.js pages
│   │   ├── register/
│   │   ├── dashboard/
│   │   └── api/                  ← Next.js Route Handlers (was Express)
│   │       ├── health/route.ts
│   │       ├── auth/{login,register,me}/route.ts
│   │       ├── campaigns/route.ts
│   │       ├── campaigns/[id]/route.ts
│   │       ├── campaigns/[id]/{activate,pause,restart,progress,visits}/route.ts
│   │       └── analytics/overview/route.ts
│   ├── components/
│   ├── lib/
│   │   ├── api.ts                ← axios, same-origin baseURL
│   │   ├── auth.ts
│   │   └── server-auth.ts        ← Bearer JWT verification helper for routes
│   ├── next.config.ts            ← outputFileTracingRoot widens tracing to repo root
│   ├── vercel.json
│   ├── package.json
│   └── .env.example
├── shared/                       ← shared backend (used by dashboard + workers)
│   ├── config/index.js
│   ├── models/                   ← db.js, userModel, campaignModel, trafficDetailModel, migrate.js
│   ├── services/                 ← authService, campaignService, analyticsService,
│   │                               trafficDistributionService, workerService,
│   │                               campaignCompletionService, puppeteerService,
│   │                               proxyService, captchaService
│   ├── providers/shoplikeProxy.js
│   ├── utils/                    ← scheduler, humanBehavior, deviceProfiles, proxyParser
│   ├── workers/trafficWorker.js  ← PM2 entry point
│   ├── migrations/*.sql
│   └── package.json              ← runtime deps live here so Node resolution from /shared/* works
├── worker/                       ← local PM2 host (one folder per machine)
│   ├── ecosystem.config.js       ← PM2 config — workers only (no ctr-api)
│   ├── extensions/rektcaptcha/   ← unpacked Chrome extension
│   ├── logs/                     ← PM2 stdout/stderr files
│   ├── scripts/                  ← reset-failed-to-pending, reinstall-captcha, test-captcha
│   ├── package.json              ← worker scripts; postinstall installs ../shared deps
│   └── .env.example              ← worker-side .env template
├── specs/                        ← per-feature spec docs
├── CLAUDE.md
├── README.md
├── .gitignore
└── package.json                  ← slim root with delegating npm scripts (no source code)
```

> The Vercel deployment uses `dashboard/` as its **Root Directory**. Next.js's
> `outputFileTracingRoot` is widened to the repository root so Route Handlers
> can `require('@server/services/...')` (alias → `../shared/*`) and Vercel
> still bundles `shared/` into the serverless function image.

---

## Environment Variables

There are **two completely separate** env surfaces. Do not mix them.

### A) Vercel (dashboard project)

Set these in the Vercel project's **Environment Variables** UI (or `vercel env`).

| Var | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Neon connection string (same DB the workers use) |
| `JWT_SECRET` | yes | Signing secret for user JWTs |
| `APP_TIMEZONE` | no | IANA tz for analytics bucketing (default `Asia/Dubai`) |
| `NEXT_PUBLIC_API_URL` | no | Override only; leave blank for same-origin (recommended) |

> **Do not set `TZ`.** Vercel reserves `TZ` and forces it to `UTC` inside
> serverless functions. We use `APP_TIMEZONE` for application-level
> wall-clock logic so both halves stay consistent regardless of OS clock.

A template lives at [dashboard/.env.example](dashboard/.env.example).

### B) Local worker host (`worker/.env`)

| Var | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Same Neon URL the Vercel project uses |
| `JWT_SECRET` | yes | Required by `shared/config` at first access; workers don't sign tokens |
| `SHOPLIKE_API_KEYS` | yes | Comma-separated rotating-proxy keys |
| `REKTCAPTCHA_PATH` | no | Default `./extensions/rektcaptcha` (resolved against `worker/`) |
| `APP_TIMEZONE` | no | Default `Asia/Dubai` |
| `WORKER_CONCURRENCY` | no | Default = host CPU core count |

A template lives at [worker/.env.example](worker/.env.example).

---

## Setup

### Database

Run migrations once against your Neon database (idempotent):

```bash
cd worker
npm install            # installs worker scripts + ../shared runtime deps
npm run db:migrate
```

Migrations run from any host that can reach Neon — typically a worker PC.

### Dashboard on Vercel

1. Push this repo to GitHub.
2. Import the repo into Vercel.
3. **Project Settings → Build & Development → Root Directory:** `dashboard`.
4. **Settings → Environment Variables:** add the vars from section A above.
5. Trigger a deploy. Vercel will run `next build` from `dashboard/`; the widened `outputFileTracingRoot` ensures `shared/` is bundled into the function image.

The dashboard is reachable at your Vercel URL. The API lives under the same origin at `/api/*`.

### Worker host (local PC)

On every PC that should execute traffic:

```bash
# 1. Install Node 20+ and PM2 globally
npm install -g pm2

# 2. Clone repo and install worker deps (postinstall pulls ../shared deps too)
git clone <repo-url>
cd autoctr/worker
npm install

# 3. Copy & fill .env (see section B above)
cp .env.example .env       # then edit

# 4. Unpack RektCaptcha extension into ./extensions/rektcaptcha/
#    (one-time; required because workers run headed Chromium —
#     `npm run captcha:reinstall` automates the download.)

# 5. Start workers
pm2 start ecosystem.config.js
pm2 save
pm2 startup                # follow the printed command to persist across reboots
```

The number of PM2 instances of `ctr-worker` defaults to the host's CPU core count. Override with `WORKER_CONCURRENCY` in `worker/.env`.

To add capacity, repeat steps 2–5 on another PC. All workers compete for due visits via Postgres `FOR UPDATE SKIP LOCKED` — duplicate processing is impossible.

---

## Running Locally (dev)

From the repository root (the slim root `package.json` delegates to each module):

```bash
# Terminal 1 — dashboard + API on http://localhost:3001
npm run dashboard

# Terminal 2 — one worker (no PM2)
npm run worker
```

The dev dashboard reads `DATABASE_URL` from `dashboard/.env.local` (create one based on `dashboard/.env.example`). Leave `NEXT_PUBLIC_API_URL` unset so the dashboard hits its own `/api/*` routes. The worker reads `worker/.env`.

---

## PM2 Worker Reference

| Action | Command |
|---|---|
| Start workers | `pm2 start ecosystem.config.js` |
| Stop workers | `pm2 stop ctr-worker` |
| Restart workers | `pm2 restart ctr-worker` |
| Reload (zero-downtime) | `pm2 reload ctr-worker` |
| View processes | `pm2 status` |
| Live monitor | `pm2 monit` |
| Stream logs | `pm2 logs ctr-worker` |
| Tail error log | `pm2 logs ctr-worker --err --lines 50` |
| Save process list | `pm2 save` |
| Register startup service | `pm2 startup` |

### Maintenance scripts

All three are wired through npm in both `worker/package.json` and the slim root `package.json` (which delegates):

| Action | Command |
|---|---|
| Reset failed visits → pending (one campaign) | `npm run reset:failed -- <campaignId>` |
| Reset failed visits → pending (every campaign) | `npm run reset:failed` |
| Reinstall RektCaptcha extension | `npm run captcha:reinstall` |
| Smoke-test parallel CAPTCHA solving | `npm run captcha:test [n]` |

`<campaignId>` is the UUID shown in the dashboard URL — `/dashboard/campaigns/<campaignId>`. The reset script flips every `failed` row in scope back to `pending`, clears `error_message` / `started_at` / `completed_at` / `ip` / `actual_dwell_seconds`, and — if the parent campaign was auto-marked `completed` because no pending/running rows remained — flips it back to `running` so the next worker poll picks the rows up. Already-running campaigns are left untouched.

---

## API Reference

Base URL: your Vercel deployment URL (e.g. `https://autoctr.vercel.app`). All campaign routes require `Authorization: Bearer <token>`.

### Auth

| Method | Endpoint | Body | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | `{ email, password }` | Register an account |
| `POST` | `/api/auth/login` | `{ email, password }` | Login, returns `{ user, token }` |
| `GET` | `/api/auth/me` | — | Current user (requires Bearer token) |

### Campaigns

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/campaigns` | List your campaigns |
| `POST` | `/api/campaigns` | Create a campaign |
| `GET` | `/api/campaigns/:id` | Get a single campaign |
| `DELETE` | `/api/campaigns/:id` | Delete (not while running) |
| `POST` | `/api/campaigns/:id/activate` | Start a pending campaign |
| `POST` | `/api/campaigns/:id/pause` | Pause a running campaign |
| `POST` | `/api/campaigns/:id/restart` | Restart a paused or completed campaign |
| `GET` | `/api/campaigns/:id/progress` | Live progress counts |
| `GET` | `/api/campaigns/:id/visits` | Paginated visit detail (`status`, `type`, `device`, `sort`, `order`, `limit`, `offset`) |

### Analytics

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/analytics/overview` | Aggregated dashboard analytics |

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

`required_visits` is computed server-side as
`SUM(round(initial_daily_visits × (1 + daily_increase_pct/100)^d))` for `d = 0 … duration−1`. Hard cap: 1,000,000 total visits per campaign.

---

## Campaign Lifecycle

```
[created]
    ↓
 pending  ── activate ──►  running  ── pause ──►  paused
                              │                       │
                          (all visits             restart
                           terminal)                  │
                              ▼                       │
                          completed  ◄────────────────┘
                              │
                           restart
```

- **Pause** — marks all `pending` and `running` visit rows as `failed` (`error_message='Campaign paused'`), then sets the campaign to `paused`.
- **Restart** — deletes all existing `traffic_details`, regenerates a fresh schedule, sets campaign to `running`.
- **Delete** — allowed for any non-`running` campaign.

---

## Worker Architecture

### Concurrency model — 1 process, 1 job

`ctr-worker` runs in PM2 cluster mode. The instance count equals `WORKER_CONCURRENCY` (defaults to `os.cpus().length`). Each worker processes exactly one visit at a time, so total in-flight impressions per host = its instance count. Excess due rows wait in the database with `status='pending'`.

This bounded parallelism is intentional — both to avoid CPU/RAM saturation and to keep CTR realistic. Bursting hundreds of impressions in parallel from one IP/machine is a strong robotic signal.

### Polling loop

```
Every 5 seconds:
  1. Atomically claim 1 pending+due visit WHERE campaign.status='running'
     via UPDATE ... RETURNING wrapping SELECT ... FOR UPDATE SKIP LOCKED
  2. Acquire a rotating proxy from the cooldown-aware key pool
  3. Launch stealth Chromium → Google → keyword search → (click target) → dwell
  4. Mark visit → 'completed' or 'failed'
  5. Check if campaign is now fully complete
```

`FOR UPDATE SKIP LOCKED` ensures no two workers (on the same or different machines) ever process the same visit.

**Graceful shutdown:** on `SIGTERM` the worker stops accepting batches and waits up to 30s for the in-flight job to finish. PM2's `kill_timeout` is set to 35s to honour this.

---

## Proxy Integration

Proxies are assigned at **execution time**, never at campaign creation. Providers are tried in order via `shared/services/proxyService.js`. Currently integrated:

- **Shoplike** (`shared/providers/shoplikeProxy.js`)

### Cooldown-aware key pool

Each Shoplike API key is one rotating IP slot, gated server-side by a ~60s rotation window. Workers share an in-process pool that hands out a key whose window has elapsed and waits otherwise. The pool is per worker process; cross-worker coordination is provided by Shoplike's server-side rotation gate.

```env
SHOPLIKE_API_KEYS=key1,key2,key3,...
```

More keys = more parallel distinct IPs available within any 60s window.

---

## CAPTCHA Handling

AutoCTR uses the **RektCaptcha** Chrome extension (no API key required).

1. Unpack the extension to `worker/extensions/rektcaptcha/` on every worker host (or run `npm run captcha:reinstall`).
2. Set `REKTCAPTCHA_PATH=./extensions/rektcaptcha` in `worker/.env` (this is also the default; the path is resolved against the `worker/` directory).

The extension is loaded into each Puppeteer browser instance via `--load-extension`. CAPTCHA checks occur on first load of `google.com` and after submitting the keyword search.

Workers always run **headed** (RektCaptcha requires a real Chromium UI), so PM2 must be launched from a session with an attached display.

---

## Smart Scheduling

Visits are not distributed at uniform intervals — that looks robotic. A weighted random scheduler concentrates traffic toward peak hours.

- **Default peak hours:** 9, 13, 18 (interpreted in `APP_TIMEZONE`, default `Asia/Dubai`)
- Peak windows are 3× more likely than off-peak slots
- Minimum 30s gap between consecutive visits
- Multi-day campaigns get their own 24h window per day, starting at `NOW() + d*24h`

All wall-clock arithmetic uses `Intl` APIs against `APP_TIMEZONE` directly, so the scheduler works correctly regardless of the Node process's `TZ` (which Vercel forces to UTC).

---

## Security Notes

- Passwords hashed with **bcrypt** (12 rounds for register; 10 for legacy compatibility paths)
- JWTs expire after 7 days, stored in a `sameSite=strict` cookie on the dashboard
- Every API route verifies the Bearer token + campaign ownership server-side
- Running campaigns cannot be deleted — pause first
- Workers expose no network ports

---

## Troubleshooting

**`DATABASE_URL` / `JWT_SECRET` missing on workers**
→ Ensure `worker/.env` exists. PM2 child processes only see the env keys explicitly forwarded by `worker/ecosystem.config.js` (`SHARED_ENV`); add new vars there if you introduce them.

**`DATABASE_URL` / `JWT_SECRET` missing on Vercel**
→ Set them in Project Settings → Environment Variables for the right environment (Production / Preview / Development) and redeploy.

**Vercel build fails with `Cannot find module '@server/services/...'`**
→ `dashboard/next.config.ts` must include `outputFileTracingRoot` pointing to the repo root and `outputFileTracingIncludes['/api/**/*'] = ['../shared/**/*.js']`, plus the `@server` webpack alias to `../shared`. Verify the file matches the version in this repo.

**PM2 worker stuck `errored`**
→ `pm2 logs ctr-worker --err --lines 50`. Common causes: empty `SHOPLIKE_API_KEYS`, missing `worker/.env`, or no display attached (Puppeteer is headed).

**Visits never run despite campaign `running`**
→ Confirm at least one worker host is reachable to Neon and PM2 shows `online`. Check `pm2 logs ctr-worker` for proxy/captcha failures. Run `npm run db:migrate` from `worker/` if migrations are stale.

**Dashboard returns 401 on every call**
→ The browser cookie is missing or expired. Log in again. If your Vercel deployment URL changed, clear cookies for the old domain.

**Visits stuck in `running` after a worker crash**
→ Stale `running` rows do block completion (the completion service waits for both `pending` and `running` to drain). Clean up manually via SQL or restart-then-pause-then-restart.

**A campaign has piled up `failed` visits and you want to retry them**
→ Run `npm run reset:failed -- <campaignId>` (UUID from `/dashboard/campaigns/<campaignId>`). This flips every `failed` row for that campaign back to `pending`, clears the per-row error/timestamp fields, and reactivates the campaign if it was already auto-completed. Omit `<campaignId>` to apply globally to every campaign in the database.

**CAPTCHA extension not loading**
→ Verify `worker/extensions/rektcaptcha/manifest.json` exists on the worker host. The `REKTCAPTCHA_PATH` is relative to the `worker/` directory.

**CAPTCHA solver stuck after checkbox click** (the extension clicks "I'm not a robot" but never selects image tiles, every job ends with `captcha_timeout`)
→ Almost always caused by missing/quarantined `dist/*.wasm` files in the RektCaptcha extension. The bframe (image-challenge iframe) loads onnxruntime-web, which fetches one of `dist/ort-wasm.wasm`, `dist/ort-wasm-simd.wasm`, `dist/ort-wasm-threaded.wasm`, or `dist/ort-wasm-simd-threaded.wasm` based on CPU feature detection. If the chosen file is missing the bframe console shows `chrome-extension://<id>/dist/ort-wasm-*.wasm net::ERR_FILE_NOT_FOUND` followed by `no available backend found`, the extension never solves the CAPTCHA, and the worker times out 120 s per job.

**Automatic self-heal** is now built in. On every worker process boot, [puppeteerService.js](shared/services/puppeteerService.js) checks the four WASM variants and, if any are missing or truncated below 1 KB, copies the baseline `dist/ort-wasm.wasm` over them. The boot log will show:
```
[captcha] pid=… SELF-HEAL: copied baseline ort-wasm.wasm over N missing/truncated variant(s): …
```
If you see this line, antivirus is quarantining the extension. The heal makes the next CAPTCHA work, but **AV will quarantine the variants again on the next reinstall** unless you add an exclusion. Triage in order:

1. **Read the worker boot log** (`pm2 logs ctr-worker --lines 100`). Look for the `[captcha] RektCaptcha OK at ... (models: 10 .ort files, X.X MB; wasm: N files, Y.Y MB)` line. If you see a `SELF-HEAL` warning, AV is the cause — apply the AV exclusion below and run `npm run captcha:reinstall`. If file totals or counts differ from a known-good worker, AV has truncated something the heal couldn't recover.
2. **Run the strengthened smoke test on the failing host:** `npm run captcha:test 4`. The new criterion only passes when the extension actually selects image tiles (not just opens the bframe). A `FAIL` here means the host is still broken after the heal.
3. **Inspect a real timeout dump.** When a CAPTCHA times out, the worker writes `worker/logs/captcha-timeout-<pid>-<ts>.png` and `.html`, plus a single warning line containing `Final bframe`, `WASM probe`, `Console (last 10)`, `PageErrors (last 5)`. The most diagnostic field is the bframe `Console` log — RektCaptcha emits lines starting with `rektcaptcha:` when its model loads. Their absence after the bframe opens means ONNX runtime never initialised. Cross-reference with `WASM probe`: any entries with `error`, `status >= 400`, or `size: 0` confirm AV is still blocking files even after the heal copy.
4. **Force the baseline WASM build.** If the heal isn't enough (e.g. AV deletes the copy mid-run), reinstall with all variant slots overwritten with the baseline content:
   ```powershell
   # Run from worker/
   $env:REKTCAPTCHA_BASELINE_WASM="true"; npm run captcha:reinstall
   # or, equivalently:
   node scripts/reinstall-captcha-extension.js --force-baseline-wasm
   pm2 restart all
   ```
   The script overwrites `ort-wasm-simd.wasm`, `ort-wasm-threaded.wasm`, and `ort-wasm-simd-threaded.wasm` with copies of `ort-wasm.wasm`. Whichever variant onnxruntime picks, the fetched bytes are the baseline scalar build — works on every CPU and does not depend on `crossOriginIsolated` / `SharedArrayBuffer`. ~30-50 % slower per CAPTCHA.
5. **Force software rendering.** If steps 1-4 don't resolve it, set `WORKER_FORCE_SOFTWARE_RENDER=true` in `worker/.env` and `pm2 restart all`. Launches Chromium with SwiftShader (pure-CPU GL) so the bframe's WebAssembly+OffscreenCanvas pipeline can't deadlock on a broken or stale GPU driver. ~10-20 % extra CPU per browser.
6. **Fast-fail latch.** After the first CAPTCHA timeout per worker process where two of the signals `tiles_never_selected`, `no_rektcaptcha_console_log`, `wasm_fetch_failed` are detected, the worker latches into FAST-FAIL mode and returns `captcha_timeout` after 5 s for every subsequent job in that PID instead of burning the full 120 s. This protects the queue from a misconfigured host. The latch is cleared by `pm2 restart all`.

**Required Windows Defender + corporate AV exclusions** (this is the permanent fix — the self-heal is a workaround):
- `<repo>\worker\extensions\` — extension files including `models/*.ort` and `dist/*.wasm`.
- The puppeteer Chromium cache (run `npx puppeteer browsers list` to find the exact path; usually `%LOCALAPPDATA%\puppeteer\chrome\<rev>\`).
- The Chromium temp profile directory (`%TEMP%\puppeteer_dev_profile-*`).

To add the extensions exclusion via PowerShell as Admin:
```powershell
Add-MpPreference -ExclusionPath "C:\Users\Sajid\Documents\AutoCTR\worker\extensions"
```
