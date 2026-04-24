const campaignModel = require('../models/campaignModel');
const trafficDetailModel = require('../models/trafficDetailModel');
const trafficDistributionService = require('./trafficDistributionService');
const { pool } = require('../models/db');

function validationError(field, message) {
  const err = new Error(message);
  err.status = 400;
  err.field = field;
  return err;
}

function validate(body) {
  const {
    website,
    keyword,
    ctr,
    mobile_desktop_ratio,
    min_dwell_seconds = 30,
    max_dwell_seconds = 120,
    campaign_duration_days = 1,
    initial_daily_visits,
    daily_increase_pct = 0,
  } = body;

  try { new URL(website); } catch {
    throw validationError('website', 'Invalid URL');
  }

  if (!keyword || typeof keyword !== 'string' || keyword.trim().length === 0) {
    throw validationError('keyword', 'Keyword is required');
  }
  if (keyword.length > 200) {
    throw validationError('keyword', 'Keyword must be 200 characters or fewer');
  }

  if (!Number.isInteger(ctr) || ctr < 1 || ctr > 100) {
    throw validationError('ctr', 'ctr must be an integer between 1 and 100');
  }

  if (!Number.isInteger(mobile_desktop_ratio) || mobile_desktop_ratio < 0 || mobile_desktop_ratio > 100) {
    throw validationError('mobile_desktop_ratio', 'mobile_desktop_ratio must be an integer between 0 and 100');
  }

  if (!Number.isInteger(min_dwell_seconds) || min_dwell_seconds < 10 || min_dwell_seconds > 1800) {
    throw validationError('min_dwell_seconds', 'min_dwell_seconds must be an integer between 10 and 1800');
  }

  if (!Number.isInteger(max_dwell_seconds) || max_dwell_seconds < min_dwell_seconds || max_dwell_seconds > 1800) {
    throw validationError('max_dwell_seconds', 'max_dwell_seconds must be an integer >= min_dwell_seconds and <= 1800');
  }

  if (!Number.isInteger(campaign_duration_days) || campaign_duration_days < 1 || campaign_duration_days > 365) {
    throw validationError('campaign_duration_days', 'campaign_duration_days must be an integer between 1 and 365');
  }

  if (!Number.isInteger(initial_daily_visits) || initial_daily_visits < 1 || initial_daily_visits > 10000) {
    throw validationError('initial_daily_visits', 'initial_daily_visits must be an integer between 1 and 10000');
  }

  const pct = Number(daily_increase_pct);
  if (isNaN(pct) || pct < 0 || pct > 100) {
    throw validationError('daily_increase_pct', 'daily_increase_pct must be a number between 0 and 100');
  }

  // Compute total visits across all days (compound growth)
  let required_visits = 0;
  for (let day = 0; day < campaign_duration_days; day++) {
    required_visits += Math.round(initial_daily_visits * Math.pow(1 + pct / 100, day));
  }

  if (required_visits > 1000000) {
    throw validationError('daily_increase_pct', `Computed total visits (${required_visits.toLocaleString()}) exceeds the 1,000,000 limit. Reduce duration or increase rate.`);
  }

  return {
    website,
    keyword: keyword.trim(),
    ctr,
    mobile_desktop_ratio,
    min_dwell_seconds,
    max_dwell_seconds,
    campaign_duration_days,
    initial_daily_visits,
    daily_increase_pct: pct,
    required_visits,
  };
}

async function createCampaign(userId, body) {
  const fields = validate(body);
  return await campaignModel.create({
    userId,
    website: fields.website,
    keyword: fields.keyword,
    requiredVisits: fields.required_visits,
    ctr: fields.ctr,
    mobileDesktopRatio: fields.mobile_desktop_ratio,
    minDwellSeconds: fields.min_dwell_seconds,
    maxDwellSeconds: fields.max_dwell_seconds,
    campaignDurationDays: fields.campaign_duration_days,
    initialDailyVisits: fields.initial_daily_visits,
    dailyIncreasePct: fields.daily_increase_pct,
  });
}

async function listCampaigns(userId) {
  return await campaignModel.findAllByUser(userId);
}

async function getCampaign(id, userId) {
  const campaign = await campaignModel.findByIdAndUser(id, userId);
  if (!campaign) {
    const err = new Error('Campaign not found');
    err.status = 404;
    throw err;
  }
  return campaign;
}

async function deleteCampaign(id, userId) {
  const campaign = await campaignModel.findByIdAndUser(id, userId);
  if (!campaign) {
    const err = new Error('Campaign not found');
    err.status = 404;
    throw err;
  }
  if (campaign.status === 'running') {
    const err = new Error('Cannot delete a running campaign — pause it first');
    err.status = 409;
    throw err;
  }
  await campaignModel.deleteById(id);
}

async function activateCampaign(id, userId) {
  const campaign = await campaignModel.findByIdAndUser(id, userId);
  if (!campaign) {
    const err = new Error('Campaign not found');
    err.status = 404;
    throw err;
  }
  if (campaign.status !== 'pending') {
    const err = new Error('Campaign is already active or completed');
    err.status = 409;
    throw err;
  }

  const visits = trafficDistributionService.generateVisits(campaign);
  const detailRows = visits.map(v => ({
    trafficSummaryId: campaign.id,
    scheduledAt: v.scheduledAt,
    type: v.type,
    device: v.device,
  }));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await trafficDetailModel.bulkCreate(detailRows, client);
    await client.query(
      `UPDATE traffic_summaries SET status = 'running', updated_at = NOW() WHERE id = $1`,
      [id]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const updatedCampaign = await campaignModel.findById(id);
  return { campaign: updatedCampaign, visitsScheduled: visits.length };
}

async function pauseCampaign(id, userId) {
  const campaign = await campaignModel.findByIdAndUser(id, userId);
  if (!campaign) {
    const err = new Error('Campaign not found');
    err.status = 404;
    throw err;
  }
  if (campaign.status !== 'running') {
    const err = new Error('Only running campaigns can be paused');
    err.status = 409;
    throw err;
  }
  await campaignModel.pauseAndCancelJobs(id);
  return await campaignModel.findById(id);
}

async function restartCampaign(id, userId) {
  const campaign = await campaignModel.findByIdAndUser(id, userId);
  if (!campaign) {
    const err = new Error('Campaign not found');
    err.status = 404;
    throw err;
  }
  if (!['paused', 'completed'].includes(campaign.status)) {
    const err = new Error('Only paused or completed campaigns can be restarted');
    err.status = 409;
    throw err;
  }

  const visits = trafficDistributionService.generateVisits(campaign);
  const detailRows = visits.map(v => ({
    trafficSummaryId: campaign.id,
    scheduledAt: v.scheduledAt,
    type: v.type,
    device: v.device,
  }));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM traffic_details WHERE traffic_summary_id = $1`, [id]);
    await trafficDetailModel.bulkCreate(detailRows, client);
    await client.query(
      `UPDATE traffic_summaries SET status = 'running', updated_at = NOW() WHERE id = $1`,
      [id]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const updatedCampaign = await campaignModel.findById(id);
  return { campaign: updatedCampaign, visitsScheduled: visits.length };
}

module.exports = { createCampaign, listCampaigns, getCampaign, deleteCampaign, activateCampaign, pauseCampaign, restartCampaign };
