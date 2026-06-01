const router = require('express').Router();
const ctrl = require('../controllers/whatsapp.controller');
const auth = require('../middleware/auth');

router.post('/connect',      auth, ctrl.connect);
router.get('/status',        auth, ctrl.status);
router.post('/disconnect',   auth, ctrl.disconnect);
router.post('/send',         auth, ctrl.send);
router.get('/messages',      auth, ctrl.getMessages);

module.exports = router;
