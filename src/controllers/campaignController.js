const campaignService = require('../services/campaignService');
const campaignCompletionService = require('../services/campaignCompletionService');

async function create(req, res, next) {
  try {
    const campaign = await campaignService.createCampaign(req.user.id, req.body);
    res.status(201).json(campaign);
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message, field: err.field });
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const campaigns = await campaignService.listCampaigns(req.user.id);
    res.json(campaigns);
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const campaign = await campaignService.getCampaign(req.params.id, req.user.id);
    res.json(campaign);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await campaignService.deleteCampaign(req.params.id, req.user.id);
    res.json({ message: 'Campaign deleted' });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

async function activate(req, res, next) {
  try {
    const result = await campaignService.activateCampaign(req.params.id, req.user.id);
    res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

async function progress(req, res, next) {
  try {
    const campaign = await campaignService.getCampaign(req.params.id, req.user.id);
    const progressData = await campaignCompletionService.getProgress(campaign.id);
    res.json({ campaign, progress: progressData });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

module.exports = { create, list, getOne, remove, activate, progress };
