const express = require('express');
const router  = express.Router();
const {
  getDashboard,
  getUsers, updateUserRole, updateUserPremium, updateUserSubscription, deleteUser,
  getModules, createModule, updateModule, deleteModule,
  getPayments,
  getFeedback, updateFeedbackStatus, replyToFeedback,
  getAnalytics, getActivity,
} = require('../controllers/adminController');
const { verifyToken, requireAdmin } = require('../middleware/authMiddleware');

// All admin routes require auth + admin role
router.use(verifyToken, requireAdmin);

// Overview
router.get('/dashboard', getDashboard);

// Users
router.get   ('/users',                   getUsers);
router.patch ('/users/:id/role',          updateUserRole);
router.patch ('/users/:id/premium',       updateUserPremium);
router.patch ('/users/:id/subscription',  updateUserSubscription);
router.delete('/users/:id',               deleteUser);

// Modules
router.get   ('/modules',              getModules);
router.post  ('/modules',              createModule);
router.put   ('/modules/:id',          updateModule);
router.delete('/modules/:id',          deleteModule);

// Payments
router.get   ('/payments',             getPayments);

// Feedback
router.get   ('/feedback',             getFeedback);
router.patch ('/feedback/:id/status',  updateFeedbackStatus);
router.patch ('/feedback/:id/reply',   replyToFeedback);

// Analytics
router.get   ('/analytics',            getAnalytics);

// User Activity
router.get   ('/activity',             getActivity);

module.exports = router;
