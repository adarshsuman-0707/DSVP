const { sql, getPool } = require('../config/db');
const UserModel        = require('../models/userModel');
const PaymentModel     = require('../models/paymentModel');
const FeedbackModel    = require('../models/feedbackModel');

/* ═══════════════════════════════════════════════════════════════════════
   OVERVIEW DASHBOARD
   GET /api/admin/dashboard
   ═══════════════════════════════════════════════════════════════════════ */
async function getDashboard(req, res, next) {
  try {
    const pool = await getPool();

    const [totalUsers, premiumUsers, totalRevenue, recentSignups,
           modulePopularity, recentTraces, openFeedback] = await Promise.all([

      pool.request().query('SELECT COUNT(*) AS count FROM dbo.Users'),
      pool.request().query('SELECT COUNT(*) AS count FROM dbo.Users WHERE IsPremium=1'),
      pool.request().query(`SELECT ISNULL(SUM(Amount),0) AS total FROM dbo.Payments WHERE Status='success'`),

      // ── Fixed: include Role column ──
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

      // Recent 5 code runs
      pool.request().query(`
        SELECT TOP 5 et.TraceId, et.Language, et.Status, et.CreatedAt,
                     u.FullName, u.Email
        FROM dbo.ExecutionTraces et
        JOIN dbo.Users u ON u.UserId = et.UserId
        ORDER BY et.CreatedAt DESC
      `),

      // Open feedback count
      pool.request().query(`SELECT COUNT(*) AS count FROM dbo.Feedback WHERE Status='open'`),
    ]);

    const tu  = totalUsers.recordset[0].count;
    const pu  = premiumUsers.recordset[0].count;

    // Signups per day for last 7 days (trend chart)
    const signupTrend = await pool.request().query(`
      SELECT CAST(CreatedAt AS DATE) AS day, COUNT(*) AS count
      FROM dbo.Users
      WHERE CreatedAt >= DATEADD(day,-7,SYSUTCDATETIME())
      GROUP BY CAST(CreatedAt AS DATE)
      ORDER BY day
    `);

    res.json({
      kpis: {
        totalUsers:      tu,
        premiumUsers:    pu,
        totalRevenue:    totalRevenue.recordset[0].total,
        conversionRate:  tu ? +((pu / tu) * 100).toFixed(2) : 0,
        openFeedback:    openFeedback.recordset[0].count,
      },
      recentSignups:    recentSignups.recordset,
      modulePopularity: modulePopularity.recordset,
      recentTraces:     recentTraces.recordset,
      signupTrend:      signupTrend.recordset,
    });
  } catch (err) { next(err); }
}

/* ═══════════════════════════════════════════════════════════════════════
   USERS
   ═══════════════════════════════════════════════════════════════════════ */

