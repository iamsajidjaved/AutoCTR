# Specs Index

Run `/progress` to see live status. This file is the canonical list.

| ID | Spec | Status | Depends On |
|---|---|---|---|
| spec-09 | CAPTCHA Solving | complete | spec-08 |
| spec-01 | Project Setup & Folder Structure | complete | — |
| spec-02 | Database Schema & Migrations | complete | spec-01 |
| spec-03 | Authentication System (JWT) | complete | spec-02 |
| spec-04 | Campaign API (CRUD) | complete | spec-03 |
| spec-05 | Traffic Distribution Engine | complete | spec-04 |
| spec-06 | PM2 Worker & Scheduler | complete | spec-05 |
| spec-07 | Puppeteer Execution Engine | complete | spec-06 |
| spec-08 | Proxy Integration | complete | spec-07 |
| spec-10 | Smart Scheduling Algorithm | complete | spec-05 |
| spec-11 | Campaign Completion Logic | not started | spec-06 |
| spec-12 | Dashboard (Next.js Frontend) | not started | spec-04 |

## Status Values
- `not started` — not begun
- `in progress` — currently being implemented
- `complete` — implemented and verified
- `blocked` — waiting on a dependency or external factor
