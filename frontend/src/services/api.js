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

// -------- Auth --------
export const registerUser = (data) => api.post('/auth/register', data);
export const loginUser = (data) => api.post('/auth/login', data);
export const getMe = () => api.get('/auth/me');

// -------- Modules --------
export const getModules = (filter = 'all') => api.get(`/modules?filter=${filter}`);
export const getModuleBySlug = (slug) => api.get(`/modules/${slug}`);

// -------- Execution --------
export const runCode = (payload) => api.post('/execution/run', payload);

// -------- Payments --------
export const createPaymentOrder = (payload) => api.post('/payments/create-order', payload);
export const verifyPayment = (payload) => api.post('/payments/verify', payload);

// -------- User Feedback --------
export const submitFeedback = (payload) => api.post('/users/feedback', payload);

// -------- Profile --------
export const updateProfile  = (payload) => api.patch('/users/profile', payload);
export const changePassword = (payload) => api.patch('/users/password', payload);

// -------- Code History --------
export const saveCodeHistory = (payload) => api.post('/users/code-history/save', payload);
export const getCodeHistory = (params = {}) => api.get('/users/code-history', { params });
export const loadCodeHistory = (id) => api.get(`/users/code-history/${id}`);
export const deleteCodeHistory = (id) => api.delete(`/users/code-history/${id}`);

// -------- Admin — Overview --------
export const getAdminDashboard  = ()            => api.get('/admin/dashboard');
export const getAdminAnalytics  = (days = 7)    => api.get(`/admin/analytics?days=${days}`);

// -------- Admin — Users --------
export const getAdminUsers      = (p = {})      => api.get('/admin/users',    { params: p });
export const updateUserRole     = (id, role)    => api.patch(`/admin/users/${id}/role`,    { role });
export const updateUserPremium  = (id, v)       => api.patch(`/admin/users/${id}/premium`, { isPremium: v });
export const updateUserSubscription = (id, plan, moduleAccess) => 
  api.patch(`/admin/users/${id}/subscription`, { plan, moduleAccess });
export const deleteAdminUser    = (id)          => api.delete(`/admin/users/${id}`);

// -------- Admin — Modules --------
export const getAdminModules    = ()            => api.get('/admin/modules');
export const createAdminModule  = (data)        => api.post('/admin/modules',      data);
export const updateAdminModule  = (id, data)    => api.put(`/admin/modules/${id}`, data);
export const deleteAdminModule  = (id)          => api.delete(`/admin/modules/${id}`);

// -------- Admin — Payments --------
export const getAdminPayments   = (p = {})      => api.get('/admin/payments',  { params: p });

// -------- Admin — Feedback --------
export const getAdminFeedback   = (p = {})      => api.get('/admin/feedback',  { params: p });
export const updateFeedbackStatus = (id, status)=> api.patch(`/admin/feedback/${id}/status`, { status });

export default api;