// GET /api/admin/users?page=1&pageSize=20&search=
async function getUsers(req, res, next) {
    try {
        const page = Math.max(
            1,
            parseInt(req.query.page, 10) || 1
        );

        const pageSize = Math.min(
            100,
            Math.max(1, parseInt(req.query.pageSize, 10) || 20)
        );

        const search = (req.query.search || '').trim();

        const startRow = ((page - 1) * pageSize) + 1;
        const endRow = page * pageSize;

        const pool = await getPool();

        let rows;
        let totalResult;

        if (search) {
            const searchPattern = `%${search}%`;

            const dataRequest = pool.request()
                .input('Search', sql.NVarChar(255), searchPattern)
                .input('StartRow', sql.Int, startRow)
                .input('EndRow', sql.Int, endRow);

            const countRequest = pool.request()
                .input('Search', sql.NVarChar(255), searchPattern);

            [rows, totalResult] = await Promise.all([
                dataRequest.query(`
                    WITH UserData AS
                    (
                        SELECT
                            UserId,
                            FullName,
                            Email,
                            Role,
                            IsPremium,
                            CreatedAt,
                            LastLoginAt,
                            ROW_NUMBER() OVER (
                                ORDER BY CreatedAt DESC
                            ) AS RowNum
                        FROM dbo.Users
                        WHERE
                            FullName LIKE @Search
                            OR Email LIKE @Search
                    )
                    SELECT
                        UserId,
                        FullName,
                        Email,
                        Role,
                        IsPremium,
                        CreatedAt,
                        LastLoginAt
                    FROM UserData
                    WHERE RowNum BETWEEN @StartRow AND @EndRow
                    ORDER BY RowNum;
                `),

                countRequest.query(`
                    SELECT COUNT(*) AS total
                    FROM dbo.Users
                    WHERE
                        FullName LIKE @Search
                        OR Email LIKE @Search;
                `)
            ]);

        } else {
            const dataRequest = pool.request()
                .input('StartRow', sql.Int, startRow)
                .input('EndRow', sql.Int, endRow);

            const countRequest = pool.request();

            [rows, totalResult] = await Promise.all([
                dataRequest.query(`
                    WITH UserData AS
                    (
                        SELECT
                            UserId,
                            FullName,
                            Email,
                            Role,
                            IsPremium,
                            CreatedAt,
                            LastLoginAt,
                            ROW_NUMBER() OVER (
                                ORDER BY CreatedAt DESC
                            ) AS RowNum
                        FROM dbo.Users
                    )
                    SELECT
                        UserId,
                        FullName,
                        Email,
                        Role,
                        IsPremium,
                        CreatedAt,
                        LastLoginAt
                    FROM UserData
                    WHERE RowNum BETWEEN @StartRow AND @EndRow
                    ORDER BY RowNum;
                `),

                countRequest.query(`
                    SELECT COUNT(*) AS total
                    FROM dbo.Users;
                `)
            ]);
        }

        const total = totalResult.recordset[0].total;

        res.json({
            users: rows.recordset,
            total: total,
            page: page,
            pageSize: pageSize,
            totalPages: Math.ceil(total / pageSize)
        });

    } catch (err) {
        next(err);
    }
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

    res.json({ message: 'Role updated' });
  } catch (err) { next(err); }
}

