const crypto = require('crypto');
const { sql, getPool } = require('../config/db');
const UserModel        = require('../models/userModel');
const PaymentModel     = require('../models/paymentModel');
const CoinModel        = require('../models/coinModel');
const FeedbackModel    = require('../models/feedbackModel');
const AuditLogModel    = require('../models/auditLogModel');
const jwt = require('jsonwebtoken');
const { sendAdminPasswordResetEmail, sendAccountStatusEmail } = require('../services/emailService');
const { buildEnvelope, parsePaging } = require('../utils/paginate');

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || req.ip || req.socket?.remoteAddress || '').toString().split(',')[0].trim();
}

async function logAudit(req, { action, targetType, targetId, description }) {
  try {
    await AuditLogModel.insert({
      adminId: req.user.userId,
      action, targetType, targetId, description,
      ip: clientIp(req),
    });
  } catch (err) {
    console.error('Failed to write audit log:', err.message);
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   OVERVIEW DASHBOARD
   GET /api/admin/dashboard
   ═══════════════════════════════════════════════════════════════════════ */
async function getDashboard(req, res, next) {
  try {
    const pool = await getPool();

    const [totalUsers, activeUsers, premiumUsers, totalRevenue, recentSignups,
           modulePopularity, recentTraces, openFeedback, todayActivity,
           successPayments, pendingPayments] = await Promise.all([

      pool.request().query('SELECT COUNT(*) AS count FROM dbo.Users'),
      pool.request().query(`SELECT COUNT(*) AS count FROM dbo.Users WHERE Status='active'`),
      pool.request().query('SELECT COUNT(*) AS count FROM dbo.Users WHERE IsPremium=1'),
      pool.request().query(`SELECT ISNULL(SUM(Amount),0) AS total FROM dbo.Payments WHERE Status='success'`),

      pool.request().query(`
        SELECT TOP 10 UserId, FullName, Email, Role, IsPremium, CreatedAt
        FROM dbo.Users ORDER BY CreatedAt DESC
      `),

      pool.request().query(`
        SELECT m.Name, COUNT(et.TraceId) AS Attempts
        FROM dbo.Modules m
        LEFT JOIN dbo.ExecutionTraces et ON et.ModuleId = m.ModuleId
        GROUP BY m.ModuleId, m.Name
        ORDER BY Attempts DESC
      `),

      pool.request().query(`
        SELECT TOP 5 et.TraceId, et.Language, et.Status, et.CreatedAt,
                     u.FullName, u.Email
        FROM dbo.ExecutionTraces et
        JOIN dbo.Users u ON u.UserId = et.UserId
        ORDER BY et.CreatedAt DESC
      `),

      pool.request().query(`SELECT COUNT(*) AS count FROM dbo.Feedback WHERE Status='open'`),

      pool.request().query(`
        SELECT COUNT(*) AS count FROM dbo.AnalyticsEvents
        WHERE CAST(CreatedAt AS DATE) = CAST(SYSUTCDATETIME() AS DATE)
      `),

      pool.request().query(`SELECT COUNT(*) AS count FROM dbo.Payments WHERE Status='success'`),
      pool.request().query(`SELECT COUNT(*) AS count FROM dbo.Payments WHERE Status IN ('pending','created')`),
    ]);

    const tu  = totalUsers.recordset[0].count;
    const pu  = premiumUsers.recordset[0].count;

    const signupTrend = await pool.request().query(`
      SELECT CAST(CreatedAt AS DATE) AS day, COUNT(*) AS count
      FROM dbo.Users
      WHERE CreatedAt >= DATEADD(day,-7,SYSUTCDATETIME())
      GROUP BY CAST(CreatedAt AS DATE)
      ORDER BY day
    `);

    const revenueTrend = await pool.request().query(`
      SELECT CAST(CreatedAt AS DATE) AS day, ISNULL(SUM(Amount),0) AS revenue
      FROM dbo.Payments
      WHERE Status='success' AND CreatedAt >= DATEADD(day,-7,SYSUTCDATETIME())
      GROUP BY CAST(CreatedAt AS DATE)
      ORDER BY day
    `);

    res.json({
      kpis: {
        totalUsers:       tu,
        activeUsers:      activeUsers.recordset[0].count,
        newUsersToday:    signupTrend.recordset.length ? (signupTrend.recordset[signupTrend.recordset.length - 1].count || 0) : 0,
        premiumUsers:     pu,
        totalRevenue:     totalRevenue.recordset[0].total,
        totalPayments:    successPayments.recordset[0].count + pendingPayments.recordset[0].count,
        successfulPayments: successPayments.recordset[0].count,
        pendingPayments:  pendingPayments.recordset[0].count,
        conversionRate:   tu ? +((pu / tu) * 100).toFixed(2) : 0,
        openFeedback:     openFeedback.recordset[0].count,
        todayActivity:    todayActivity.recordset[0].count,
      },
      recentSignups:    recentSignups.recordset,
      modulePopularity: modulePopularity.recordset,
      recentTraces:     recentTraces.recordset,
      signupTrend:      signupTrend.recordset,
      revenueTrend:     revenueTrend.recordset,
    });
  } catch (err) { next(err); }
}

/* ═══════════════════════════════════════════════════════════════════════
   USERS
   ═══════════════════════════════════════════════════════════════════════ */

// GET /api/admin/users?page=1&pageSize=20&search=&role=&status=&plan=
async function getUsers(req, res, next) {
  try {
    const { page, pageSize } = parsePaging(req.query);
    const search = (req.query.search || '').trim();
    const role   = ['user', 'admin'].includes(req.query.role) ? req.query.role : null;
    const status = ['active', 'inactive', 'blocked'].includes(req.query.status) ? req.query.status : null;
    const plan   = ['free', 'basic', 'premium'].includes(req.query.plan) ? req.query.plan : null;
    const joinedFrom = req.query.joinedFrom ? new Date(req.query.joinedFrom) : null;
    const joinedTo   = req.query.joinedTo ? new Date(req.query.joinedTo) : null;

    const { rows, total } = await UserModel.listPaged({ page, pageSize, search, role, status, plan, joinedFrom, joinedTo });
    res.json(buildEnvelope(rows, page, pageSize, total));
  } catch (err) { next(err); }
}

// GET /api/admin/users/summary
async function getUserStatusSummary(req, res, next) {
  try {
    const summary = await UserModel.getStatusSummary();
    res.json(summary);
  } catch (err) { next(err); }
}

// PATCH /api/admin/users/:id/role   body: { role: 'admin'|'user' }
async function updateUserRole(req, res, next) {
  try {
    const { id }   = req.params;
    const { role } = req.body;
    if (!['user','admin'].includes(role))
      return res.status(400).json({ message: 'Role must be user or admin' });

    const pool = await getPool();
    await pool.request()
      .input('UserId', sql.Int,        id)
      .input('Role',   sql.VarChar(20), role)
      .query(`UPDATE dbo.Users SET Role=@Role, UpdatedAt=SYSUTCDATETIME() WHERE UserId=@UserId`);

    await logAudit(req, { action: 'USER_UPDATED', targetType: 'user', targetId: +id, description: `Role changed to ${role}` });
    res.json({ message: 'Role updated' });
  } catch (err) { next(err); }
}

/**
 * Coins follow the plan: a paid plan unlocks the wallet, dropping to free
 * locks it again and wipes balance, history and coin-bought module unlocks.
 */
async function syncCoinsWithPlan(userId, plan) {
  if (plan !== 'free') {
    await CoinModel.unlock(userId);
    return;
  }
  const pool = await getPool();
  await pool.request().input('UserId', sql.Int, userId).query(`
    BEGIN TRAN;
      DELETE FROM dbo.CoinModuleUnlocks WHERE UserId = @UserId;
      DELETE FROM dbo.CoinTransactions  WHERE UserId = @UserId;
      UPDATE dbo.Users SET CoinsUnlocked = 0, CoinBalance = 0 WHERE UserId = @UserId;
    COMMIT;
  `);
}

// PATCH /api/admin/users/:id/premium  body: { isPremium: true|false }
async function updateUserPremium(req, res, next) {
  try {
    const { id }        = req.params;
    const { isPremium } = req.body;
    const pool          = await getPool();
    const expiryDate    = isPremium ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null;
    await pool.request()
      .input('UserId',    sql.Int, id)
      .input('IsPremium', sql.Bit, isPremium ? 1 : 0)
      .input('SubscriptionPlan', sql.NVarChar(20), isPremium ? 'premium' : 'free')
      .input('SubscriptionExpiry', sql.DateTime, expiryDate)
      .query(`
        UPDATE dbo.Users
        SET IsPremium = @IsPremium,
            SubscriptionPlan = @SubscriptionPlan,
            SubscriptionExpiry = @SubscriptionExpiry,
            PremiumModulesAccess = NULL,
            UpdatedAt = SYSUTCDATETIME()
        WHERE UserId = @UserId
      `);
    await syncCoinsWithPlan(+id, isPremium ? 'premium' : 'free');

    await logAudit(req, { action: 'USER_UPDATED', targetType: 'user', targetId: +id, description: `Premium set to ${!!isPremium}` });
    res.json({ message: 'Premium status updated' });
  } catch (err) { next(err); }
}

// PATCH /api/admin/users/:id/subscription  body: { plan: 'free'|'basic'|'premium', moduleAccess: [1,2,3] }
async function updateUserSubscription(req, res, next) {
  try {
    const { id } = req.params;
    const { plan, moduleAccess } = req.body;

    if (!['free', 'basic', 'premium'].includes(plan)) {
      return res.status(400).json({ message: 'Invalid plan. Must be free, basic, or premium' });
    }

    const pool = await getPool();
    const expiryDate = (plan !== 'free') ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null;
    const accessJson = moduleAccess ? JSON.stringify(moduleAccess) : null;

    await pool.request()
      .input('UserId', sql.Int, id)
      .input('SubscriptionPlan', sql.NVarChar(20), plan)
      .input('SubscriptionExpiry', sql.DateTime, expiryDate)
      .input('PremiumModulesAccess', sql.NVarChar(sql.MAX), accessJson)
      .input('IsPremium', sql.Bit, plan !== 'free' ? 1 : 0)
      .query(`
        UPDATE dbo.Users
        SET SubscriptionPlan = @SubscriptionPlan,
            SubscriptionExpiry = @SubscriptionExpiry,
            PremiumModulesAccess = @PremiumModulesAccess,
            IsPremium = @IsPremium,
            UpdatedAt = SYSUTCDATETIME()
        WHERE UserId = @UserId
      `);
    await syncCoinsWithPlan(+id, plan);

    await logAudit(req, { action: 'USER_UPDATED', targetType: 'user', targetId: +id, description: `Subscription set to ${plan}` });
    res.json({ message: 'Subscription updated', plan, expiresAt: expiryDate, moduleAccess });
  } catch (err) { next(err); }
}

// PATCH /api/admin/users/:id/status   body: { status: 'active'|'inactive'|'blocked' }
async function updateUserStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['active', 'inactive', 'blocked'].includes(status))
      return res.status(400).json({ message: 'Status must be active, inactive, or blocked' });
    if (parseInt(id) === req.user.userId)
      return res.status(400).json({ message: 'Cannot change your own status' });

    const target = await UserModel.findById(id);
    if (!target) return res.status(404).json({ message: 'User not found' });

    await UserModel.updateStatus(id, status);

    // Blocking/deactivating must kill any session already issued for this
    // user — bumping TokenVersion makes every existing JWT fail the check
    // in authMiddleware on its very next request, regardless of expiry.
    if (status === 'blocked' || status === 'inactive') {
      await UserModel.incrementTokenVersion(id);
    }

    try {
      await sendAccountStatusEmail(status, target.Email, target.FullName);
    } catch (mailErr) {
      console.error('Failed to send account status email:', mailErr.message);
    }

    const actionMap = { active: 'USER_ACTIVATED', inactive: 'USER_DEACTIVATED', blocked: 'USER_BLOCKED' };
    await logAudit(req, { action: actionMap[status], targetType: 'user', targetId: +id, description: `Status set to ${status}` });

    res.json({ message: 'Status updated', status });
  } catch (err) { next(err); }
}

