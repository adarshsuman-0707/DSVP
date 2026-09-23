const { sql, getPool } = require('../config/db');

/**
 * Report queries backing the Reports feature (user-scoped + admin-wide).
 *
 * Known gaps in the schema — deliberately NOT fabricated (see report to caller):
 *   - No execution-duration column anywhere → "Execution Time" is omitted from
 *     every report that would otherwise carry it.
 *   - No "attempts" counter on UserProgress → learning report approximates
 *     attempts via COUNT(*) of ExecutionTraces for that user+module.
 *   - No "ExecutionCount" on SavedSnippets → omitted (see getSavedSnippetsReport).
 *   - No category column on Feedback → omitted.
 *   - No explicit success/fail result column on AuditLogs → `result` just
 *     echoes Description, nothing is inferred.
 *
 * `filters` shape: { dateFrom, dateTo, module, language, status, page, pageSize }.
 * All optional. When page/pageSize are omitted, the full unpaged result set is
 * returned (reports need complete datasets for export); when supplied, an
 * envelope-shaped { data, page, pageSize, totalRecords, totalPages } via the
 * caller (paginate.js) is expected — these model fns just return { rows, total }
 * in that case so the controller can build the envelope.
 */

function addDateRange(request, whereParts, filters, column) {
  if (filters.dateFrom) {
    request.input('DateFrom', sql.DateTime2, filters.dateFrom);
    whereParts.push(`${column} >= @DateFrom`);
  }
  if (filters.dateTo) {
    request.input('DateTo', sql.DateTime2, filters.dateTo);
    whereParts.push(`${column} <= @DateTo`);
  }
}

