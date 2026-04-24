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
Each PM2 instance runs `trafficWorker.js` independently. Use `FOR UPDATE SKIP LOCKED` in the DB query (already in `trafficDetailModel.findPendingDue`) so workers don't double-claim jobs.

```
POLL_INTERVAL_MS = 5000        (every 5 seconds)
BATCH_SIZE = 5                 (jobs per worker per poll)
MAX_CONCURRENT_JOBS = 3        (per worker instance)
```

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
  1. Fetch up to BATCH_SIZE pending+due jobs via trafficDetailModel.findPendingDue()
     NOTE: findPendingDue only returns jobs from 'running' campaigns — paused campaigns
     are automatically skipped by the AND ts.status = 'running' filter in the query.
  2. For each job (up to MAX_CONCURRENT_JOBS in parallel):
     a. Mark job as 'running' (set started_at = NOW())
     b. Call puppeteerService.executeJob(job) [stub until spec-07]
        job includes: min_dwell_seconds, max_dwell_seconds (from the JOIN in findPendingDue)
        puppeteerService assigns proxy and returns { success, proxyHost, actualDwellSeconds }
     c. On success: mark 'completed', set ip = result.proxyHost, completed_at, actual_dwell_seconds
     d. On failure: mark 'failed', set error_message
  3. After each job: call campaignCompletionService.checkAndComplete(summaryId)
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
- Poll results: `fetched N jobs`
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