// POST /api/admin/users/:id/reset-password
// Admin-triggered reset: never sets or emails a plaintext password. Instead
// it reuses the same PasswordResetOtp table + short-lived resetToken JWT
// that the self-service "forgot password" flow already relies on
// (authController.resetPassword handles the final step), just skips the
// "type the OTP" step since the admin action is already the authorization.
async function resetUserPassword(req, res, next) {
  try {
    const { id } = req.params;
    const pool = await getPool();
    const userRes = await pool.request().input('UserId', sql.Int, id)
      .query(`SELECT UserId, Email, FullName FROM dbo.Users WHERE UserId=@UserId`);
    const user = userRes.recordset[0];
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Invalidate any previous unused reset tokens for this email
    await pool.request().input('Email', sql.NVarChar(255), user.Email)
      .query(`UPDATE dbo.PasswordResetOtp SET Used = 1 WHERE Email = @Email AND Used = 0`);

    const linkToken = 'R' + crypto.randomBytes(24).toString('hex'); // cryptographically random, single-use
    const expiresMin = 30;
    const expiresAt = new Date(Date.now() + expiresMin * 60 * 1000);

    const insertRes = await pool.request()
      .input('Email', sql.NVarChar(255), user.Email)
      .input('OtpCode', sql.VarChar(64), linkToken)
      .input('ExpiresAt', sql.DateTime2, expiresAt)
      .query(`
        -- OUTPUT ... INTO a table variable: a bare OUTPUT is rejected (Msg 334) when the
        -- target table has any enabled trigger (e.g. activity-log triggers).
        DECLARE @out TABLE (OtpId INT);
        INSERT INTO dbo.PasswordResetOtp (Email, OtpCode, ExpiresAt)
        OUTPUT INSERTED.OtpId INTO @out (OtpId)
        VALUES (@Email, @OtpCode, @ExpiresAt);
        SELECT OtpId FROM @out;
      `);
    const otpId = insertRes.recordset[0].OtpId;

    const resetToken = jwt.sign(
      { email: user.Email, otpId, purpose: 'password_reset' },
      process.env.JWT_SECRET,
      { expiresIn: `${expiresMin}m` }
    );

    // Kill any session already open for this user — a password reset in
    // progress must not leave the old session usable in the meantime.
    await UserModel.incrementTokenVersion(id);

    const resetLink = `${process.env.CLIENT_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}`;
    try {
      await sendAdminPasswordResetEmail(user.Email, user.FullName, resetLink);
    } catch (mailErr) {
      console.error('Failed to send reset password email:', mailErr.message);
    }

    await logAudit(req, { action: 'PASSWORD_RESET', targetType: 'user', targetId: +id, description: 'Admin-triggered password reset link sent' });
    res.json({ message: 'A secure password reset link has been emailed to the user, and their current session has been ended.' });
  } catch (err) { next(err); }
}

