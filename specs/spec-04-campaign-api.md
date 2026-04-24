# spec-04 — Campaign API (CRUD)

**Status:** complete
**Depends on:** spec-03
**Blocks:** spec-05, spec-12

---

## Goal
REST endpoints for creating, listing, and viewing traffic campaigns (`traffic_summaries`). Does NOT generate `traffic_details` yet — that's spec-05. After this spec, authenticated users can manage campaigns via the API.

---

## Files to Create/Modify
```
src/
  models/
    campaignModel.js
  services/
    campaignService.js
  controllers/
    campaignController.js
  routes/
    campaigns.js
    index.js          ← mount /campaigns router
```

---

## Implementation Details

### `src/models/campaignModel.js`
```js
create({ userId, website, keyword, requiredVisits, ctr, mobileDesktopRatio, minDwellSeconds, maxDwellSeconds, campaignDurationDays, initialDailyVisits, dailyIncreasePct })
  → inserts into traffic_summaries (including duration/daily fields), returns row

findAllByUser(userId)
  → SELECT ... WHERE user_id = userId ORDER BY created_at DESC

findById(id)
  → SELECT ... WHERE id = id (single row or null)

findByIdAndUser(id, userId)
  → same but also filters by user_id (ownership check)

updateStatus(id, status)
  → UPDATE status + updated_at

deleteById(id)
  → DELETE FROM traffic_summaries WHERE id = $1

markCompleted(id)
  → UPDATE status = 'completed' WHERE id = $1 AND status = 'running'
     AND NOT EXISTS (pending/running traffic_details)
  → race-safe: no-op if another worker already completed it

pauseAndCancelJobs(id)
  → UPDATE traffic_details SET status = 'failed', error_message = 'Campaign paused'
     WHERE traffic_summary_id = $1 AND status IN ('pending', 'running')
  → UPDATE traffic_summaries SET status = 'paused' WHERE id = $1
```

### `src/services/campaignService.js`
```js
createCampaign(userId, body)
  → validate inputs (see below)
  → campaignModel.create(...)
  → return campaign row

listCampaigns(userId)
  → campaignModel.findAllByUser(userId)

getCampaign(id, userId)
  → campaignModel.findByIdAndUser(id, userId)
  → throw 404 if not found

deleteCampaign(id, userId)
  → ownership check → throw 404 if not found
  → throw 409 if status === 'running' ("pause it first")
  → campaignModel.deleteById(id)

activateCampaign(id, userId)
  → ownership check → throw 404 if not found
  → throw 409 if status !== 'pending'
  → generateVisits → bulkCreate → set status = 'running' (transaction)
  → return { campaign, visitsScheduled: N }

pauseCampaign(id, userId)
  → ownership check → throw 404 if not found
  → throw 409 if status !== 'running'
  → campaignModel.pauseAndCancelJobs(id)
  → return updated campaign row

restartCampaign(id, userId)
  → ownership check → throw 404 if not found
  → throw 409 if status not in ['paused', 'completed']
  → DELETE old traffic_details → generateVisits → bulkCreate → set status = 'running' (transaction)
  → return { campaign, visitsScheduled: N }
```

### Validation (in service layer)
- `website` — must be a valid URL (use `new URL(...)`)
- `keyword` — non-empty string, max 200 chars
- `campaign_duration_days` — integer, 1–365 (default: 1)
- `initial_daily_visits` — integer, 1–10000 (visits on day 1)
- `daily_increase_pct` — float, 0–100 (default: 0); compound daily growth rate
- `ctr` — integer, 1–100
- `mobile_desktop_ratio` — integer, 0–100
- `min_dwell_seconds` — integer, 10–1800 (default: 30 if omitted)
- `max_dwell_seconds` — integer, >= `min_dwell_seconds`, <= 1800 (default: 120 if omitted)
- `required_visits` is **computed** from the three schedule fields (not supplied by client):
  ```
  required_visits = SUM(round(initial_daily_visits * (1 + daily_increase_pct/100)^d)) for d=0..duration-1
  ```
  Maximum computed total: 1,000,000 (returns 400 if exceeded)
- Return 400 with `{ error, field }` for each violation

### Routes (`src/routes/campaigns.js`)
All routes require `authenticate` middleware.

```
POST   /api/campaigns              → create campaign → 201 + campaign
GET    /api/campaigns              → list user's campaigns → 200 + []
GET    /api/campaigns/:id          → single campaign → 200 + campaign | 404
DELETE /api/campaigns/:id          → delete if not running → 200 | 409 if running
POST   /api/campaigns/:id/activate → start pending campaign → 200
POST   /api/campaigns/:id/pause    → pause running campaign, cancel all pending/running visits → 200
POST   /api/campaigns/:id/restart  → restart paused/completed campaign from scratch → 200
GET    /api/campaigns/:id/progress → progress counts → 200
GET    /api/campaigns/:id/visits   → paginated, filterable list of visits → 200
```

#### `GET /api/campaigns/:id/visits` query params
| Param   | Type   | Default        | Notes |
|---------|--------|----------------|-------|
| `status`| string | (all)          | `pending` \| `running` \| `completed` \| `failed` |
| `type`  | string | (all)          | `impression` \| `click` |
| `device`| string | (all)          | `mobile` \| `desktop` |
| `sort`  | string | `scheduled_at` | `scheduled_at` \| `started_at` \| `completed_at` |
| `order` | string | `asc`          | `asc` \| `desc` (NULLS LAST is always applied) |
| `limit` | int    | `50`           | Clamped to `1..200` |
| `offset`| int    | `0`            | Non-negative |

Response:
```json
{
  "visits": [
    {
      "id": "uuid",
      "scheduled_at": "2026-04-24T...",
      "started_at": null,
      "completed_at": null,
      "type": "click",
      "device": "mobile",
      "status": "pending",
      "ip": null,
      "actual_dwell_seconds": null,
      "error_message": null
    }
  ],
  "total": 1645,
  "limit": 50,
  "offset": 0
}
```

### Response Shape
```json
{
  "id": "uuid",
  "website": "https://example.com",
  "keyword": "buy widgets",
  "required_visits": 3310,
  "ctr": 5,
  "mobile_desktop_ratio": 60,
  "min_dwell_seconds": 30,
  "max_dwell_seconds": 120,
  "campaign_duration_days": 30,
  "initial_daily_visits": 100,
  "daily_increase_pct": "10.00",
  "status": "pending",
  "created_at": "2026-04-24T...",
  "updated_at": "2026-04-24T..."
}
```

---

## Acceptance Criteria
- [ ] `POST /api/campaigns` creates campaign (status=pending), returns 201
- [ ] Invalid URL returns 400 with field name
- [ ] `GET /api/campaigns` lists only the requesting user's campaigns
- [ ] `GET /api/campaigns/:id` returns 404 for another user's campaign
- [ ] `DELETE /api/campaigns/:id` works for non-running campaigns (pending, paused, completed)
- [ ] `DELETE /api/campaigns/:id` returns 409 for `running` campaigns
- [ ] `POST /api/campaigns/:id/pause` sets status to `paused` and marks all pending/running visits as `failed`
- [ ] `POST /api/campaigns/:id/restart` deletes old visits, regenerates, sets status to `running`
- [ ] All endpoints return 401 without valid token
