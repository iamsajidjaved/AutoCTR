const trafficDetailModel = require('../models/trafficDetailModel');
const puppeteerService = require('./puppeteerService');
const campaignCompletionService = require('./campaignCompletionService');

const BATCH_SIZE = 5;
const MAX_CONCURRENT_JOBS = 3;

function log(msg) {
  console.log(`[worker-${process.pid}] ${msg}`);
}

async function processJob(job) {
  log(`job ${job.id} starting (type=${job.type}, device=${job.device})`);

  await trafficDetailModel.updateStatus(job.id, 'running', {
    startedAt: new Date(),
  });

  let result;
  try {
    result = await puppeteerService.executeJob(job);
  } catch (err) {
    await trafficDetailModel.updateStatus(job.id, 'failed', { errorMessage: err.message });
    log(`job ${job.id} failed: ${err.message}`);
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
  const jobs = await trafficDetailModel.findPendingDue(BATCH_SIZE);
  log(`fetched ${jobs.length} jobs`);

  const slots = jobs.slice(0, MAX_CONCURRENT_JOBS);
  await Promise.all(slots.map(job => processJob(job)));
}

module.exports = { processBatch };