// GET /api/admin/users/:id/detail — aggregated data for the User Detail page
async function getUserDetail(req, res, next) {
  try {
    const userId = parseInt(req.params.id, 10);
    const pool = await getPool();

    const [userRes, activityRes, progressRes, modulesRes, submissionsRes, paymentsRes, feedbackRes] = await Promise.all([
      pool.request().input('UserId', sql.Int, userId).query(`
        SELECT UserId, FullName, Email, Role, Status, IsPremium, AvatarUrl,
               CreatedAt, UpdatedAt, LastLoginAt, SubscriptionPlan, SubscriptionExpiry
        FROM dbo.Users WHERE UserId=@UserId
      `),
      (async () => {
        const r = pool.request();
        r.input('Page', sql.Int, 1); r.input('PageSize', sql.Int, 20);
        r.input('Type', sql.VarChar(20), null); r.input('Search', sql.NVarChar(255), null);
        r.input('UserId', sql.Int, userId); r.output('TotalRecords', sql.Int);
        return r.execute('sp_GetActivityPaged');
      })(),
      pool.request().input('UserId', sql.Int, userId).query(`
        SELECT up.ProgressId, up.ModuleId, m.Name AS ModuleName, up.ProblemId, p.Title AS ProblemTitle,
               up.Status, up.CompletionPct, up.LastAccessedAt
        FROM dbo.UserProgress up
        LEFT JOIN dbo.Modules  m ON m.ModuleId  = up.ModuleId
        LEFT JOIN dbo.Problems p ON p.ProblemId = up.ProblemId
        WHERE up.UserId=@UserId ORDER BY up.LastAccessedAt DESC
      `),
      pool.request().input('UserId', sql.Int, userId).query(`
        SELECT DISTINCT m.ModuleId, m.Name, m.Slug, m.Category
        FROM dbo.ExecutionTraces et JOIN dbo.Modules m ON m.ModuleId = et.ModuleId
        WHERE et.UserId=@UserId
      `),
      (async () => {
        const r = pool.request();
        r.input('Page', sql.Int, 1); r.input('PageSize', sql.Int, 20);
        r.input('UserId', sql.Int, userId); r.input('Status', sql.VarChar(20), null);
        r.output('TotalRecords', sql.Int);
        return r.execute('sp_GetSubmissionsPaged');
      })(),
      PaymentModel.listPaged({ page: 1, pageSize: 20, userId }),
      FeedbackModel.listForUser(userId),
    ]);

    if (!userRes.recordset[0]) return res.status(404).json({ message: 'User not found' });

    res.json({
      user:        userRes.recordset[0],
      activity:    activityRes.recordset,
      progress:    progressRes.recordset,
      modules:     modulesRes.recordset,
      submissions: submissionsRes.recordset,
      payments:    paymentsRes.rows,
      feedback:    feedbackRes,
    });
  } catch (err) { next(err); }
}

