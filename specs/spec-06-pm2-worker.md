# spec-06 — PM2 Worker & Scheduler

**Status:** complete
**Depends on:** spec-05
**Blocks:** spec-07, spec-11

---

## Goal
Implement the PM2 worker process that polls `traffic_details` for due pending rows, marks them `running`, and hands them off to the Puppeteer execution engine (stubbed for now). After this spec, workers run in cluster mode, pick up jobs, and update status. Puppeteer calls are no-ops until spec-07.

---

## Files to Create/Modify
```
src/
  workers/
    trafficWorker.js      ← main PM2 worker entry point
    jobQueue.js           ← controls concurrency per worker
  services/
    workerService.js      ← orchestrates poll → execute → update cycle
```

---

## Implementation Details

### Worker Architecture
Each PM2 instance runs `trafficWorker.js` independently. Jobs are claimed via
`trafficDetailModel.claimPendingDue(limit)`, which performs an atomic
`UPDATE ... RETURNING` wrapping a `SELECT ... FOR UPDATE OF td SKIP LOCKED`.
The row is locked **and** flipped to `status='running'` (with `started_at = NOW()`)
inside one statement, so two PM2 workers polling on the same tick can never
claim the same row.

```
POLL_INTERVAL_MS    = 5000        (every 5 seconds)
MAX_CONCURRENT_JOBS = 3            (per worker instance)
BATCH_SIZE          = MAX_CONCURRENT_JOBS
```

BATCH_SIZE is intentionally pinned to MAX_CONCURRENT_JOBS — over-fetching would
just hold extra rows in `running` while they wait for a free in-process slot,
starving the other PM2 workers.

### `src/workers/trafficWorker.js`
```js
// Entry point for PM2
const workerService = require('../services/workerService');

async function run() {
  while (true) {
    await workerService.processBatch();
    await sleep(POLL_INTERVAL_MS);
  }
}

process.on('SIGTERM', () => { /* graceful shutdown flag */ });
run();
```

### `src/services/workerService.js`

```js
async processBatch()
  1. Atomically claim up to BATCH_SIZE pending+due jobs via
     trafficDetailModel.claimPendingDue(BATCH_SIZE). Rows come back already
     marked 'running' with started_at = NOW(). claimPendingDue only returns
     jobs from 'running' campaigns — paused campaigns are skipped by the
     AND ts.status = 'running' filter in the query.
  2. If 0 jobs were claimed, log a throttled queue snapshot (at most once per
     60s) showing pendingDueStats() so operators can distinguish "no work due"
     from "all due rows already in flight".
  3. For each claimed job (run all in parallel — BATCH_SIZE == MAX_CONCURRENT_JOBS):
     a. Call puppeteerService.executeJob(job).
        job includes: min_dwell_seconds, max_dwell_seconds (from the JOIN in claimPendingDue)
        puppeteerService assigns proxy and returns { success, proxyHost, actualDwellSeconds }
     b. On success: mark 'completed', set ip = result.proxyHost, completed_at, actual_dwell_seconds
     c. On failure (or thrown exception): mark 'failed', set error_message
  4. After each job (success, failure, OR thrown exception): call
     campaignCompletionService.checkAndComplete(summaryId) so a campaign whose
     final visit threw still transitions to 'completed'.
```

### Proxy Stub (`src/services/proxyService.js`)
```js
async getProxy() { return '0.0.0.0'; }  // real impl in spec-08
```

### Puppeteer Stub (`src/services/puppeteerService.js`)
```js
async executeJob(job) {
  // real impl in spec-07
  await sleep(500 + Math.random() * 1000);  // simulate work
  return { success: true };
}
```

### Campaign Completion Stub (`src/services/campaignCompletionService.js`)
```js
async checkAndComplete(summaryId) {}  // real impl in spec-11
```

### Graceful Shutdown
On `SIGTERM`:
- Stop accepting new batches
- Wait for in-flight jobs to finish (max 30s)
- Exit 0

### Logging
Use a simple logger that prefixes each line with `[worker-${process.pid}]`. Log:
- Successful poll: `claimed N jobs`
- Idle poll (throttled to once per 60s): `claimed 0 jobs (queue snapshot: pending_due=X, running=Y, pending_future=Z)`
- Each job start: `job ${id} starting (type=click, device=mobile)`
- Each job end: `job ${id} completed` or `job ${id} failed: <error>`

---

## Acceptance Criteria
- [ ] `node src/workers/trafficWorker.js` runs without crashing
- [ ] Worker picks up pending+due `traffic_details` rows every 5 seconds
- [ ] Claimed jobs move to `running` immediately (no double-claiming by parallel workers)
- [ ] Jobs eventually move to `completed` (via stub)
- [ ] SIGTERM causes graceful shutdown — in-flight jobs complete before exit
- [ ] `pm2 start ecosystem.config.js --only ctr-worker` runs multiple instances without conflict
