# Specs Index

Run `/progress` to see live status. This file is the canonical list.

| ID | Spec | Status | Depends On |
|---|---|---|---|
| spec-01 | Project Setup & Folder Structure | not started | — |
| spec-02 | Database Schema & Migrations | not started | spec-01 |
| spec-03 | Authentication System (JWT) | not started | spec-02 |
| spec-04 | Campaign API (CRUD) | not started | spec-03 |
| spec-05 | Traffic Distribution Engine | not started | spec-04 |
| spec-06 | PM2 Worker & Scheduler | not started | spec-05 |
| spec-07 | Puppeteer Execution Engine | not started | spec-06 |
| spec-08 | Proxy Integration | not started | spec-07 |
| spec-09 | CAPTCHA Solving | not started | spec-08 |
| spec-10 | Smart Scheduling Algorithm | not started | spec-05 |
| spec-11 | Campaign Completion Logic | not started | spec-06 |
| spec-12 | Dashboard (Next.js Frontend) | not started | spec-04 |

## Status Values
- `not started` — not begun
- `in progress` — currently being implemented
- `complete` — implemented and verified
- `blocked` — waiting on a dependency or external factor