// DELETE /api/admin/users/:id
async function deleteUser(req, res, next) {
  try {
    const { id } = req.params;
    if (parseInt(id) === req.user.userId)
      return res.status(400).json({ message: 'Cannot delete your own account' });

    const pool = await getPool();
    await pool.request().input('UserId', sql.Int, id)
      .query(`DELETE FROM dbo.AnalyticsEvents WHERE UserId=@UserId`);
    await pool.request().input('UserId', sql.Int, id)
      .query(`DELETE FROM dbo.Feedback WHERE UserId=@UserId`);
    await pool.request().input('UserId', sql.Int, id)
      .query(`DELETE FROM dbo.Payments WHERE UserId=@UserId`);
    await pool.request().input('UserId', sql.Int, id)
      .query(`DELETE FROM dbo.ExecutionTraces WHERE UserId=@UserId`);
    await pool.request().input('UserId', sql.Int, id)
      .query(`DELETE FROM dbo.SavedSnippets WHERE UserId=@UserId`);
    await pool.request().input('UserId', sql.Int, id)
      .query(`DELETE FROM dbo.UserProgress WHERE UserId=@UserId`);
    await pool.request().input('UserId', sql.Int, id)
      .query(`DELETE FROM dbo.Users WHERE UserId=@UserId`);

    await logAudit(req, { action: 'USER_UPDATED', targetType: 'user', targetId: +id, description: 'User deleted' });
    res.json({ message: 'User deleted' });
  } catch (err) { next(err); }
}

