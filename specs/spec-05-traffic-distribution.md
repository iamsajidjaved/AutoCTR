# spec-05 — Traffic Distribution Engine

**Status:** complete
**Depends on:** spec-04
**Blocks:** spec-06, spec-10

---

## Goal
When a campaign is activated, generate all `traffic_details` rows — one per visit, with correct type/device split and placeholder timestamps. After this spec, calling `POST /api/campaigns/:id/activate` populates `traffic_details` and moves the campaign to `running`.

---

## Files to Create/Modify
```
src/
  services/
    trafficDistributionService.js
  models/
    trafficDetailModel.js
  controllers/
    campaignController.js   ← add activate endpoint
  routes/
    campaigns.js            ← add POST /:id/activate
```

---

## Implementation Details

### Distribution Algorithm (`trafficDistributionService.js`)

The service exports a single `generateVisits(campaign)` function that detects the campaign mode:

#### Multi-day mode (`initial_daily_visits != null`)

Campaign has `campaign_duration_days`, `initial_daily_visits`, and `daily_increase_pct`.

```
For each day d = 0 .. campaign_duration_days - 1:
  dayVisits = Math.round(initial_daily_visits * (1 + daily_increase_pct/100)^d)
  dayStart  = NOW() + d * 24h
  generate dayVisits visit rows with scheduledAt inside [dayStart, dayStart+24h]
```

Per-day visit generation (`buildDayVisits`):
```
dayClicks      = Math.round(dayVisits * ctr / 100)
dayImpressions = dayVisits - dayClicks
dayMobile      = Math.round(dayVisits * mobile_desktop_ratio / 100)
dayDesktop     = dayVisits - dayMobile

types   = shuffle([...clicks, ...impressions])
devices = shuffle([...mobiles, ...desktops])
timestamps = scheduler.generateTimestamps(dayVisits, {
  startAt: dayStart,
  windowHours: 24,
  peakHours: [9, 13, 18],
  peakWeight: 3,
  minGapSeconds: 30,
})
```

#### Legacy single-day mode (`initial_daily_visits == null`)

Backward-compatible path for old campaigns. Uses `required_visits` directly:

```
totalClicks  = Math.round(required_visits * ctr / 100)
totalImpressions = required_visits - totalClicks
...same shuffle + timestamp logic with startAt = NOW(), windowHours = 24
```

#### Helper: `buildDayVisits(dayVisits, ctr, mobileRatio, dayStart)`
Shared between both modes — generates the type/device/timestamp arrays for one day slice.

### `src/models/trafficDetailModel.js`
```js
bulkCreate(rows)
  → INSERT INTO traffic_details (...) VALUES ... (batch insert, max 500 rows per query)

findPendingDue(limit)
  → SELECT td.*, ts.min_dwell_seconds, ts.max_dwell_seconds, ts.website, ts.keyword
     FROM traffic_details td
     JOIN traffic_summaries ts ON ts.id = td.traffic_summary_id
     WHERE td.status = 'pending' AND td.scheduled_at <= NOW()
       AND ts.status = 'running'   -- skips paused/completed campaigns
     ORDER BY td.scheduled_at ASC
     LIMIT limit
     FOR UPDATE OF td SKIP LOCKED
  -- AND ts.status = 'running' prevents workers picking up stale pending rows
  -- from campaigns that were paused mid-run (added with spec-12 pause feature)

updateStatus(id, status, { ip, startedAt, completedAt, actualDwellSeconds, errorMessage } = {})
  → UPDATE traffic_details SET status=..., actual_dwell_seconds=..., ... WHERE id=...

countByStatus(summaryId)
  → { pending, running, completed, failed } counts for a campaign

avgDwellSeconds(summaryId)
  → AVG(actual_dwell_seconds) WHERE actual_dwell_seconds IS NOT NULL (null if no data)
```

### Activate Endpoint
```
POST /api/campaigns/:id/activate
```
- Authenticated, must own campaign
- Campaign must be `pending` (409 if already `running`/`completed`)
- Run inside a DB transaction:
  1. Call distribution service → build visit array
  2. Bulk insert into `traffic_details`
  3. Update `traffic_summaries.status` = `running`
- Return `{ campaign, visitsScheduled: N }`

### Edge Cases
- `ctr=100` → all clicks, no impressions
- `ctr=0` is blocked by DB constraint (min 1) — don't handle
- `required_visits=1` → still works (1 visit, click or impression based on ctr)
- Batch inserts must handle campaigns with 10,000+ visits (use batches of 500)

---

## Acceptance Criteria
- [ ] `POST /api/campaigns/:id/activate` on a pending campaign creates correct count of `traffic_details` rows
- [ ] Multi-day: total rows = SUM of per-day rounded visit counts
- [ ] Single-day (legacy): total rows = `required_visits`
- [ ] Click rows per day = `Math.round(dayVisits * ctr / 100)`
- [ ] Mobile rows per day = `Math.round(dayVisits * mobile_desktop_ratio / 100)`
- [ ] Multi-day: each day's visits are scheduled within its own 24h window
- [ ] All rows start with `status=pending`
- [ ] Campaign `status` changes to `running`
- [ ] Activating an already-running campaign returns 409
- [ ] Works for large campaigns (1000+ visits) — no timeout, batched inserts
