const express = require('express');
const router  = express.Router();
const {
  getDashboard,
  getUsers, getUserStatusSummary, updateUserRole, updateUserPremium, updateUserSubscription,
  updateUserStatus, resetUserPassword, getUserDetail, deleteUser,
  getModules, getModuleAccessSummary, createModule, updateModule, deleteModule,
  getPayments, getPaymentDetail, refundPayment,
  getFeedback, updateFeedbackStatus, replyToFeedback, deleteFeedback,
  getAnalytics,
  getActivity,
  getAuditLogs,
  getSubmissions,
} = require('../controllers/adminController');
const { verifyToken, requireAdmin } = require('../middleware/authMiddleware');

// All admin routes require auth + admin role
router.use(verifyToken, requireAdmin);

// Overview
router.get('/dashboard', getDashboard);

// Users
router.get   ('/users',                   getUsers);
router.get   ('/users/summary',           getUserStatusSummary);
router.get   ('/users/:id/detail',        getUserDetail);
router.patch ('/users/:id/role',          updateUserRole);
router.patch ('/users/:id/premium',       updateUserPremium);
router.patch ('/users/:id/subscription',  updateUserSubscription);
router.patch ('/users/:id/status',        updateUserStatus);
router.post  ('/users/:id/reset-password', resetUserPassword);
router.delete('/users/:id',               deleteUser);

// Modules
router.get   ('/modules',              getModules);
router.get   ('/modules/summary',      getModuleAccessSummary);
router.post  ('/modules',              createModule);
router.put   ('/modules/:id',          updateModule);
router.delete('/modules/:id',          deleteModule);

// Payments
router.get   ('/payments',             getPayments);
router.get   ('/payments/:id',         getPaymentDetail);
router.post  ('/payments/:id/refund',  refundPayment);

// Feedback
router.get   ('/feedback',             getFeedback);
router.patch ('/feedback/:id/status',  updateFeedbackStatus);
router.patch ('/feedback/:id/reply',   replyToFeedback);
router.delete('/feedback/:id',         deleteFeedback);

// Analytics
router.get   ('/analytics',            getAnalytics);

// User Activity
router.get   ('/activity',             getActivity);

// Admin Audit Logs (separate from user Activity)
router.get   ('/audit-logs',           getAuditLogs);

// Submissions (code execution attempts)
router.get   ('/submissions',          getSubmissions);

module.exports = router;
