const express = require('express');
const router = express.Router();
const { listModules, getModule } = require('../controllers/moduleController');
const { verifyToken } = require('../middleware/authMiddleware');

router.get('/', listModules);
router.get('/:slug', verifyToken, getModule);

module.exports = router;
