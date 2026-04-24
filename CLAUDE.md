# AutoCTR — Google CTR Simulation Tool

## Project Summary
Node.js + Neon (PostgreSQL) backend that automates Google CTR simulation via PM2 workers and Puppeteer. Users create traffic campaigns; workers execute impressions and clicks using rotating proxies and stealth browsers.

## Tech Stack
- **Backend:** Node.js + Express.js
- **Database:** Neon (PostgreSQL via `@neondatabase/serverless`)
- **Workers:** PM2 cluster mode
- **Automation:** Puppeteer + `puppeteer-extra-plugin-stealth`
- **Captcha:** RektCaptcha Chrome extension (free, no API key — extension ID: `bbdhfoclddncoaomddgkaaphcnddbpdh`)
- **Proxies:** Rotating proxy API (assign per-visit)
- **Frontend:** Next.js (in `/dashboard`)

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
| `/api <task>` | Express routes, auth, campaign endpoints |
| `/worker <task>` | PM2, polling loop, scheduling, completion |
| `/browser <task>` | Puppeteer, stealth, on-site behavior, CAPTCHA |

**Utilities**
| Command | What it does |
|---|---|
| `/scaffold <type> <name>` | Generate boilerplate (model/service/controller/route/migration) |
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
- Express route handlers go in `src/controllers/` (thin — delegate to services)
- Workers live in `src/workers/`
- Config/env access only through `src/config/index.js`
- Never assign proxy IP at campaign creation time — assign at execution time only
- Status values: `pending` → `running` → `completed` (never skip states)