/* ═══════════════════════════════════════════════════════════════════════
   MODULES
   ═══════════════════════════════════════════════════════════════════════ */

const VALID_ACCESS_LEVELS = ['free', 'basic', 'premium'];

// GET /api/admin/modules?page=1&pageSize=20&category=all&access=all&search=
async function getModules(req, res, next) {
  try {
    const { page, pageSize } = parsePaging(req.query);
    const category = (req.query.category || 'all').trim();
    const access   = (req.query.access || 'all').trim();
    const search   = (req.query.search || '').trim();

    const pool = await getPool();
    const preq = pool.request();
    preq.input('Page', sql.Int, page);
    preq.input('PageSize', sql.Int, pageSize);
    preq.input('Category', sql.VarChar(30), category !== 'all' ? category : null);
    preq.input('AccessLevel', sql.VarChar(20), VALID_ACCESS_LEVELS.includes(access) ? access : null);
    preq.input('Search', sql.NVarChar(255), search || null);
    preq.output('TotalRecords', sql.Int);
    const result = await preq.execute('sp_GetModulesPaged');

    res.json(buildEnvelope(result.recordset, page, pageSize, result.output.TotalRecords));
  } catch (err) { next(err); }
}

// GET /api/admin/modules/summary
async function getModuleAccessSummary(req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request().execute('sp_GetModuleAccessSummary');
    res.json(result.recordset[0]);
  } catch (err) { next(err); }
}

