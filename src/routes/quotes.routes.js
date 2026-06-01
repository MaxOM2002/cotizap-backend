const router = require('express').Router();
const ctrl = require('../controllers/quotes.controller');
const auth = require('../middleware/auth');

router.get('/',            auth, ctrl.list);
router.post('/',           auth, ctrl.create);
router.get('/:id/pdf',     auth, ctrl.generatePDF);
router.delete('/:id',      auth, ctrl.remove);

module.exports = router;
