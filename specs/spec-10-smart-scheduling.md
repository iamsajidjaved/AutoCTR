# spec-10 — Smart Scheduling Algorithm

**Status:** complete
**Depends on:** spec-05
**Blocks:** —

---

## Goal
Replace the uniform timestamp distribution from spec-05 with an intelligent scheduler that mimics real human traffic patterns: peak hours, random jitter, and no clustering. After this spec, activate uses the smart scheduler; existing campaigns are unaffected.

---

## Files to Create/Modify
```
src/
  utils/
    scheduler.js          ← smart timestamp generator
  services/
    trafficDistributionService.js   ← swap in smart scheduler
```

---

## Implementation Details

### `src/utils/scheduler.js`

#### Core Function
```js
generateTimestamps(count, options)
```

**Options:**
```js
{
  startAt: Date,          // default: now
  windowHours: 24,        // spread window in hours (default 24)
  peakHours: [9, 13, 18], // hours (0-23) to weight more heavily (default: business hours)
  peakWeight: 3,          // how much heavier peak slots are vs off-peak
  minGapSeconds: 30,      // minimum seconds between any two visits (default 30)
}
```

#### Algorithm
1. Divide the window into 1-hour buckets
2. Assign each bucket a weight: `peakWeight` if hour is in `peakHours`, `1` otherwise
3. Distribute `count` visits across buckets proportionally to weight
4. Within each bucket, distribute timestamps randomly (not uniformly)
5. Add jitter: ±10% of the bucket size to each timestamp
6. Sort all timestamps, enforce `minGapSeconds` by pushing forward any that are too close
7. Return sorted array of `Date` objects

#### Example Output
For 100 visits, 24h window, peak at 9am/1pm/6pm:
- ~30 visits during peak hours
- ~70 spread across off-peak
- No two visits within 30 seconds of each other
- Timestamps look organic (not perfectly spaced)

### Geo-Based Variation
```js
{
  timezone: 'Asia/Dubai'  // shift peak hours to this IANA timezone
}
```
Use `Intl.DateTimeFormat` to compute the local hour for each bucket — no external library needed. `trafficDistributionService` passes `config.TIMEZONE` (Dubai by default) so peak hours 9 / 13 / 18 are interpreted as Dubai-local clock hours regardless of where the worker process is hosted.

### Integration with `trafficDistributionService.js`
Replace the temporary uniform distribution:
```js
// Before (spec-05 temporary):
visits[i].scheduledAt = new Date(Date.now() + i * intervalMs);

// After (spec-10):
const timestamps = scheduler.generateTimestamps(visits.length, {
  startAt: new Date(),
  windowHours: 24,
  peakHours: [9, 13, 18],
  peakWeight: 3,
  minGapSeconds: 30,
  timezone: config.TIMEZONE,  // 'Asia/Dubai' by default
});
visits.forEach((v, i) => { v.scheduledAt = timestamps[i]; });
```

---

## Acceptance Criteria
- [x] `generateTimestamps(100, {...})` returns exactly 100 Date objects
- [x] All timestamps fall within the specified window
- [x] No two timestamps are less than `minGapSeconds` apart
- [x] Peak hours have noticeably more visits than off-peak hours (>2x more per hour)
- [x] Campaign activation uses smart scheduling (not uniform spacing)
- [x] `generateTimestamps` is a pure function — same inputs produce statistically similar (not identical) outputs