// POST /api/admin/modules
async function createModule(req, res, next) {
  try {
    const { name, slug, category, description, sortOrder } = req.body;
    const requiredPlan = VALID_ACCESS_LEVELS.includes(req.body.requiredPlan) ? req.body.requiredPlan : 'free';
    if (!name || !slug || !category)
      return res.status(400).json({ message: 'name, slug, category required' });

    const pool   = await getPool();
    // IsPremium is derived from RequiredPlan (single source of truth is the
    // access level Admin picks — see moduleController.hasModuleAccess).
    const result = await pool.request()
      .input('Name',         sql.NVarChar(100),  name)
      .input('Slug',         sql.NVarChar(100),  slug)
      .input('Category',     sql.VarChar(30),    category)
      .input('Description',  sql.NVarChar(1000), description || null)
      .input('RequiredPlan', sql.NVarChar(20),   requiredPlan)
      .input('IsPremium',    sql.Bit,            requiredPlan !== 'free' ? 1 : 0)
      .input('SortOrder',    sql.Int,            sortOrder  || 0)
      .query(`
        -- OUTPUT ... INTO a table variable: a bare OUTPUT is rejected (Msg 334) when the
        -- target table has any enabled trigger (e.g. activity-log triggers).
        DECLARE @out TABLE (ModuleId INT);
        INSERT INTO dbo.Modules (Name, Slug, Category, Description, RequiredPlan, IsPremium, SortOrder)
        OUTPUT INSERTED.ModuleId INTO @out (ModuleId)
        VALUES (@Name, @Slug, @Category, @Description, @RequiredPlan, @IsPremium, @SortOrder);
        SELECT * FROM dbo.Modules WHERE ModuleId = (SELECT ModuleId FROM @out);
      `);
    const mod = result.recordset[0];
    await logAudit(req, { action: 'MODULE_UPDATED', targetType: 'module', targetId: mod.ModuleId, description: `Module "${name}" created (${requiredPlan})` });
    res.status(201).json({ module: mod });
  } catch (err) { next(err); }
}

// PUT /api/admin/modules/:id
async function updateModule(req, res, next) {
  try {
    const { id } = req.params;
    const { name, slug, category, description, sortOrder, isActive } = req.body;
    const requiredPlan = VALID_ACCESS_LEVELS.includes(req.body.requiredPlan) ? req.body.requiredPlan : 'free';
    const pool   = await getPool();
    await pool.request()
      .input('ModuleId',     sql.Int,            id)
      .input('Name',         sql.NVarChar(100),  name)
      .input('Slug',         sql.NVarChar(100),  slug)
      .input('Category',     sql.VarChar(30),    category)
      .input('Description',  sql.NVarChar(1000), description || null)
      .input('RequiredPlan', sql.NVarChar(20),   requiredPlan)
      .input('IsPremium',    sql.Bit,            requiredPlan !== 'free' ? 1 : 0)
      .input('SortOrder',    sql.Int,            sortOrder  ?? 0)
      .input('IsActive',     sql.Bit,            isActive  !== false ? 1 : 0)
      .query(`
        UPDATE dbo.Modules
        SET Name=@Name, Slug=@Slug, Category=@Category,
            Description=@Description, IsPremium=@IsPremium,
            SortOrder=@SortOrder, IsActive=@IsActive, RequiredPlan=@RequiredPlan
        WHERE ModuleId=@ModuleId
      `);
    await logAudit(req, { action: 'MODULE_UPDATED', targetType: 'module', targetId: +id, description: `Module "${name}" updated (access: ${requiredPlan})` });
    res.json({ message: 'Module updated' });
  } catch (err) { next(err); }
}

// DELETE /api/admin/modules/:id
async function deleteModule(req, res, next) {
  try {
    const { id } = req.params;
    const pool   = await getPool();
    // Soft-delete by deactivating
    await pool.request()
      .input('ModuleId', sql.Int, id)
      .query(`UPDATE dbo.Modules SET IsActive=0 WHERE ModuleId=@ModuleId`);
    await logAudit(req, { action: 'MODULE_UPDATED', targetType: 'module', targetId: +id, description: 'Module deactivated' });
    res.json({ message: 'Module deactivated' });
  } catch (err) { next(err); }
}

/* ═══════════════════════════════════════════════════════════════════════
   PAYMENTS
   ═══════════════════════════════════════════════════════════════════════ */

// GET /api/admin/payments?page=1&pageSize=20&status=&userId=&search=
async function getPayments(req, res, next) {
  try {
    const { page, pageSize } = parsePaging(req.query);
    const status = (req.query.status && req.query.status !== 'all') ? req.query.status : null;
    const userId = req.query.userId ? parseInt(req.query.userId, 10) : null;
    const search = (req.query.search || '').trim();

    const { rows, total } = await PaymentModel.listPaged({ page, pageSize, status, userId, search });
    res.json(buildEnvelope(rows, page, pageSize, total));
  } catch (err) { next(err); }
}

