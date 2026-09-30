import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
});

// Attach JWT token automatically to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('dsvp_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Session-invalidation codes the backend returns when a previously valid
// JWT is no longer usable (account blocked/deactivated, or TokenVersion
// bumped by an admin action) — see authMiddleware.verifyToken.
const SESSION_INVALIDATION_CODES = new Set(['ACCOUNT_BLOCKED', 'ACCOUNT_DEACTIVATED', 'SESSION_INVALIDATED', 'INVALID_TOKEN']);
const SESSION_MESSAGE_BY_CODE = {
  ACCOUNT_BLOCKED: 'Your account has been blocked by the administrator.',
  ACCOUNT_DEACTIVATED: 'Your account has been deactivated by the administrator.',
  SESSION_INVALIDATED: 'Your session has ended because your account changed. Please log in again.',
  INVALID_TOKEN: 'Your session is no longer valid. Please log in again.',
};

// Global 401 handler: a request only reaches here with a token attached
// (see request interceptor above) if the user believed they were logged
// in, so any 401 here means that belief is now false — force them back to
// a clean logged-out state rather than leaving them stuck on a protected
// page making requests that will keep failing.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && localStorage.getItem('dsvp_token')) {
      const code = error.response.data?.code;
      const message = SESSION_MESSAGE_BY_CODE[code] || error.response.data?.message || 'Your session has ended. Please log in again.';
      localStorage.removeItem('dsvp_token');
      try { sessionStorage.setItem('dsvp_auth_message', message); } catch { /* ignore */ }
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// -------- Auth --------
export const registerUser = (data) => api.post('/auth/register', data);
export const loginUser = (data) => api.post('/auth/login', data);
export const getMe = () => api.get('/auth/me');

// -------- Signup OTP --------
export const signupSendOtp   = (email)                          => api.post('/auth/signup/send-otp',   { email });
export const signupVerifyOtp = (fullName, email, password, otp) => api.post('/auth/signup/verify-otp', { fullName, email, password, otp });

// -------- Forgot Password --------
export const forgotSendOtp    = (email)                    => api.post('/auth/forgot-password/send-otp',   { email });
export const forgotVerifyOtp  = (email, otp)               => api.post('/auth/forgot-password/verify-otp', { email, otp });
export const forgotResetPass  = (resetToken, newPassword)  => api.post('/auth/forgot-password/reset',      { resetToken, newPassword });

// -------- Modules --------
export const getModules = (filter = 'all') => api.get(`/modules?filter=${filter}`);
export const getModuleBySlug = (slug) => api.get(`/modules/${slug}`);

// -------- Execution --------
export const runCode = (payload, config = {}) => api.post('/execution/run', payload, config);

// -------- Payments --------
export const createPaymentOrder = (payload) => api.post('/payments/create-order', payload);
export const verifyPayment = (payload) => api.post('/payments/verify', payload);
export const getMyPayments = (p = {}) => api.get('/payments/my-payments', { params: p });

// -------- Coins --------
export const getCoinWallet       = ()             => api.get('/coins/wallet');
export const getCoinTransactions = (p = {})       => api.get('/coins/transactions', { params: p });
export const getCoinDiscountQuote = (coins, amount) => api.get('/coins/quote', { params: { coins, amount } });
export const redeemModuleUnlock  = (moduleId)     => api.post('/coins/redeem/module-unlock', { moduleId });

// -------- User Feedback --------
export const submitFeedback = (payload) => api.post('/users/feedback', payload);
export const getMyFeedback = () => api.get('/users/feedback');
export const getMyFeedbackUnseenCount = () => api.get('/users/feedback/unseen-count');
export const markFeedbackSeen = (id) => api.patch(`/users/feedback/${id}/seen`);

// -------- Profile --------
export const updateProfile  = (payload) => api.patch('/users/profile', payload);
export const changePassword = (payload) => api.patch('/users/password', payload);

