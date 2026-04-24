# spec-12 — Dashboard (Next.js Frontend)

**Status:** complete
**Depends on:** spec-04 (API must exist)
**Blocks:** —

---

## Goal
Build an enterprise-grade Next.js frontend dashboard in `/dashboard`. Dark sidebar layout with stats overview, a filterable campaign data table, and full campaign lifecycle controls (create, start, pause, restart, delete).

---

## Setup
```bash
cd dashboard
npm install
```

Add to root `package.json`:
```json
"dashboard": "cd dashboard && npm run dev"
```

---

## Files
```
dashboard/
  app/
    layout.tsx                      ← dark root layout with suppressHydrationWarning
    page.tsx                        ← redirects to /login or /dashboard
    login/page.tsx                  ← dark theme login
    register/page.tsx               ← dark theme register
    dashboard/
      page.tsx                      ← overview: stats + campaign table
      campaigns/
        page.tsx                    ← filterable campaign list
        new/page.tsx                ← create campaign form
        [id]/page.tsx               ← campaign detail + progress + actions
  lib/
    api.ts                          ← axios instance with JWT interceptor
    auth.ts                         ← login/register/logout helpers
  components/
    Sidebar.tsx                     ← dark sidebar with nav links + logout
    StatCard.tsx                    ← metric card for overview row
    CampaignTable.tsx               ← data table with action buttons
    CampaignCard.tsx                ← (legacy, replaced by table)
    ProgressBar.tsx                 ← dark theme progress bar
    StatusBadge.tsx                 ← colored pill: pending/running/paused/completed/failed
    NewCampaignForm.tsx             ← dark theme campaign creation form
```

---

## Implementation Details

### Design System
- Background: `gray-950` body, `gray-900` cards, `gray-800` inner sections
- Sidebar: fixed `w-60`, `gray-900` with `blue-600` active state
- Accent: `blue-500/600` for primary actions
- Status colors: gray=pending, blue+pulse=running, yellow=paused, green=completed, red=failed

### API Client (`lib/api.ts`)
- Axios pointing to `NEXT_PUBLIC_API_URL` (`.env.local`)
- Request interceptor: reads `token` cookie → `Authorization: Bearer ...`
- Response interceptor: on 401 → clear cookie, redirect to `/login`

### Auth Flow
- JWT stored in cookie (7-day, `sameSite: strict`)
- Client-side guard: `getToken()` check in `useEffect`, redirect to `/login` if missing

### Pages

#### Overview (`/dashboard`)
- Stats row: Total Campaigns, Active (running), Completed, Paused
- Second stats row: Total Visits Scheduled, Avg CTR
- `CampaignTable` with all campaigns + inline action buttons
- Refresh button

#### Campaigns (`/dashboard/campaigns`)
- Status filter tabs: all / pending / running / paused / completed
- `CampaignTable` filtered by selected tab
- `+ New Campaign` button

#### New Campaign (`/dashboard/campaigns/new`)
- **Traffic Schedule section** (grouped card):
  - Duration (days) — integer, 1–365
  - Day 1 Visits — integer, 1–10,000
  - Daily Increase % — float, 0–100 (compound growth rate)
  - Live preview: "Estimated total visits: X" (turns red if > 1,000,000)
- CTR % (1–100), Mobile % slider (0–100)
- Min/Max Dwell seconds
- Client-side validation (URL constructor, range checks, max >= min, total < 1M)
- Submit button disabled when total > 1,000,000
- On submit: `POST /api/campaigns` → `POST /api/campaigns/:id/activate` → redirect to detail page

#### Campaign Detail (`/dashboard/campaigns/:id`)
- Header: keyword, website link, status badge, action button (Start/Pause/Restart)
- Info grid: Total Visits, CTR, Duration, Mobile %, (Day 1 Visits + Daily Increase % shown only for multi-day campaigns), Min/Max Dwell
- Progress card: `ProgressBar`, 4 status count boxes
- Polls `GET /api/campaigns/:id/progress` every 5s while `running`, stops when `completed` or `paused`

### `CampaignTable` Action Logic
| Status    | Available Actions          |
|-----------|---------------------------|
| pending   | View, Start, Delete        |
| running   | View, Pause                |
| paused    | View, Restart, Delete      |
| completed | View, Restart, Delete      |

### `StatusBadge` Colors
```
pending   → gray-700 bg, gray-300 text
running   → blue-900 bg, blue-300 text, animate-pulse
paused    → yellow-900 bg, yellow-300 text
completed → green-900 bg, green-300 text
failed    → red-900 bg, red-300 text
```

---

## Environment
`dashboard/.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:3000
```

---

## Acceptance Criteria
- [ ] `npm run dashboard` starts Next.js dev server on port 3001
- [ ] Unauthenticated users are redirected to `/login`
- [ ] Login/register use dark theme with AutoCTR branding
- [ ] Overview page shows stats cards + full campaign table
- [ ] Campaign table shows correct action buttons per status
- [ ] Start button activates a pending campaign
- [ ] Pause button pauses a running campaign immediately
- [ ] Restart button restarts a paused/completed campaign from scratch
- [ ] Delete works for non-running campaigns
- [ ] New campaign form shows Duration, Day 1 Visits, Daily Increase % fields with live total preview
- [ ] Submit button disabled when computed total exceeds 1,000,000
- [ ] Detail page shows campaign duration, Day 1 visits, and daily increase % for multi-day campaigns
- [ ] New campaign form validates URL client-side before submitting
- [ ] Detail page polls every 5 seconds while running, stops when completed/paused
- [ ] `paused` status renders yellow badge