// GET /api/admin/payments/:id
async function getPaymentDetail(req, res, next) {
  try {
    const payment = await PaymentModel.findById(req.params.id);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });

    const pool = await getPool();
    const webhookRes = await pool.request()
      .input('Payload', sql.NVarChar(sql.MAX), `%"payment_id":"${payment.ProviderPaymentId || ''}"%`)
      .query(`SELECT TOP 1 EventType, ProcessedAt FROM dbo.WebhookEvents WHERE Payload LIKE @Payload ORDER BY ProcessedAt DESC`);

    res.json({
      payment,
      verificationStatus: payment.Status === 'success' ? 'verified' : payment.Status,
      webhookStatus: webhookRes.recordset[0] || null,
    });
  } catch (err) { next(err); }
}

// POST /api/admin/payments/:id/refund   body: { amount?: number, reason?: string }
async function refundPayment(req, res, next) {
  try {
    const payment = await PaymentModel.findById(req.params.id);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    if (payment.Status !== 'success') return res.status(400).json({ message: 'Only successful payments can be refunded' });
    if (!payment.ProviderPaymentId) return res.status(400).json({ message: 'No provider payment id on record' });

    const { amount, reason } = req.body;
    const isPartial = amount && amount < payment.Amount;

    // Manually-seeded/test payments (ProviderPaymentId starting with
    // "pay_test_", never a real Razorpay id) don't exist on Razorpay's
    // side, so calling the real refund API always 404s. For those, just
    // record the refund locally instead of hitting Razorpay.
    const isFakePayment = payment.ProviderPaymentId.startsWith('pay_test_');

    let refund = null;
    if (!isFakePayment) {
      const razorpay = require('../services/razorpayClient');
      refund = await razorpay.payments.refund(payment.ProviderPaymentId, amount ? { amount: Math.round(amount * 100) } : {});
    }

    await PaymentModel.updateStatus(payment.PaymentId, {
      status: isPartial ? 'partially_refunded' : 'refunded',
      failureReason: reason || null,
    });

    await logAudit(req, {
      action: 'REFUND_PROCESSED', targetType: 'payment', targetId: payment.PaymentId,
      description: `Refund ${refund ? refund.id : '(local, test payment)'} for ${payment.Currency} ${amount || payment.Amount}${reason ? ' — ' + reason : ''}`,
    });

    res.json({ message: 'Refund processed', refund });
  } catch (err) { next(err); }
}

/* ═══════════════════════════════════════════════════════════════════════
   FEEDBACK
   ═══════════════════════════════════════════════════════════════════════ */

// GET /api/admin/feedback?page=1&pageSize=20&status=
async function getFeedback(req, res, next) {
  try {
    const { page, pageSize } = parsePaging(req.query);
    const status = (req.query.status && req.query.status !== 'all') ? req.query.status : null;

    const { rows, total } = await FeedbackModel.listPaged({ page, pageSize, status });
    res.json(buildEnvelope(rows, page, pageSize, total));
  } catch (err) { next(err); }
}

// PATCH /api/admin/feedback/:id/status   body: { status: 'open'|'reviewed'|'resolved' }
async function updateFeedbackStatus(req, res, next) {
  try {
    const { id }     = req.params;
    const { status } = req.body;
    if (!['open','reviewed','resolved'].includes(status))
      return res.status(400).json({ message: 'Invalid status' });

    await FeedbackModel.updateStatus(id, status);
    if (status === 'resolved') {
      await logAudit(req, { action: 'FEEDBACK_RESOLVED', targetType: 'feedback', targetId: +id, description: 'Feedback marked resolved' });
    }
    res.json({ message: 'Feedback status updated' });
  } catch (err) { next(err); }
}

// PATCH /api/admin/feedback/:id/reply   body: { reply: string }
async function replyToFeedback(req, res, next) {
  try {
    const { id }    = req.params;
    const { reply } = req.body;
    if (!reply || !reply.trim())
      return res.status(400).json({ message: 'Reply message is required' });
    if (reply.length > 2000)
      return res.status(400).json({ message: 'Reply must be 2000 characters or less' });

    await FeedbackModel.setReply(id, reply.trim());
    res.json({ message: 'Reply sent' });
  } catch (err) { next(err); }
}

// DELETE /api/admin/feedback/:id
async function deleteFeedback(req, res, next) {
  try {
    const { id } = req.params;
    await FeedbackModel.deleteById(id);
    await logAudit(req, { action: 'FEEDBACK_RESOLVED', targetType: 'feedback', targetId: +id, description: 'Feedback deleted' });
    res.json({ message: 'Feedback deleted' });
  } catch (err) { next(err); }
}

/* ═══════════════════════════════════════════════════════════════════════
   ANALYTICS EVENTS
   ═══════════════════════════════════════════════════════════════════════ */

