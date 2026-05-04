# AutoCTR — Google CTR Simulation Tool

## Project Summary
Split-architecture CTR simulator. **Dashboard + API** ship as a Next.js app on **Vercel** (no Express server — every endpoint is a Route Handler under `dashboard/app/api/*`). **Workers** are PM2 + Puppeteer processes running on **local PCs** (one or many). Both halves share Neon (PostgreSQL) and reuse the modules under `src/` (services, models, config, utils, providers).

## Tech Stack
- **Dashboard + API (Vercel):** Next.js 15 (App Router), React 19, TypeScript, Tailwind, Node.js serverless runtime. Route Handlers in `dashboard/app/api/*` import shared backend code from `../../src/*` (Vercel bundles it via `outputFileTracingRoot` widened to the repo root).
- **Database:** Neon (PostgreSQL via `@neondatabase/serverless`)
- **Workers (local PM2):** PM2 cluster mode — instance count = CPU cores (override via `WORKER_CONCURRENCY`); each worker runs exactly one traffic job at a time, so total in-flight impressions per host = CPU core count
- **Automation:** Puppeteer + `puppeteer-extra-plugin-stealth`
- **Captcha:** RektCaptcha Chrome extension (free, no API key — extension ID: `bbdhfoclddncoaomddgkaaphcnddbpdh`)
- **Proxies:** Shoplike rotating proxy API (assign per-visit)

## Architecture rules
- **No Express anywhere.** The previous `ctr-api` PM2 process is removed. All HTTP lives in Next.js Route Handlers.
- **Workers expose no ports.** They poll Neon, claim due rows via `FOR UPDATE SKIP LOCKED`, and execute. Add capacity by spinning up another PC and running PM2.
- **`TZ` is reserved by Vercel** (forced to `UTC` for serverless functions). Never set `TZ` in `.env`, `ecosystem.config.js`, or anywhere else. Use `APP_TIMEZONE` (default `Asia/Dubai`) for all wall-clock logic. The scheduler uses `Intl` APIs against `APP_TIMEZONE` directly so it's correct regardless of the Node process clock.
- **Two `.env` surfaces.** Vercel project env (`DATABASE_URL`, `JWT_SECRET`, optionally `APP_TIMEZONE`) and worker host `.env` (adds `SHOPLIKE_API_KEYS`, `REKTCAPTCHA_PATH`, `WORKER_CONCURRENCY`). They share `DATABASE_URL` and `JWT_SECRET` only when you want shared-token semantics.

## How to Work on This Project

Specs live in [`specs/`](specs/). Each spec is one self-contained feature. **Always implement one spec at a time.**

### Custom Commands — full reference in [`.claude/AGENTS.md`](.claude/AGENTS.md)

**Workflow**
| Command | What it does |
|---|---|
| `/progress` | Show all specs with live status, next action |
| `/spec <id>` | Display spec + dependency check + file existence |
| `/implement <id>` | Implement a spec end-to-end |
| `/review <id>` | Verify implementation against acceptance criteria |
| `/plan <description>` | Create a new spec from a feature description |

**Domain sub-agents** (spawn focused Claude instance for one layer)
| Command | Domain |
|---|---|
| `/db <task>` | Migrations, schema, Neon queries |
| `/api <task>` | Next.js Route Handlers, JWT auth, campaign endpoints |
| `/worker <task>` | PM2, polling loop, scheduling, completion |
| `/browser <task>` | Puppeteer, stealth, on-site behavior, CAPTCHA |

**Utilities**
| Command | What it does |
|---|---|
| `/scaffold <type> <name>` | Generate boilerplate (model/service/route/migration) |
| `/validate` | Check all complete specs against their acceptance criteria |
| `/debug <description>` | Investigate and fix a specific issue |

### Workflow
1. Run `/progress` to see what's done and what's next
2. Pick the lowest-numbered unblocked spec
3. Run `/implement spec-XX` — Claude reads the spec and builds it
4. Mark status as `complete` in the spec file when done
5. Move to the next spec

### Spec Dependency Order
```
spec-01 (setup) → spec-02 (DB schema) → spec-03 (auth)
       → spec-04 (campaign API) → spec-05 (traffic distribution)
       → spec-06 (PM2 worker) → spec-07 (puppeteer)
       → spec-08 (proxy) → spec-09 (captcha)
       → spec-10 (smart scheduling) → spec-11 (completion logic)
       → spec-12 (dashboard)
```

## Key Conventions
- All DB queries go in `src/models/`
- Business logic goes in `src/services/`
- HTTP entrypoints live in `dashboard/app/api/*/route.ts` — keep them thin and delegate to services. Use `dashboard/lib/server-auth.ts` for Bearer-token validation.
- Workers live in `src/workers/`
- Config/env access only through `src/config/index.js`. The config module validates `DATABASE_URL` + `JWT_SECRET` at import time but is **lazy** about worker-only vars (`SHOPLIKE_API_KEYS`, `REKTCAPTCHA_PATH`) so the Vercel bundle doesn't need them set.
- Never assign proxy IP at campaign creation time — assign at execution time only
- Status values: `pending` → `running` → `completed` (never skip states)
- **Concurrency:** 1 PM2 worker = 1 traffic instance at a time. Total parallel impressions per host = `WORKER_CONCURRENCY` (defaults to `os.cpus().length`). Excess due rows queue in `traffic_details.status='pending'`.
- **Maintenance scripts** live in `scripts/` and are wired through npm scripts in the root `package.json`:
  - `npm run reset:failed -- <campaignId>` — flip every `failed` row of one campaign back to `pending` (clears `error_message`, `started_at`, `completed_at`, `ip`, `actual_dwell_seconds`); reactivates the parent `traffic_summaries` row to `running` if it was already auto-completed. `<campaignId>` is the UUID from `/dashboard/campaigns/<campaignId>`.
  - `npm run reset:failed` (no arg) — same operation applied globally across every campaign.
  - `node scripts/reinstall-captcha-extension.js` — reinstall the RektCaptcha extension from the Chrome Web Store.
- **SERP-click invariant (core product rule):** A "click" job MUST be executed by clicking the target's organic anchor on the Google SERP via a real mouse event (`page.mouse.click(x, y)` on `a[ping^="/url"]`), so Google's `/url?...` redirect fires and the visit is recorded by Google as a genuine SERP click with `Referer: google.com`. Never use `page.goto(targetUrl)` — or any other direct navigation, link-copy, or `window.open` of the target — as the click action. The only direct navigation allowed in a job is `page.goto('https://www.google.com')` to start the search. Impression jobs MUST search Google and dwell on the SERP without ever clicking the target domain.
