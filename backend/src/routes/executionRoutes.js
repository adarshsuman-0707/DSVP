const express = require('express');
const router = express.Router();
const { runAndTrace } = require('../controllers/executionController');
const { verifyToken } = require('../middleware/authMiddleware');

router.post('/run', verifyToken, runAndTrace);

module.exports = router;
