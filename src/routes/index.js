const { Router } = require('express');
const authRouter = require('./auth');
const campaignsRouter = require('./campaigns');
const analyticsRouter = require('./analytics');

const router = Router();

router.use('/auth', authRouter);
router.use('/campaigns', campaignsRouter);
router.use('/analytics', analyticsRouter);

module.exports = router;
