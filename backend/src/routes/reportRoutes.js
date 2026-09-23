const express = require('express');
const router = express.Router();
const {
  getMySummary,
  getMyReportData,
  exportMyReport,
  getMyReportHistory,
} = require('../controllers/reportController');
const { verifyToken } = require('../middleware/authMiddleware');

// Mounted at /api/reports — the logged-in user's own reports only.
router.use(verifyToken);

router.get('/summary', getMySummary);
router.get('/data', getMyReportData);
router.get('/export', exportMyReport);
router.get('/history', getMyReportHistory);

module.exports = router;
