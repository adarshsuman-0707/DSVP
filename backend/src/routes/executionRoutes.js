const express = require('express');
const router = express.Router();
const { runAndTrace } = require('../controllers/executionController');
const { verifyToken } = require('../middleware/authMiddleware');
const { rateLimitExecution } = require('../middleware/rateLimitMiddleware');

router.post('/run', verifyToken, rateLimitExecution, runAndTrace);

module.exports = router;
