const trafficDetailModel = require('../models/trafficDetailModel');
const campaignModel = require('../models/campaignModel');

async function checkAndComplete(summaryId) {
  const counts = await trafficDetailModel.countByStatus(summaryId);
  if (counts.pending > 0 || counts.running > 0) return false;

  const completed = await campaignModel.markCompleted(summaryId);
  if (completed) {
    console.log(`[completion] Campaign ${summaryId} marked completed`);
  }
  return completed;
}

async function getProgress(summaryId) {
  const counts = await trafficDetailModel.countByStatus(summaryId);
  const total = counts.pending + counts.running + counts.completed + counts.failed;
  const finished = counts.completed + counts.failed;
  const percentComplete = total === 0 ? 0 : Math.round((finished / total) * 1000) / 10;
  const avg = await trafficDetailModel.avgDwellSeconds(summaryId);
  return {
    total,
    pending: counts.pending,
    running: counts.running,
    completed: counts.completed,
    failed: counts.failed,
    percentComplete,
    avgDwellSeconds: avg === null ? null : Math.round(avg),
  };
}

module.exports = { checkAndComplete, getProgress };