// Always returns { rows, total }. When filters.page/pageSize are omitted,
// `rows` is the full unpaged set (needed for exports) and `total` equals
// rows.length. When supplied, `rows` is just that page's slice.
function applyPaging(rows, filters) {
  if (!filters.page || !filters.pageSize) {
    return { rows, total: rows.length };
  }
  const start = (filters.page - 1) * filters.pageSize;
  return {
    rows: rows.slice(start, start + filters.pageSize),
    total: rows.length,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   USER-SCOPED REPORTS — always filtered by UserId, never trust anything
   else from the client to broaden scope.
   ═══════════════════════════════════════════════════════════════════════ */

async function getUserSummary(userId) {
  const pool = await getPool();

  const [progress, execution, snippets, account, payments] = await Promise.all([
    pool.request().input('UserId', sql.Int, userId).query(`
      SELECT
        COUNT(DISTINCT ModuleId) AS ModulesStarted,
        COUNT(DISTINCT CASE WHEN Status = 'completed' THEN ModuleId END) AS ModulesCompleted,
        ISNULL(AVG(CAST(CompletionPct AS FLOAT)), 0) AS OverallProgressPct
      FROM dbo.UserProgress WHERE UserId = @UserId
    `),
    pool.request().input('UserId', sql.Int, userId).query(`
      SELECT
        COUNT(*) AS Total,
        SUM(CASE WHEN Status = 'success' THEN 1 ELSE 0 END) AS Successful,
        SUM(CASE WHEN Status IN ('compile_error','runtime_error') THEN 1 ELSE 0 END) AS Failed
      FROM dbo.ExecutionTraces WHERE UserId = @UserId
    `),
    pool.request().input('UserId', sql.Int, userId).query(`
      SELECT
        COUNT(*) AS Total,
        SUM(CASE WHEN CreatedAt >= DATEADD(day,-7,SYSUTCDATETIME()) THEN 1 ELSE 0 END) AS RecentSaved
      FROM dbo.SavedSnippets WHERE UserId = @UserId
    `),
    pool.request().input('UserId', sql.Int, userId).query(`
      SELECT SubscriptionPlan, CoinBalance FROM dbo.Users WHERE UserId = @UserId
    `),
    pool.request().input('UserId', sql.Int, userId).query(`
      SELECT COUNT(*) AS Total FROM dbo.Payments WHERE UserId = @UserId AND Status = 'success'
    `),
  ]);

  const p = progress.recordset[0] || {};
  const e = execution.recordset[0] || {};
  const s = snippets.recordset[0] || {};
  const a = account.recordset[0] || {};

  return {
    learning: {
      modulesStarted: p.ModulesStarted || 0,
      modulesCompleted: p.ModulesCompleted || 0,
      overallProgressPct: Math.round((p.OverallProgressPct || 0) * 100) / 100,
    },
    execution: {
      total: e.Total || 0,
      successful: e.Successful || 0,
      failed: e.Failed || 0,
    },
    snippets: {
      total: s.Total || 0,
      recentSaved: s.RecentSaved || 0,
    },
    account: {
      plan: a.SubscriptionPlan || 'free',
      coinBalance: a.CoinBalance || 0,
      totalPayments: payments.recordset[0]?.Total || 0,
    },
  };
}

async function getLearningProgressReport(userId, filters = {}) {
  const pool = await getPool();
  const request = pool.request().input('UserId', sql.Int, userId);
  const whereParts = ['up.UserId = @UserId'];

  if (filters.module) {
    request.input('Module', sql.NVarChar(100), filters.module);
    whereParts.push('(m.Name = @Module OR m.Slug = @Module)');
  }
  if (filters.status) {
    request.input('Status', sql.VarChar(20), filters.status);
    whereParts.push('up.Status = @Status');
  }
  addDateRange(request, whereParts, filters, 'up.LastAccessedAt');

  // Attempts is not tracked on UserProgress — best-effort proxy via a
  // correlated count of ExecutionTraces for the same user+module.
  const { recordset } = await request.query(`
    SELECT
      m.Name AS ModuleName,
      m.RequiredPlan AS AccessLevel,
      AVG(CAST(up.CompletionPct AS FLOAT)) AS Progress,
      MAX(CASE WHEN up.Status = 'completed' THEN 1 ELSE 0 END) AS IsCompleted,
      MIN(up.LastAccessedAt) AS StartedDate,
      MAX(CASE WHEN up.Status = 'completed' THEN up.LastAccessedAt END) AS CompletionDate,
      (SELECT COUNT(*) FROM dbo.ExecutionTraces et WHERE et.UserId = up.UserId AND et.ModuleId = up.ModuleId) AS Attempts
    FROM dbo.UserProgress up
    JOIN dbo.Modules m ON m.ModuleId = up.ModuleId
    WHERE ${whereParts.join(' AND ')}
    GROUP BY up.UserId, up.ModuleId, m.Name, m.RequiredPlan
    ORDER BY MIN(up.LastAccessedAt) DESC
  `);

  const rows = recordset.map((r) => ({
    moduleName: r.ModuleName,
    accessLevel: r.AccessLevel,
    progress: Math.round((r.Progress || 0) * 100) / 100,
    status: r.IsCompleted ? 'completed' : 'in_progress',
    attempts: r.Attempts || 0,
    startedDate: r.StartedDate,
    completionDate: r.CompletionDate || null,
  }));

  return applyPaging(rows, filters);
}

async function getCodeExecutionReport(userId, filters = {}) {
  const pool = await getPool();
  const request = pool.request().input('UserId', sql.Int, userId);
  const whereParts = ['et.UserId = @UserId'];

  if (filters.language) {
    request.input('Language', sql.VarChar(20), filters.language);
    whereParts.push('et.Language = @Language');
  }
  if (filters.status) {
    request.input('Status', sql.VarChar(20), filters.status);
    whereParts.push('et.Status = @Status');
  }
  if (filters.module) {
    request.input('Module', sql.NVarChar(100), filters.module);
    whereParts.push('(m.Name = @Module OR m.Slug = @Module)');
  }
  addDateRange(request, whereParts, filters, 'et.CreatedAt');

  const { recordset } = await request.query(`
    SELECT et.CreatedAt AS ExecutionDate, et.Language,
           ISNULL(m.Name, 'N/A') AS DataStructure, et.Status
    FROM dbo.ExecutionTraces et
    LEFT JOIN dbo.Modules m ON m.ModuleId = et.ModuleId
    WHERE ${whereParts.join(' AND ')}
    ORDER BY et.CreatedAt DESC
  `);

  // numberOfOperations: no reliable column/format guarantee for TraceEventsJson
  // to count operations without risking fabricated numbers — omitted per spec.
  const rows = recordset.map((r) => ({
    executionDate: r.ExecutionDate,
    language: r.Language,
    dataStructure: r.DataStructure,
    status: r.Status,
  }));

  return applyPaging(rows, filters);
}

async function getSavedSnippetsReport(userId, filters = {}) {
  const pool = await getPool();
  const request = pool.request().input('UserId', sql.Int, userId);
  const whereParts = ['s.UserId = @UserId'];

  if (filters.language) {
    request.input('Language', sql.VarChar(20), filters.language);
    whereParts.push('s.Language = @Language');
  }
  if (filters.module) {
    request.input('Module', sql.NVarChar(100), filters.module);
    whereParts.push('(m.Name = @Module OR s.ModuleSlug = @Module)');
  }
  addDateRange(request, whereParts, filters, 's.CreatedAt');

  const { recordset } = await request.query(`
    SELECT s.Title AS SnippetName, s.Language,
           ISNULL(m.Name, s.ModuleSlug) AS DataStructure,
           s.CreatedAt, s.UpdatedAt
    FROM dbo.SavedSnippets s
    LEFT JOIN dbo.Modules m ON m.ModuleId = s.ModuleId
    WHERE ${whereParts.join(' AND ')}
    ORDER BY s.CreatedAt DESC
  `);

  // executionCount: no ExecutionCount column on SavedSnippets — omitted
  // rather than fabricated (no reliable join key ties a trace to a specific
  // snippet; a user+module+language join would over/under count).
  const rows = recordset.map((r) => ({
    snippetName: r.SnippetName,
    language: r.Language,
    dataStructure: r.DataStructure || 'N/A',
    createdDate: r.CreatedAt,
    lastModified: r.UpdatedAt,
  }));

  return applyPaging(rows, filters);
}

async function getPaymentHistoryReport(userId, filters = {}) {
  const pool = await getPool();
  const request = pool.request().input('UserId', sql.Int, userId);
  const whereParts = ['p.UserId = @UserId'];

  if (filters.status) {
    request.input('Status', sql.VarChar(20), filters.status);
    whereParts.push('p.Status = @Status');
  }
  addDateRange(request, whereParts, filters, 'p.CreatedAt');

  const { recordset } = await request.query(`
    SELECT p.CreatedAt AS PaymentDate, p.ProviderOrderId AS OrderId, p.PlanName AS [Plan],
           p.Amount, p.DiscountAmount, p.CoinsRedeemed, p.PaymentMethod, p.Status
    FROM dbo.Payments p
    WHERE ${whereParts.join(' AND ')}
    ORDER BY p.CreatedAt DESC
  `);

  const rows = recordset.map((r) => ({
    paymentDate: r.PaymentDate,
    orderId: r.OrderId,
    plan: r.Plan,
    amount: r.Amount,
    discount: r.DiscountAmount || 0,
    coinsRedeemed: r.CoinsRedeemed || 0,
    paymentMethod: r.PaymentMethod,
    status: r.Status,
  }));

  return applyPaging(rows, filters);
}

async function getCoinTransactionReport(userId, filters = {}) {
  const pool = await getPool();
  const request = pool.request().input('UserId', sql.Int, userId);
  const whereParts = ['UserId = @UserId'];

  addDateRange(request, whereParts, filters, 'CreatedAt');

  const { recordset } = await request.query(`
    SELECT CreatedAt AS [Date], Reason AS TransactionType, Amount, BalanceAfter, Description
    FROM dbo.CoinTransactions
    WHERE ${whereParts.join(' AND ')}
    ORDER BY CreatedAt DESC
  `);

  const rows = recordset.map((r) => ({
    date: r.Date,
    transactionType: r.TransactionType,
    coinsEarned: r.Amount > 0 ? r.Amount : 0,
    coinsRedeemed: r.Amount < 0 ? Math.abs(r.Amount) : 0,
    balance: r.BalanceAfter,
    reference: r.Description || '',
  }));

  return applyPaging(rows, filters);
}

/* ═══════════════════════════════════════════════════════════════════════
   ADMIN REPORTS — organization-wide, no UserId filter.
   ═══════════════════════════════════════════════════════════════════════ */

async function getAdminSummary() {
  const pool = await getPool();

  const [totalUsers, activeUsers, premiumUsers, totalRevenue, totalExecutions,
         modulesCompleted, pendingFeedback, auditEvents] = await Promise.all([
    pool.request().query('SELECT COUNT(*) AS c FROM dbo.Users'),
    pool.request().query(`SELECT COUNT(*) AS c FROM dbo.Users WHERE Status='active'`),
    // IsPremium is the authoritative flag (adminController keeps it in sync
    // with SubscriptionPlan on every plan change — see updateUserSubscription).
    pool.request().query('SELECT COUNT(*) AS c FROM dbo.Users WHERE IsPremium=1'),
    pool.request().query(`SELECT ISNULL(SUM(Amount),0) AS c FROM dbo.Payments WHERE Status='success'`),
    pool.request().query('SELECT COUNT(*) AS c FROM dbo.ExecutionTraces'),
    pool.request().query(`SELECT COUNT(*) AS c FROM dbo.UserProgress WHERE Status='completed'`),
    pool.request().query(`SELECT COUNT(*) AS c FROM dbo.Feedback WHERE Status='open'`),
    pool.request().query('SELECT COUNT(*) AS c FROM dbo.AuditLogs'),
  ]);

  return {
    totalUsers: totalUsers.recordset[0].c,
    activeUsers: activeUsers.recordset[0].c,
    premiumUsers: premiumUsers.recordset[0].c,
    totalRevenue: totalRevenue.recordset[0].c,
    totalExecutions: totalExecutions.recordset[0].c,
    modulesCompleted: modulesCompleted.recordset[0].c,
    pendingFeedback: pendingFeedback.recordset[0].c,
    auditEvents: auditEvents.recordset[0].c,
  };
}

async function getUserReport(filters = {}) {
  const pool = await getPool();
  const request = pool.request();
  const whereParts = ['1=1'];

  if (filters.status) {
    request.input('Status', sql.VarChar(20), filters.status);
    whereParts.push('u.Status = @Status');
  }
  addDateRange(request, whereParts, filters, 'u.CreatedAt');

  const { recordset } = await request.query(`
    SELECT u.UserId, u.FullName AS Name, u.Email, u.Role, u.SubscriptionPlan AS [Plan],
           u.Status, u.CreatedAt AS RegistrationDate, u.LastLoginAt, u.CoinBalance,
           (SELECT COUNT(*) FROM dbo.ExecutionTraces et WHERE et.UserId = u.UserId) AS TotalExecutions,
           (SELECT COUNT(*) FROM dbo.SavedSnippets s WHERE s.UserId = u.UserId) AS SavedSnippets,
           (SELECT COUNT(DISTINCT ModuleId) FROM dbo.UserProgress up WHERE up.UserId = u.UserId AND up.Status = 'completed') AS ModulesCompleted
    FROM dbo.Users u
    WHERE ${whereParts.join(' AND ')}
    ORDER BY u.CreatedAt DESC
  `);

  const rows = recordset.map((r) => ({
    userId: r.UserId,
    name: r.Name,
    email: r.Email,
    role: r.Role,
    plan: r.Plan || 'free',
    status: r.Status,
    registrationDate: r.RegistrationDate,
    lastLogin: r.LastLoginAt,
    totalExecutions: r.TotalExecutions,
    savedSnippets: r.SavedSnippets,
    modulesCompleted: r.ModulesCompleted,
    coinBalance: r.CoinBalance,
  }));

  return applyPaging(rows, filters);
}

async function getRevenuePaymentReport(filters = {}) {
  const pool = await getPool();
  const request = pool.request();
  const whereParts = ['1=1'];

  if (filters.status) {
    request.input('Status', sql.VarChar(20), filters.status);
    whereParts.push('p.Status = @Status');
  }
  addDateRange(request, whereParts, filters, 'p.CreatedAt');

  const { recordset } = await request.query(`
    SELECT p.CreatedAt AS PaymentDate, u.FullName AS [User], p.ProviderOrderId AS OrderId,
           p.PlanName AS [Plan], p.Amount, p.DiscountAmount, p.CoinsRedeemed,
           p.PaymentMethod, p.Status, p.FailureReason
    FROM dbo.Payments p
    JOIN dbo.Users u ON u.UserId = p.UserId
    WHERE ${whereParts.join(' AND ')}
    ORDER BY p.CreatedAt DESC
  `);

  const rows = recordset.map((r) => ({
    paymentDate: r.PaymentDate,
    user: r.User,
    orderId: r.OrderId,
    plan: r.Plan,
    amount: r.Amount,
    discount: r.DiscountAmount || 0,
    coinsRedeemed: r.CoinsRedeemed || 0,
    paymentMethod: r.PaymentMethod,
    status: r.Status,
    failureReason: r.FailureReason || '',
  }));

  return applyPaging(rows, filters);
}

async function getModulePerformanceReport(filters = {}) {
  const pool = await getPool();
  const request = pool.request();
  const whereParts = ['1=1'];

  if (filters.module) {
    request.input('Module', sql.NVarChar(100), filters.module);
    whereParts.push('(m.Name = @Module OR m.Slug = @Module)');
  }

  const { recordset } = await request.query(`
    SELECT m.Name AS Module, m.RequiredPlan AS AccessLevel,
           COUNT(DISTINCT up.UserId) AS UsersStarted,
           COUNT(DISTINCT CASE WHEN up.Status = 'completed' THEN up.UserId END) AS UsersCompleted,
           AVG(CAST(up.CompletionPct AS FLOAT)) AS AverageProgress,
           (SELECT COUNT(*) FROM dbo.ExecutionTraces et WHERE et.ModuleId = m.ModuleId) AS TotalExecutions
    FROM dbo.Modules m
    LEFT JOIN dbo.UserProgress up ON up.ModuleId = m.ModuleId
    WHERE ${whereParts.join(' AND ')}
    GROUP BY m.ModuleId, m.Name, m.RequiredPlan
    ORDER BY m.Name
  `);

  const rows = recordset.map((r) => {
    const usersStarted = r.UsersStarted || 0;
    const usersCompleted = r.UsersCompleted || 0;
    return {
      module: r.Module,
      accessLevel: r.AccessLevel,
      usersStarted,
      usersCompleted,
      completionRate: usersStarted ? Math.round((usersCompleted / usersStarted) * 10000) / 100 : 0,
      // Best-effort proxy: total executions against the module spread across
      // the users who started it. Not a true "attempts per user" metric.
      averageAttempts: usersStarted ? Math.round((r.TotalExecutions / usersStarted) * 100) / 100 : 0,
      averageProgress: Math.round((r.AverageProgress || 0) * 100) / 100,
    };
  });

  return applyPaging(rows, filters);
}

async function getExecutionAnalyticsReport(filters = {}) {
  const pool = await getPool();
  const request = pool.request();
  const whereParts = ['1=1'];

  if (filters.language) {
    request.input('Language', sql.VarChar(20), filters.language);
    whereParts.push('et.Language = @Language');
  }
  if (filters.module) {
    request.input('Module', sql.NVarChar(100), filters.module);
    whereParts.push('(m.Name = @Module OR m.Slug = @Module)');
  }
  addDateRange(request, whereParts, filters, 'et.CreatedAt');

  const { recordset } = await request.query(`
    SELECT CAST(et.CreatedAt AS DATE) AS [Date], et.Language, ISNULL(m.Name,'N/A') AS Module,
           COUNT(*) AS TotalExecutions,
           SUM(CASE WHEN et.Status = 'success' THEN 1 ELSE 0 END) AS Successful,
           SUM(CASE WHEN et.Status IN ('compile_error','runtime_error') THEN 1 ELSE 0 END) AS Failed
    FROM dbo.ExecutionTraces et
    LEFT JOIN dbo.Modules m ON m.ModuleId = et.ModuleId
    WHERE ${whereParts.join(' AND ')}
    GROUP BY CAST(et.CreatedAt AS DATE), et.Language, m.Name
    ORDER BY [Date] DESC
  `);

  const rows = recordset.map((r) => ({
    date: r.Date,
    language: r.Language,
    module: r.Module,
    totalExecutions: r.TotalExecutions,
    successful: r.Successful,
    failed: r.Failed,
    successRate: r.TotalExecutions ? Math.round((r.Successful / r.TotalExecutions) * 10000) / 100 : 0,
  }));

  return applyPaging(rows, filters);
}

async function getUserActivityReport(filters = {}) {
  const pool = await getPool();
  const request = pool.request();
  const whereParts = ['1=1'];

  addDateRange(request, whereParts, filters, 'CreatedAt');

  // Mirrors the UNION shape backing adminController.getActivity /
  // sp_GetActivityPaged (see database/06_admin_management.sql) — no
  // IP/session info here, since only AuditLogs carries IPAddress and that's
  // admin-action-specific, not general user activity.
  const { recordset } = await request.query(`
    SELECT CreatedAt AS DateTime, FullName AS [User], Type AS Activity, Module, Result
    FROM (
      SELECT ae.CreatedAt, u.FullName, ae.EventType AS Type, CAST(NULL AS NVARCHAR(100)) AS Module,
             CAST(NULL AS NVARCHAR(200)) AS Result
      FROM dbo.AnalyticsEvents ae JOIN dbo.Users u ON u.UserId = ae.UserId
      UNION ALL
      SELECT et.CreatedAt, u.FullName, 'code_run', m.Name, et.Status
      FROM dbo.ExecutionTraces et
      JOIN dbo.Users u ON u.UserId = et.UserId
      LEFT JOIN dbo.Modules m ON m.ModuleId = et.ModuleId
      UNION ALL
      SELECT p.CreatedAt, u.FullName, 'payment', p.PlanName, p.Status
      FROM dbo.Payments p JOIN dbo.Users u ON u.UserId = p.UserId
    ) AS ActivityData
    WHERE ${whereParts.join(' AND ')}
    ORDER BY CreatedAt DESC
  `);

  const rows = recordset.map((r) => ({
    dateTime: r.DateTime,
    user: r.User,
    activity: r.Activity,
    module: r.Module || 'N/A',
    result: r.Result || '',
  }));

  return applyPaging(rows, filters);
}

async function getFeedbackReport(filters = {}) {
  const pool = await getPool();
  const request = pool.request();
  const whereParts = ['1=1'];

  if (filters.status) {
    request.input('Status', sql.VarChar(20), filters.status);
    whereParts.push('f.Status = @Status');
  }
  addDateRange(request, whereParts, filters, 'f.CreatedAt');

  // No category-like column exists on dbo.Feedback — omitted per spec.
  const { recordset } = await request.query(`
    SELECT f.CreatedAt AS [Date], ISNULL(u.FullName, 'Anonymous') AS [User],
           f.Subject, f.Message, f.Status, f.UserSeen
    FROM dbo.Feedback f
    LEFT JOIN dbo.Users u ON u.UserId = f.UserId
    WHERE ${whereParts.join(' AND ')}
    ORDER BY f.CreatedAt DESC
  `);

  const truncate = (s, n) => (s && s.length > n ? s.slice(0, n) + '…' : s);

  const rows = recordset.map((r) => ({
    date: r.Date,
    user: r.User,
    feedback: `${r.Subject}: ${truncate(r.Message, 150)}`,
    status: r.Status,
    seenUnseen: r.UserSeen ? 'seen' : 'unseen',
  }));

  return applyPaging(rows, filters);
}

async function getAuditLogReport(filters = {}) {
  const pool = await getPool();
  const request = pool.request();
  const whereParts = ['1=1'];

  addDateRange(request, whereParts, filters, 'a.CreatedAt');

  const { recordset } = await request.query(`
    SELECT a.CreatedAt AS DateTime, u.FullName AS Admin, a.Action,
           a.TargetType AS Entity, a.TargetId AS EntityId, a.Description
    FROM dbo.AuditLogs a
    JOIN dbo.Users u ON u.UserId = a.AdminId
    WHERE ${whereParts.join(' AND ')}
    ORDER BY a.CreatedAt DESC
  `);

  // No explicit success/fail column on AuditLogs — `result` just echoes
  // Description verbatim rather than inferring an outcome.
  const rows = recordset.map((r) => ({
    dateTime: r.DateTime,
    admin: r.Admin,
    action: r.Action,
    entity: r.Entity,
    entityId: r.EntityId,
    result: r.Description || '',
  }));

  return applyPaging(rows, filters);
}

async function getSubmissionReport(filters = {}) {
  const pool = await getPool();
  const request = pool.request();
  const whereParts = ['1=1'];

  if (filters.language) {
    request.input('Language', sql.VarChar(20), filters.language);
    whereParts.push('et.Language = @Language');
  }
  if (filters.status) {
    request.input('Status', sql.VarChar(20), filters.status);
    whereParts.push('et.Status = @Status');
  }
  addDateRange(request, whereParts, filters, 'et.CreatedAt');

  const { recordset } = await request.query(`
    SELECT u.FullName AS [User], ISNULL(m.Name,'N/A') AS Module, et.Language,
           et.CreatedAt AS SubmissionDate, et.Status AS ExecutionStatus
    FROM dbo.ExecutionTraces et
    JOIN dbo.Users u ON u.UserId = et.UserId
    LEFT JOIN dbo.Modules m ON m.ModuleId = et.ModuleId
    WHERE ${whereParts.join(' AND ')}
    ORDER BY et.CreatedAt DESC
  `);

  // executionTime omitted — no such column exists.
  const rows = recordset.map((r) => ({
    user: r.User,
    module: r.Module,
    language: r.Language,
    submissionDate: r.SubmissionDate,
    executionStatus: r.ExecutionStatus,
  }));

  return applyPaging(rows, filters);
}

module.exports = {
  getUserSummary,
  getLearningProgressReport,
  getCodeExecutionReport,
  getSavedSnippetsReport,
  getPaymentHistoryReport,
  getCoinTransactionReport,
  getAdminSummary,
  getUserReport,
  getRevenuePaymentReport,
  getModulePerformanceReport,
  getExecutionAnalyticsReport,
  getUserActivityReport,
  getFeedbackReport,
  getAuditLogReport,
  getSubmissionReport,
};
