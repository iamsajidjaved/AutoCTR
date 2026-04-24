const { Router } = require('express');
const authenticate = require('../middlewares/authenticate');
const campaignController = require('../controllers/campaignController');

const router = Router();

router.use(authenticate);

router.post('/', campaignController.create);
router.get('/', campaignController.list);
router.get('/:id', campaignController.getOne);
router.get('/:id/progress', campaignController.progress);
router.delete('/:id', campaignController.remove);
router.post('/:id/activate', campaignController.activate);

module.exports = router;
