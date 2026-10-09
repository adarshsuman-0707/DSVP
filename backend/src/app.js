const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const moduleRoutes = require('./routes/moduleRoutes');
const executionRoutes = require('./routes/executionRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const adminRoutes = require('./routes/adminRoutes');
const userRoutes = require('./routes/userRoutes');
const coinRoutes = require('./routes/coinRoutes');
const reportRoutes = require('./routes/reportRoutes');
const adminReportRoutes = require('./routes/adminReportRoutes');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

const app = express();

// CLIENT_URL may hold several comma-separated origins. In non-production,
// any localhost / 127.0.0.1 port is also allowed (Vite hops ports when 5173 is busy).
const allowedOrigins = (process.env.CLIENT_URL || '').split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);
const isLocalOrigin = o => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);                       // curl / server-to-server
    if (allowedOrigins.length === 0) return cb(null, true);   // nothing configured → open
    if (allowedOrigins.includes(origin)) return cb(null, true);
    if (process.env.NODE_ENV !== 'production' && isLocalOrigin(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  exposedHeaders: ['Content-Disposition'],   // report downloads read the filename from it
}));
// Helmet's default same-origin CORP would block cross-origin reads of API responses/downloads.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// Razorpay webhook signature is computed over the exact raw request bytes,
// so this one path must get the raw Buffer instead of the parsed JSON body.
// Mounted before express.json(), and express.json() is skipped for this
// path so it doesn't try to re-read the already-consumed body stream.
app.use('/api/payments/webhook', express.raw({ type: 'application/json', limit: '2mb' }));
app.use((req, res, next) => {
  if (req.path === '/api/payments/webhook') return next();
  express.json({ limit: '2mb' })(req, res, next);
});
app.use(morgan('dev'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'DSVP API' }));

app.use('/api/auth', authRoutes);
app.use('/api/modules', moduleRoutes);
app.use('/api/execution', executionRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/users', userRoutes);
app.use('/api/coins', coinRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/admin/reports', adminReportRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
