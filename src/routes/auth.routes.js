const router = require('express').Router();
const ctrl = require('../controllers/auth.controller');
const auth = require('../middleware/auth');

router.post('/register', ctrl.register);
router.post('/login',    ctrl.login);
router.get('/me',        auth, ctrl.me);
router.put('/password',  auth, ctrl.updatePassword);

module.exports = router;
