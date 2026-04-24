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

Input: campaign row from `traffic_summaries`

```
totalVisits = required_visits
totalClicks = Math.round(required_visits * ctr / 100)
totalImpressions = totalVisits - totalClicks

mobileCount = Math.round(totalVisits * mobile_desktop_ratio / 100)
desktopCount = totalVisits - mobileCount
```

Build an array of `totalVisits` visit objects:
- First, assign types: shuffle an array of `totalClicks` clicks + `totalImpressions` impressions
- Then, assign devices: shuffle an array of `mobileCount` mobiles + `desktopCount` desktops
- Zip type + device together

For timestamps: use the smart scheduling utility from spec-10. For now (before spec-10), spread visits uniformly across a 24-hour window starting from `NOW()`.

```js
// Temporary scheduling (replaced by spec-10):
const windowMs = 24 * 60 * 60 * 1000;
const intervalMs = windowMs / totalVisits;
visits[i].scheduledAt = new Date(Date.now() + i * intervalMs);
```

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
- [ ] Total rows = `required_visits`
- [ ] Click rows = `Math.round(required_visits * ctr / 100)`
- [ ] Mobile rows = `Math.round(required_visits * mobile_desktop_ratio / 100)`
- [ ] All rows start with `status=pending`
- [ ] Campaign `status` changes to `running`
- [ ] Activating an already-running campaign returns 409
- [ ] Works for large campaigns (1000+ visits) — no timeout, batched inserts