// -------- Code History --------
export const saveCodeHistory = (payload) => api.post('/users/code-history/save', payload);
export const getCodeHistory = (params = {}) => api.get('/users/code-history', { params });
export const getActivityDays = () => api.get('/users/activity-days');
export const loadCodeHistory = (id) => api.get(`/users/code-history/${id}`);
export const deleteCodeHistory = (id) => api.delete(`/users/code-history/${id}`);
export const renameCodeHistory = (id, title) => api.patch(`/users/code-history/${id}`, { title });

// -------- Admin — Overview --------
export const getAdminDashboard  = ()            => api.get('/admin/dashboard');
export const getAdminAnalytics  = (days = 7)    => api.get(`/admin/analytics?days=${days}`);

// -------- Admin — Users --------
export const getAdminUsers      = (p = {})      => api.get('/admin/users',    { params: p });
export const getAdminUserSummary = ()           => api.get('/admin/users/summary');
export const updateUserRole     = (id, role)    => api.patch(`/admin/users/${id}/role`,    { role });
export const updateUserPremium  = (id, v)       => api.patch(`/admin/users/${id}/premium`, { isPremium: v });
export const updateUserSubscription = (id, plan, moduleAccess) =>
  api.patch(`/admin/users/${id}/subscription`, { plan, moduleAccess });
export const updateUserStatus   = (id, status)  => api.patch(`/admin/users/${id}/status`, { status });
export const resetUserPassword  = (id)          => api.post(`/admin/users/${id}/reset-password`);
export const getAdminUserDetail = (id)          => api.get(`/admin/users/${id}/detail`);
export const deleteAdminUser    = (id)          => api.delete(`/admin/users/${id}`);

// -------- Admin — Modules --------
export const getAdminModules    = (p = {})      => api.get('/admin/modules', { params: p });
export const getAdminModuleSummary = ()         => api.get('/admin/modules/summary');
export const createAdminModule  = (data)        => api.post('/admin/modules',      data);
export const updateAdminModule  = (id, data)    => api.put(`/admin/modules/${id}`, data);
export const deleteAdminModule  = (id)          => api.delete(`/admin/modules/${id}`);

// -------- Admin — Payments --------
export const getAdminPayments   = (p = {})      => api.get('/admin/payments',  { params: p });
export const getAdminPaymentDetail = (id)       => api.get(`/admin/payments/${id}`);
export const refundPayment      = (id, data = {}) => api.post(`/admin/payments/${id}/refund`, data);

// -------- Admin — Feedback --------
export const getAdminFeedback   = (p = {})      => api.get('/admin/feedback',  { params: p });
export const deleteAdminFeedback = (id)         => api.delete(`/admin/feedback/${id}`);

// -------- Admin — Activity --------
export const getAdminActivity   = (p = {})      => api.get('/admin/activity',  { params: p });
export const updateFeedbackStatus = (id, status)=> api.patch(`/admin/feedback/${id}/status`, { status });
export const replyToFeedback    = (id, reply)   => api.patch(`/admin/feedback/${id}/reply`, { reply });

// -------- Admin — Audit Logs --------
export const getAdminAuditLogs  = (p = {})      => api.get('/admin/audit-logs', { params: p });

// -------- Admin — Submissions --------
export const getAdminSubmissions = (p = {})     => api.get('/admin/submissions', { params: p });

// -------- Reports (user) --------
export const getMyReportSummary   = ()        => api.get('/reports/summary');
export const getMyReportData      = (params)  => api.get('/reports/data', { params });
export const exportMyReport       = (params)  => api.get('/reports/export', { params, responseType: 'blob' });
export const getMyReportHistory   = ()        => api.get('/reports/history');

// -------- Reports (admin) --------
export const getAdminReportSummary = ()       => api.get('/admin/reports/summary');
export const getAdminReportData    = (params) => api.get('/admin/reports/data', { params });
export const exportAdminReport     = (params) => api.get('/admin/reports/export', { params, responseType: 'blob' });
export const getAdminReportHistory = ()       => api.get('/admin/reports/history');

export default api;