// PATCH /api/admin/users/:id/premium  body: { isPremium: true|false }
async function updateUserPremium(req, res, next) {
  try {
    const { id }        = req.params;
    const { isPremium } = req.body;
    const pool          = await getPool();
    await pool.request()
      .input('UserId',    sql.Int, id)
      .input('IsPremium', sql.Bit, isPremium ? 1 : 0)
      .query(`UPDATE dbo.Users SET IsPremium=@IsPremium, UpdatedAt=SYSUTCDATETIME() WHERE UserId=@UserId`);

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
    
    // Set expiry to 1 month from now for paid plans
    const expiryDate = (plan !== 'free') ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null;
    
    // Convert moduleAccess array to JSON string
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

    res.json({ 
      message: 'Subscription updated',
      plan,
      expiresAt: expiryDate,
      moduleAccess
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
    // Delete in FK-safe order
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

    res.json({ message: 'User deleted' });
  } catch (err) { next(err); }
}

/* ═══════════════════════════════════════════════════════════════════════
   MODULES
   ═══════════════════════════════════════════════════════════════════════ */

// GET /api/admin/modules
async function getModules(req, res, next) {
  try {
    const pool   = await getPool();
    const result = await pool.request().query(`
      SELECT ModuleId, Name, Slug, Category, Description,
             IsPremium, RequiredPlan, SortOrder, IsActive, CreatedAt
      FROM dbo.Modules ORDER BY SortOrder, Name
    `);
    res.json({ modules: result.recordset });
  } catch (err) { next(err); }
}

// POST /api/admin/modules
async function createModule(req, res, next) {
  try {
    const { name, slug, category, description, isPremium, sortOrder } = req.body;
    if (!name || !slug || !category)
      return res.status(400).json({ message: 'name, slug, category required' });

    const pool   = await getPool();
    const result = await pool.request()
      .input('Name',        sql.NVarChar(100),  name)
      .input('Slug',        sql.NVarChar(100),  slug)
      .input('Category',    sql.VarChar(30),    category)
      .input('Description', sql.NVarChar(1000), description || null)
      .input('IsPremium',   sql.Bit,            isPremium ? 1 : 0)
      .input('SortOrder',   sql.Int,            sortOrder  || 0)
      .query(`
        INSERT INTO dbo.Modules (Name, Slug, Category, Description, IsPremium, SortOrder)
        OUTPUT INSERTED.*
        VALUES (@Name, @Slug, @Category, @Description, @IsPremium, @SortOrder)
      `);
    res.status(201).json({ module: result.recordset[0] });
  } catch (err) { next(err); }
}

// PUT /api/admin/modules/:id
async function updateModule(req, res, next) {
  try {
    const { id } = req.params;
    const { name, slug, category, description, isPremium, sortOrder, isActive, requiredPlan } = req.body;
    const pool   = await getPool();
    await pool.request()
      .input('ModuleId',     sql.Int,            id)
      .input('Name',         sql.NVarChar(100),  name)
      .input('Slug',         sql.NVarChar(100),  slug)
      .input('Category',     sql.VarChar(30),    category)
      .input('Description',  sql.NVarChar(1000), description || null)
      .input('IsPremium',    sql.Bit,            isPremium ? 1 : 0)
      .input('SortOrder',    sql.Int,            sortOrder  ?? 0)
      .input('IsActive',     sql.Bit,            isActive  !== false ? 1 : 0)
      .input('RequiredPlan', sql.NVarChar(20),   requiredPlan || 'free')
      .query(`
        UPDATE dbo.Modules
        SET Name=@Name, Slug=@Slug, Category=@Category,
            Description=@Description, IsPremium=@IsPremium,
            SortOrder=@SortOrder, IsActive=@IsActive, RequiredPlan=@RequiredPlan
        WHERE ModuleId=@ModuleId
      `);
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
    res.json({ message: 'Module deactivated' });
  } catch (err) { next(err); }
}

/* ═══════════════════════════════════════════════════════════════════════
   PAYMENTS
   ═══════════════════════════════════════════════════════════════════════ */

// GET /api/admin/payments?page=1&status=all
async function getPayments(req, res, next) {
  try {
    const page     = Math.max(1,   parseInt(req.query.page)     || 1);
    const pageSize = Math.min(100, parseInt(req.query.pageSize) || 20);
    const status   = req.query.status || 'all';

    const [rows, total] = await Promise.all([
      PaymentModel.listAll({ page, pageSize, status }),
      PaymentModel.countAll({ status }),
    ]);

    res.json({ payments: rows, total, page, pageSize });
  } catch (err) { next(err); }
}

/* ═══════════════════════════════════════════════════════════════════════
   FEEDBACK
   ═══════════════════════════════════════════════════════════════════════ */

// GET /api/admin/feedback?page=1&status=all
async function getFeedback(req, res, next) {
  try {
    const page     = Math.max(1,   parseInt(req.query.page)     || 1);
    const pageSize = Math.min(100, parseInt(req.query.pageSize) || 20);
    const status   = req.query.status || 'all';

    const [rows, total] = await Promise.all([
      FeedbackModel.listAll({ page, pageSize, status }),
      FeedbackModel.countAll({ status }),
    ]);

    res.json({ feedback: rows, total, page, pageSize });
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
    res.json({ message: 'Feedback status updated' });
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

module.exports = {
  getDashboard,
  getUsers, updateUserRole, updateUserPremium, updateUserSubscription, deleteUser,
  getModules, createModule, updateModule, deleteModule,
  getPayments,
  getFeedback, updateFeedbackStatus,
  getAnalytics,
};
