const { Router } = require('express');
const authenticate = require('../middlewares/authenticate');
const analyticsController = require('../controllers/analyticsController');

const router = Router();

router.use(authenticate);

router.get('/overview', analyticsController.overview);

module.exports = router;
