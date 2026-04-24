# spec-11 — Campaign Completion Logic

**Status:** not started
**Depends on:** spec-06
**Blocks:** —

---

## Goal
Replace the campaign completion stub from spec-06 with real logic that marks a campaign `completed` once all its `traffic_details` rows are done (completed or failed). After this spec, campaigns automatically transition to `completed` status without manual intervention.

---

## Files to Create/Modify
```
src/
  services/
    campaignCompletionService.js   ← replaces stub
  models/
    campaignModel.js               ← add markCompleted()
  routes/
    campaigns.js                   ← add GET /:id/progress endpoint
```

---

## Implementation Details

### `campaignCompletionService.js`

```js
async checkAndComplete(summaryId)
  1. Call trafficDetailModel.countByStatus(summaryId)
     → { pending, running, completed, failed }
  2. If pending > 0 OR running > 0: return (campaign still in progress)
  3. If pending === 0 AND running === 0:
     → campaignModel.markCompleted(summaryId)
     → log: `Campaign ${summaryId} marked completed`
```

This runs after every batch in `workerService.js` (already wired in spec-06 stub).

### `campaignModel.markCompleted(id)`
```sql
UPDATE traffic_summaries
SET status = 'completed', updated_at = NOW()
WHERE id = $1
  AND status = 'running'
  AND NOT EXISTS (
    SELECT 1 FROM traffic_details
    WHERE traffic_summary_id = $1
      AND status IN ('pending', 'running')
  );
```
Use the `NOT EXISTS` guard to make this safe against race conditions.

### Progress Endpoint
```
GET /api/campaigns/:id/progress
```

Returns:
```json
{
  "campaign": { "id": "...", "status": "running", "min_dwell_seconds": 30, "max_dwell_seconds": 120, ... },
  "progress": {
    "total": 1000,
    "pending": 400,
    "running": 3,
    "completed": 580,
    "failed": 17,
    "percentComplete": 59.7,
    "avgDwellSeconds": 74
  }
}
```

`percentComplete = (completed + failed) / total * 100`
`avgDwellSeconds = AVG(actual_dwell_seconds) WHERE actual_dwell_seconds IS NOT NULL` (null for impressions)

### Failed Visit Handling
- Failed visits count toward completion (campaign won't be stuck waiting for them)
- The completion query checks `status IN ('pending', 'running')` — `failed` is treated as terminal

### Optional: Retry Failed Visits
Do not implement retry logic in this spec. If needed, add it as a separate spec later.

---

## Acceptance Criteria
- [ ] Campaign status changes to `completed` when all visits are `completed` or `failed`
- [ ] `GET /api/campaigns/:id/progress` returns accurate counts
- [ ] Completion check is idempotent — calling it multiple times doesn't error
- [ ] Race condition: two workers finishing simultaneously both call `markCompleted` — only one UPDATE fires (the other is a no-op due to `NOT EXISTS`)
- [ ] Campaign with all `failed` visits still reaches `completed` status
