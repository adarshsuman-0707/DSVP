const express = require('express');
const router = express.Router();
const {
  getAdminSummary,
  getAdminReportData,
  exportAdminReport,
  getAdminReportHistory,
} = require('../controllers/reportController');
const { verifyToken, requireAdmin } = require('../middleware/authMiddleware');

// Mounted at /api/admin/reports — organization-wide reports.
router.use(verifyToken, requireAdmin);

router.get('/summary', getAdminSummary);
router.get('/data', getAdminReportData);
router.get('/export', exportAdminReport);
router.get('/history', getAdminReportHistory);

module.exports = router;
