const { Router } = require('express');
const authenticate = require('../middlewares/authenticate');
const campaignController = require('../controllers/campaignController');

const router = Router();

router.use(authenticate);

router.post('/', campaignController.create);
router.get('/', campaignController.list);
router.get('/:id', campaignController.getOne);
router.get('/:id/progress', campaignController.progress);
router.get('/:id/visits', campaignController.visits);
router.delete('/:id', campaignController.remove);
router.post('/:id/activate', campaignController.activate);
router.post('/:id/pause', campaignController.pause);
router.post('/:id/restart', campaignController.restart);

module.exports = router;
