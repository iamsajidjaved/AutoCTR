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
- **Visits panel** (`VisitsTable` component): paginated table of every visit for the campaign
  - Columns: Scheduled, Type, Device, Status, Started, Completed, Dwell, IP
  - Filter dropdowns: status, type, device
  - Sort dropdown: scheduled↑/↓, started↓, completed↓
  - Page size 25, prev/next pagination, total + range indicator
  - Failed rows are clickable and expand inline to show `error_message`
  - Auto-refreshes every 5s while campaign is `running` (same cadence as Progress card)
  - All times rendered in `Asia/Dubai` (matches backend / scheduler timezone)
  - Backed by `GET /api/campaigns/:id/visits`

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

---

## Enterprise Redesign (Metronic-inspired)

The dashboard was overhauled to a Metronic-style admin shell with a full design system, light/dark themes, and rich data visualizations powered by Recharts.

### New Dependencies
```
dashboard/package.json
  recharts        ^2.15.0
  lucide-react    latest
  clsx            latest
```
Install with `npm install --legacy-peer-deps` (React 19 peer mismatch with Recharts 2.x).

### File Structure (post-redesign)
```
dashboard/
  app/
    layout.tsx                     ← inline theme bootstrap script (no FOUC), Inter font, ThemeProvider wrapper
    globals.css                    ← CSS variable tokens (:root + .dark) + .card/.input/.btn-* utility classes
    page.tsx                       ← redirect-only
    login/page.tsx                 ← redesigned, uses .card/.input/.btn-primary + ThemeToggle
    register/page.tsx              ← same pattern as login
    dashboard/
      page.tsx                     ← Overview: KPI row + 7 charts + recent visits widget + campaign table
      campaigns/
        page.tsx                   ← list with filter tabs, wrapped in AppShell
        new/page.tsx               ← AppShell wrapper around NewCampaignForm
        [id]/page.tsx              ← AppShell + Card-based detail view
  components/
    AppShell.tsx                   ← auth guard + Sidebar + Topbar + <main>
    Sidebar.tsx                    ← collapsible (w-60 ↔ w-[68px]), section headings, lucide icons
    Topbar.tsx                     ← sticky, title/subtitle, search box, notification bell, ThemeToggle, actions slot
    ThemeProvider.tsx              ← context: theme/toggle/setTheme; persists to localStorage('autoctr-theme')
    ThemeToggle.tsx                ← Sun/Moon icon button
    Card.tsx                       ← title/subtitle/actions/noPadding/className/bodyClassName props
    KpiCard.tsx                    ← label/value/delta/deltaLabel/icon/accent/spark/hint
    StatusBadge.tsx                ← redesigned with semantic tokens + dot indicator (sizes sm/md)
    ProgressBar.tsx                ← uses bg-surface-2 track + bg-brand fill
    CampaignTable.tsx              ← icon-only action buttons (lucide), semantic tokens
    VisitsTable.tsx                ← restyled with .card + chevron expand
    NewCampaignForm.tsx            ← three .card sections: Target / Schedule / Behavior
    charts/
      Sparkline.tsx                ← line-only Recharts mini chart for KpiCard
      AreaTrend.tsx                ← multi-series area with linear gradients
      StackedBars.tsx              ← stacked bar chart
      LineTrend.tsx                ← single-series line w/ optional yFormatter
      Donut.tsx                    ← Pie innerRadius="62%", center label/value, legend grid
      HorizontalBars.tsx           ← pure-CSS horizontal bars from rows[]
      Heatmap.tsx                  ← 7×24 grid, sqrt-scaled intensity, Less/More legend
  lib/
    api.ts                         ← unchanged
    auth.ts                        ← unchanged
    chartColors.ts                 ← useChartColors() SSR-safe hook reading CSS vars (re-reads on theme change)
```

### Design System (CSS Variable Tokens)
Defined in `app/globals.css` as RGB triples (`R G B`) so Tailwind can use `rgb(var(--token) / α)`:

| Token               | Light          | Dark           | Purpose                          |
|---------------------|----------------|----------------|----------------------------------|
| `--bg`              | slate-50       | gray-950       | Page background                  |
| `--surface`         | white          | gray-900       | Cards                            |
| `--surface-2`       | slate-100      | gray-800       | Inner panels, info tiles         |
| `--surface-hover`   | slate-200      | gray-800/50    | Hover states                     |
| `--border`          | slate-200      | gray-800       | Default borders                  |
| `--border-strong`   | slate-300      | gray-700       | Emphasized borders               |
| `--fg`              | gray-900       | gray-50        | Primary text                     |
| `--muted`           | gray-600       | gray-400       | Secondary text                   |
| `--subtle`          | gray-400       | gray-500       | Tertiary text/icons              |
| `--brand`           | blue-600       | blue-500       | Primary action / accent          |
| `--brand-hover`     | blue-700       | blue-400       | Hover state for brand            |
| `--brand-soft`      | blue-50        | blue-950       | Brand-tinted surfaces            |
| `--success`         | emerald-600    | emerald-400    | Status success                   |
| `--warning`         | amber-500      | amber-400      | Status warning                   |
| `--danger`          | red-600        | red-400        | Status danger / destructive      |
| `--info`            | sky-500        | sky-400        | Status info / running            |

Tailwind config (`tailwind.config.ts`) maps these to semantic class names: `bg-bg`, `bg-surface`, `bg-surface-2`, `text-fg`, `text-muted`, `text-subtle`, `border-border`, `bg-brand`, `text-brand`, `bg-success/10`, etc.

Utility classes in `globals.css`:
- `.card` — surface bg, border, rounded-xl, card shadow
- `.input` — full-width input/textarea/select with focus ring (brand)
- `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger` — standardized button variants
- `.label-xs` — uppercase tiny label

### Theme Toggle
- `ThemeProvider` reads `localStorage('autoctr-theme')` or `prefers-color-scheme` on mount
- Applies/removes `dark` class on `<html>`
- Inline script in `<head>` of `layout.tsx` runs before React hydrates → prevents FOUC
- `ThemeToggle` component (Sun/Moon icons) sits in Topbar + auth-page corners

### Overview Page (`/dashboard`)
1. **KPI row (4 cards):** Active Campaigns · Completed Visits (+sparkline) · Clicks (+sparkline) · Actual CTR (+sparkline)
2. **Visits over time** (`AreaTrend`, last 14 days, completed + failed) + **Campaign status** (`Donut`)
3. **Clicks vs Impressions** (`StackedBars`) + **CTR trend** (`LineTrend`)
4. **Device split** (`Donut`) + **Top campaigns** (`HorizontalBars`)
5. **Activity heatmap** (`Heatmap`, 7×24, last 7 days, Asia/Dubai) + **Source IP distribution** (`HorizontalBars`)
6. **Recent visits** widget (last 10) + 3 mini KPIs (Avg dwell · Mobile share · Paused)
7. **All campaigns** table inside `<Card noPadding>`

All charts hydrate colors from CSS vars via `useChartColors()` so they re-theme live with the toggle.
Empty-state placeholders render for charts whenever the underlying series is empty.

### Backend Support
This redesign required the new `GET /api/analytics/overview` endpoint documented in [spec-04](spec-04-campaign-api.md#analytics-endpoint-added-with-dashboard-redesign). All time bucketing uses `Asia/Dubai` to match the worker scheduler.

### Updated Acceptance Criteria
- [ ] Theme toggle persists across reloads (`localStorage('autoctr-theme')`)
- [ ] No FOUC on initial paint (inline bootstrap script applied before hydration)
- [ ] All pages render with visual parity in light and dark themes
- [ ] All Recharts components re-color on theme change without remount issues
- [ ] Empty-state placeholders render for each chart when its data series is empty
- [ ] Sidebar collapses to icon-only width and persists collapsed state
- [ ] Topbar is sticky and remains visible on scroll
- [ ] Overview page renders KPIs, all 7 chart components, recent visits widget, and full campaign table
- [ ] `/api/analytics/overview` is fetched in parallel with `/api/campaigns` on the Overview page
