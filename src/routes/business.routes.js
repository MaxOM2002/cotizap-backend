const router = require('express').Router();
const ctrl = require('../controllers/business.controller');
const auth = require('../middleware/auth');

router.get('/',  auth, ctrl.get);
router.put('/',  auth, ctrl.update);

module.exports = router;
