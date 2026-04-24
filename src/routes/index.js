const { Router } = require('express');
const authRouter = require('./auth');
const campaignsRouter = require('./campaigns');

const router = Router();

router.use('/auth', authRouter);
router.use('/campaigns', campaignsRouter);

module.exports = router;
