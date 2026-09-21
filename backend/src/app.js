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
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || '*', credentials: true }));

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

app.use(notFound);
app.use(errorHandler);

module.exports = app;
