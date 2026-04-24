# spec-04 — Campaign API (CRUD)

**Status:** not started
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
create({ userId, website, keyword, requiredVisits, ctr, mobileDesktopRatio, minDwellSeconds, maxDwellSeconds })
  → inserts into traffic_summaries, returns row

findAllByUser(userId)
  → SELECT ... WHERE user_id = userId ORDER BY created_at DESC

findById(id)
  → SELECT ... WHERE id = id (single row or null)

findByIdAndUser(id, userId)
  → same but also filters by user_id (ownership check)

updateStatus(id, status)
  → UPDATE status + updated_at
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
```

### Validation (in service layer)
- `website` — must be a valid URL (use `new URL(...)`)
- `keyword` — non-empty string, max 200 chars
- `required_visits` — integer, 1–100000
- `ctr` — integer, 1–100
- `mobile_desktop_ratio` — integer, 0–100
- `min_dwell_seconds` — integer, 10–1800 (default: 30 if omitted)
- `max_dwell_seconds` — integer, >= `min_dwell_seconds`, <= 1800 (default: 120 if omitted)
- Return 400 with `{ error, field }` for each violation

### Routes (`src/routes/campaigns.js`)
All routes require `authenticate` middleware.

```
POST   /api/campaigns          → create campaign → 201 + campaign
GET    /api/campaigns          → list user's campaigns → 200 + []
GET    /api/campaigns/:id      → single campaign → 200 + campaign | 404
DELETE /api/campaigns/:id      → delete if status=pending → 200 | 409 if running/completed
```

### Response Shape
```json
{
  "id": "uuid",
  "website": "https://example.com",
  "keyword": "buy widgets",
  "required_visits": 1000,
  "ctr": 5,
  "mobile_desktop_ratio": 60,
  "min_dwell_seconds": 30,
  "max_dwell_seconds": 120,
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
- [ ] `DELETE /api/campaigns/:id` works for `pending` campaigns
- [ ] `DELETE /api/campaigns/:id` returns 409 for `running` campaigns
- [ ] All endpoints return 401 without valid token
