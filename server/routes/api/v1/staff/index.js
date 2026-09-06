const express = require('express');
const router = express.Router();

router.use('/session', require('./session'));
router.use('/me', require('./me'));
router.use('/account', require('./account'));
router.use('/dashboard', require('./dashboard'));
router.use('/cases', require('./cases'));
router.use('/clients', require('./clients'));
router.use('/tasks', require('./tasks'));

module.exports = router;