// GET /api/admin/analytics?days=7
async function getAnalytics(req, res, next) {
  try {
    const days = Math.min(90, parseInt(req.query.days) || 7);
    const pool = await getPool();

    const [runsByDay, runsByLang, errorRate, topUsers] = await Promise.all([
      pool.request().input('Days', sql.Int, days).query(`
        SELECT CAST(CreatedAt AS DATE) AS day, COUNT(*) AS runs
        FROM dbo.ExecutionTraces
        WHERE CreatedAt >= DATEADD(day,-@Days,SYSUTCDATETIME())
        GROUP BY CAST(CreatedAt AS DATE)
        ORDER BY day
      `),
      pool.request().query(`
        SELECT Language, COUNT(*) AS runs
        FROM dbo.ExecutionTraces
        GROUP BY Language ORDER BY runs DESC
      `),
      pool.request().query(`
        SELECT Status, COUNT(*) AS count
        FROM dbo.ExecutionTraces
        GROUP BY Status
      `),
      pool.request().query(`
        SELECT TOP 5 u.FullName, u.Email, COUNT(*) AS runs
        FROM dbo.ExecutionTraces et
        JOIN dbo.Users u ON u.UserId = et.UserId
        GROUP BY u.UserId, u.FullName, u.Email
        ORDER BY runs DESC
      `),
    ]);

    res.json({
      runsByDay:  runsByDay.recordset,
      runsByLang: runsByLang.recordset,
      errorRate:  errorRate.recordset,
      topUsers:   topUsers.recordset,
    });
  } catch (err) { next(err); }
}

/* ═══════════════════════════════════════════════════════════════════════
   USER ACTIVITY
   ═══════════════════════════════════════════════════════════════════════ */

// GET /api/admin/activity?page=1&pageSize=20&type=all&search=&userId=
async function getActivity(req, res, next) {
  try {
    const { page, pageSize } = parsePaging(req.query);
    const type   = (req.query.type && req.query.type !== 'all') ? req.query.type : null;
    const search = (req.query.search || '').trim();
    const userId = req.query.userId ? parseInt(req.query.userId, 10) : null;

    const pool = await getPool();
    const preq = pool.request();
    preq.input('Page', sql.Int, page);
    preq.input('PageSize', sql.Int, pageSize);
    preq.input('Type', sql.VarChar(20), type);
    preq.input('Search', sql.NVarChar(255), search || null);
    preq.input('UserId', sql.Int, userId);
    preq.output('TotalRecords', sql.Int);
    const result = await preq.execute('sp_GetActivityPaged');

    res.json(buildEnvelope(result.recordset, page, pageSize, result.output.TotalRecords));
  } catch (err) { next(err); }
}

/* ═══════════════════════════════════════════════════════════════════════
   ADMIN AUDIT LOGS (separate from user Activity)
   ═══════════════════════════════════════════════════════════════════════ */

// GET /api/admin/audit-logs?page=1&pageSize=20&search=
async function getAuditLogs(req, res, next) {
  try {
    const { page, pageSize } = parsePaging(req.query);
    const search = (req.query.search || '').trim();

    const { rows, total } = await AuditLogModel.listPaged({ page, pageSize, search });
    res.json(buildEnvelope(rows, page, pageSize, total));
  } catch (err) { next(err); }
}

/* ═══════════════════════════════════════════════════════════════════════
   SUBMISSIONS (code execution attempts, exposed as "Submissions")
   ═══════════════════════════════════════════════════════════════════════ */

// GET /api/admin/submissions?page=1&pageSize=20&userId=&status=
async function getSubmissions(req, res, next) {
  try {
    const { page, pageSize } = parsePaging(req.query);
    const userId = req.query.userId ? parseInt(req.query.userId, 10) : null;
    const status = req.query.status && req.query.status !== 'all' ? req.query.status : null;

    const pool = await getPool();
    const preq = pool.request();
    preq.input('Page', sql.Int, page);
    preq.input('PageSize', sql.Int, pageSize);
    preq.input('UserId', sql.Int, userId);
    preq.input('Status', sql.VarChar(20), status);
    preq.output('TotalRecords', sql.Int);
    const result = await preq.execute('sp_GetSubmissionsPaged');

    res.json(buildEnvelope(result.recordset, page, pageSize, result.output.TotalRecords));
  } catch (err) { next(err); }
}

module.exports = {
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
};
