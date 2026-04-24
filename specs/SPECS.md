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

## Glossary

| Term | Definition |
|---|---|
| **Impression** | The PM2 worker searches the keyword on Google, solves any Google CAPTCHA if it appears, views the SERP, scrolls up and down, then closes the browser. The target website appears in the results but is **not clicked**. Google records this as a search impression. |
| **Click / Visit** | The PM2 worker searches the keyword on Google, solves any Google CAPTCHA if it appears, finds the target website in the SERP, clicks on it, and interacts with the site for the configured dwell period (scroll, internal navigation, text selection). |
| **CTR** | Click-through rate (%). Percentage of total visits that are clicks vs. impressions. e.g. `ctr=20` → 20% clicks, 80% impressions. |
| **Dwell time** | Seconds spent on the target site during a click/visit. Controlled by `min_dwell_seconds` / `max_dwell_seconds`. Not applicable to impressions. |
