# spec-12 — Dashboard (Next.js Frontend)

**Status:** complete
**Depends on:** spec-04 (API must exist)
**Blocks:** —

---

## Goal
Build a Next.js frontend dashboard in `/dashboard`. After this spec, users can log in, create campaigns, activate them, and watch live progress — all from a browser UI.

---

## Setup
```bash
cd dashboard
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir
npm install axios js-cookie
```

Add to root `package.json`:
```json
"dashboard": "cd dashboard && npm run dev"
```

---

## Files to Create
```
dashboard/
  app/
    layout.tsx
    page.tsx                    ← redirects to /login or /dashboard
    login/page.tsx
    register/page.tsx
    dashboard/
      page.tsx                  ← campaign list
      campaigns/
        new/page.tsx            ← create campaign form
        [id]/page.tsx           ← campaign detail + progress
  lib/
    api.ts                      ← axios instance with token header
    auth.ts                     ← login/register/logout helpers
  components/
    CampaignCard.tsx
    ProgressBar.tsx
    StatusBadge.tsx
    NewCampaignForm.tsx
```

---

## Implementation Details

### API Client (`lib/api.ts`)
- Axios instance pointing to `NEXT_PUBLIC_API_URL` (from `.env.local`)
- Interceptor: reads JWT from cookie (`token`), adds `Authorization: Bearer ...`
- On 401 response: redirect to `/login`

### Auth Flow
- On login/register: store JWT in cookie (7-day expiry, `sameSite: strict`)
- On logout: clear cookie, redirect to `/login`
- Protect `/dashboard/**` routes: if no token cookie, redirect to `/login`

### Pages

#### Login (`/login`)
- Email + password form
- On submit: `POST /api/auth/login`, store token, redirect to `/dashboard`
- Link to `/register`

#### Campaign List (`/dashboard`)
- `GET /api/campaigns` on page load
- Show each campaign as a `CampaignCard` (status, keyword, website, visits, CTR)
- Status badge: pending=gray, running=blue, completed=green
- "New Campaign" button → `/dashboard/campaigns/new`

#### New Campaign Form (`/dashboard/campaigns/new`)
Fields:
- Website URL (text, validated client-side with URL constructor)
- Keyword (text)
- Total Visits (number, 1–100000)
- CTR % (number, 1–100)
- Mobile % (number, 0–100, slider recommended)
- Min Dwell Time (seconds, number, 10–1800, default 30)
- Max Dwell Time (seconds, number, >= min value, <= 1800, default 120)

Validate client-side that `max_dwell_seconds >= min_dwell_seconds` before submitting.

On submit:
1. `POST /api/campaigns` → get campaign ID
2. `POST /api/campaigns/:id/activate`
3. Redirect to `/dashboard/campaigns/:id`

#### Campaign Detail (`/dashboard/campaigns/:id`)
- Show campaign info at top
- `ProgressBar` component: completed/total with % label
- Status counts: pending / running / completed / failed
- Poll `GET /api/campaigns/:id/progress` every 5 seconds while status is `running`
- Stop polling when status = `completed`

### Components

#### `StatusBadge`
```tsx
// Renders colored pill based on status string
pending → gray | running → blue (pulsing) | completed → green | failed → red
```

#### `ProgressBar`
```tsx
// Props: completed, total
// Renders a bar + "580 / 1000 (58%)"
```

---

## Environment
Create `dashboard/.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:3000
```

---

## Acceptance Criteria
- [ ] `npm run dashboard` starts Next.js dev server on port 3001
- [ ] Unauthenticated users are redirected to `/login`
- [ ] Login works and stores token in cookie
- [ ] Campaign list shows all user campaigns with correct status badges
- [ ] New campaign form validates URL client-side before submitting
- [ ] Creating + activating a campaign redirects to detail page
- [ ] Detail page polls for progress and updates every 5 seconds while running
- [ ] Progress bar reaches 100% and polling stops when campaign completes
