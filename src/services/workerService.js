const trafficDetailModel = require('../models/trafficDetailModel');
const puppeteerService = require('./puppeteerService');
const campaignCompletionService = require('./campaignCompletionService');

// Strict invariant: 1 PM2 process == 1 in-flight traffic instance at a time.
// Each worker claims exactly one row per poll cycle and `await`s its execution
// before claiming again. Total system concurrency therefore equals the PM2
// instance count, which is sized to os.cpus().length (overridable via
// WORKER_CONCURRENCY). This bounds parallel impressions to the CPU core count
// to keep CTR realistic and prevent host saturation.
const MAX_CONCURRENT_JOBS = 1;
const BATCH_SIZE = MAX_CONCURRENT_JOBS;

// Throttle the "0 jobs" diagnostic so logs don't drown when the queue is idle.
let lastIdleDiagnosticAt = 0;
const IDLE_DIAGNOSTIC_INTERVAL_MS = 60_000;

function log(msg) {
  console.log(`[worker-${process.pid}] ${msg}`);
}

async function processJob(job) {
  log(`job ${job.id} starting (type=${job.type}, device=${job.device})`);

  // Note: the row was already moved to 'running' (with started_at) atomically
  // by claimPendingDue, so we do NOT issue a second 'running' update here.

  let result;
  try {
    result = await puppeteerService.executeJob(job);
  } catch (err) {
    await trafficDetailModel.updateStatus(job.id, 'failed', { errorMessage: err.message });
    log(`job ${job.id} failed: ${err.message}`);
    await campaignCompletionService.checkAndComplete(job.traffic_summary_id);
    return;
  }

  if (result.success) {
    await trafficDetailModel.updateStatus(job.id, 'completed', {
      ip: result.proxyHost || null,
      completedAt: new Date(),
      actualDwellSeconds: result.actualDwellSeconds ?? null,
    });
    log(`job ${job.id} completed`);
  } else {
    await trafficDetailModel.updateStatus(job.id, 'failed', { errorMessage: result.error || 'unknown' });
    log(`job ${job.id} failed: ${result.error || 'unknown'}`);
  }

  await campaignCompletionService.checkAndComplete(job.traffic_summary_id);
}

async function processBatch() {
  const jobs = await trafficDetailModel.claimPendingDue(BATCH_SIZE);

  if (jobs.length === 0) {
    const now = Date.now();
    if (now - lastIdleDiagnosticAt >= IDLE_DIAGNOSTIC_INTERVAL_MS) {
      lastIdleDiagnosticAt = now;
      try {
        const stats = await trafficDetailModel.pendingDueStats();
        log(
          `claimed 0 jobs (queue snapshot: pending_due=${stats.pending_due}, ` +
          `running=${stats.running}, pending_future=${stats.pending_future})`
        );
      } catch (err) {
        log(`claimed 0 jobs (queue snapshot failed: ${err.message})`);
      }
    }
    return;
  }

  log(`claimed ${jobs.length} jobs`);
  await Promise.all(jobs.map(job => processJob(job)));
}

module.exports = { processBatch, MAX_CONCURRENT_JOBS, BATCH_SIZE };
