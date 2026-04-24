const analyticsService = require('../services/analyticsService');

async function overview(req, res, next) {
  try {
    const data = await analyticsService.getOverview(req.user.id);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = { overview };
