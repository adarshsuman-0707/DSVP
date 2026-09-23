const { sql, getPool } = require('../config/db');
const ReportModel = require('../models/reportModel');
const { buildExcelBuffer, buildPdfBuffer, buildCsv } = require('../services/reportExportService');

/* ═══════════════════════════════════════════════════════════════════════
   Reusable report-type configuration. Adding a new report later just means
   adding an entry here — no new branching in the controller/routes.
   ═══════════════════════════════════════════════════════════════════════ */
const USER_REPORT_TYPES = {
  learning: {
    label: 'Learning Progress Report',
    modelFn: ReportModel.getLearningProgressReport,
    columns: [
      { key: 'moduleName', label: 'Module Name' },
      { key: 'accessLevel', label: 'Access Level' },
      { key: 'progress', label: 'Progress (%)' },
      { key: 'status', label: 'Status' },
      { key: 'attempts', label: 'Attempts' },
      { key: 'startedDate', label: 'Started Date' },
      { key: 'completionDate', label: 'Completion Date' },
    ],
  },
  execution: {
    label: 'Code Execution Report',
    modelFn: ReportModel.getCodeExecutionReport,
    columns: [
      { key: 'executionDate', label: 'Execution Date' },
      { key: 'language', label: 'Language' },
      { key: 'dataStructure', label: 'Data Structure' },
      { key: 'status', label: 'Status' },
    ],
  },
  snippets: {
    label: 'Saved Snippets Report',
    modelFn: ReportModel.getSavedSnippetsReport,
    columns: [
      { key: 'snippetName', label: 'Snippet Name' },
      { key: 'language', label: 'Language' },
      { key: 'dataStructure', label: 'Data Structure' },
      { key: 'createdDate', label: 'Created Date' },
      { key: 'lastModified', label: 'Last Modified' },
    ],
  },
  payments: {
    label: 'Payment History Report',
    modelFn: ReportModel.getPaymentHistoryReport,
    columns: [
      { key: 'paymentDate', label: 'Payment Date' },
      { key: 'orderId', label: 'Order ID' },
      { key: 'plan', label: 'Plan' },
      { key: 'amount', label: 'Amount' },
      { key: 'discount', label: 'Discount' },
      { key: 'coinsRedeemed', label: 'Coins Redeemed' },
      { key: 'paymentMethod', label: 'Payment Method' },
      { key: 'status', label: 'Status' },
    ],
  },
  coins: {
    label: 'Coin Transaction Report',
    modelFn: ReportModel.getCoinTransactionReport,
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'transactionType', label: 'Transaction Type' },
      { key: 'coinsEarned', label: 'Coins Earned' },
      { key: 'coinsRedeemed', label: 'Coins Redeemed' },
      { key: 'balance', label: 'Balance' },
      { key: 'reference', label: 'Reference' },
    ],
  },
};

const ADMIN_REPORT_TYPES = {
  users: {
    label: 'User Report',
    modelFn: ReportModel.getUserReport,
    columns: [
      { key: 'userId', label: 'User ID' },
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'role', label: 'Role' },
      { key: 'plan', label: 'Plan' },
      { key: 'status', label: 'Status' },
      { key: 'registrationDate', label: 'Registration Date' },
      { key: 'lastLogin', label: 'Last Login' },
      { key: 'totalExecutions', label: 'Total Executions' },
      { key: 'savedSnippets', label: 'Saved Snippets' },
      { key: 'modulesCompleted', label: 'Modules Completed' },
      { key: 'coinBalance', label: 'Coin Balance' },
    ],
  },
  revenue: {
    label: 'Revenue & Payment Report',
    modelFn: ReportModel.getRevenuePaymentReport,
    columns: [
      { key: 'paymentDate', label: 'Payment Date' },
      { key: 'user', label: 'User' },
      { key: 'orderId', label: 'Order ID' },
      { key: 'plan', label: 'Plan' },
      { key: 'amount', label: 'Amount' },
      { key: 'discount', label: 'Discount' },
      { key: 'coinsRedeemed', label: 'Coins Redeemed' },
      { key: 'paymentMethod', label: 'Payment Method' },
      { key: 'status', label: 'Status' },
      { key: 'failureReason', label: 'Failure Reason' },
    ],
  },
  modules: {
    label: 'Module Performance Report',
    modelFn: ReportModel.getModulePerformanceReport,
    columns: [
      { key: 'module', label: 'Module' },
      { key: 'accessLevel', label: 'Access Level' },
      { key: 'usersStarted', label: 'Users Started' },
      { key: 'usersCompleted', label: 'Users Completed' },
      { key: 'completionRate', label: 'Completion Rate (%)' },
      { key: 'averageAttempts', label: 'Average Attempts' },
      { key: 'averageProgress', label: 'Average Progress (%)' },
    ],
  },
  executions: {
    label: 'Code Execution Analytics',
    modelFn: ReportModel.getExecutionAnalyticsReport,
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'language', label: 'Language' },
      { key: 'module', label: 'Module' },
      { key: 'totalExecutions', label: 'Total Executions' },
      { key: 'successful', label: 'Successful' },
      { key: 'failed', label: 'Failed' },
      { key: 'successRate', label: 'Success Rate (%)' },
    ],
  },
  activity: {
    label: 'User Activity Report',
    modelFn: ReportModel.getUserActivityReport,
    columns: [
      { key: 'dateTime', label: 'Date/Time' },
      { key: 'user', label: 'User' },
      { key: 'activity', label: 'Activity' },
      { key: 'module', label: 'Module' },
      { key: 'result', label: 'Result' },
    ],
  },
  feedback: {
    label: 'Feedback Report',
    modelFn: ReportModel.getFeedbackReport,
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'user', label: 'User' },
      { key: 'feedback', label: 'Feedback' },
      { key: 'status', label: 'Status' },
      { key: 'seenUnseen', label: 'Seen/Unseen' },
    ],
  },
  audit: {
    label: 'Audit Log Report',
    modelFn: ReportModel.getAuditLogReport,
    columns: [
      { key: 'dateTime', label: 'Date/Time' },
      { key: 'admin', label: 'Admin' },
      { key: 'action', label: 'Action' },
      { key: 'entity', label: 'Entity' },
      { key: 'entityId', label: 'Entity ID' },
      { key: 'result', label: 'Result' },
    ],
  },
  submissions: {
    label: 'Submission / Execution Report',
    modelFn: ReportModel.getSubmissionReport,
    columns: [
      { key: 'user', label: 'User' },
      { key: 'module', label: 'Module' },
      { key: 'language', label: 'Language' },
      { key: 'submissionDate', label: 'Submission Date' },
      { key: 'executionStatus', label: 'Execution Status' },
    ],
  },
};

const VALID_FORMATS = ['excel', 'pdf', 'csv'];
const MAX_PAGE_SIZE = 500;

function parseFilters(query, { paged }) {
  const filters = {};

  if (query.dateFrom) {
    const d = new Date(query.dateFrom);
    if (!isNaN(d.getTime())) filters.dateFrom = d;
  }
  if (query.dateTo) {
    const d = new Date(query.dateTo);
    if (!isNaN(d.getTime())) filters.dateTo = d;
  }
  if (query.module) filters.module = String(query.module);
  if (query.language) filters.language = String(query.language);
  if (query.status) filters.status = String(query.status);

  if (paged) {
    // On-screen preview: default to a reasonable page size when `page` is
    // requested at all; exports never paginate (full dataset always).
    if (query.page) {
      filters.page = Math.max(1, parseInt(query.page, 10) || 1);
      let pageSize = parseInt(query.pageSize, 10) || 25;
      pageSize = Math.min(Math.max(1, pageSize), MAX_PAGE_SIZE);
      filters.pageSize = pageSize;
    }
  }

  return filters;
}

async function logReportHistory({ userId, isAdminReport, reportType, reportName, format, recordCount, filters }) {
  try {
    const pool = await getPool();
    await pool.request()
      .input('UserId', sql.Int, userId)
      .input('IsAdminReport', sql.Bit, isAdminReport ? 1 : 0)
      .input('ReportType', sql.VarChar(50), reportType)
      .input('ReportName', sql.VarChar(200), reportName)
      .input('Format', sql.VarChar(10), format)
      .input('RecordCount', sql.Int, recordCount)
      .input('FiltersJson', sql.NVarChar(sql.MAX), JSON.stringify(filters || {}))
      .query(`
        INSERT INTO dbo.ReportHistory (UserId, IsAdminReport, ReportType, ReportName, Format, RecordCount, FiltersJson)
        VALUES (@UserId, @IsAdminReport, @ReportType, @ReportName, @Format, @RecordCount, @FiltersJson)
      `);
  } catch (err) {
    // Never let history logging break an actual download.
    console.error('Failed to write report history:', err.message);
  }
}

function contentTypeFor(format) {
  if (format === 'excel') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (format === 'pdf') return 'application/pdf';
  return 'text/csv';
}

function extensionFor(format) {
  if (format === 'excel') return 'xlsx';
  if (format === 'pdf') return 'pdf';
  return 'csv';
}

async function runExport({ req, res, config, type, isAdminReport }) {
  const format = String(req.query.format || '').toLowerCase();
  if (!VALID_FORMATS.includes(format)) {
    return res.status(400).json({ message: `Invalid format. Must be one of: ${VALID_FORMATS.join(', ')}` });
  }

  const filters = parseFilters(req.query, { paged: false }); // exports are always full/unpaged
  const args = isAdminReport ? [filters] : [req.user.userId, filters];
  const { rows, total } = await config.modelFn(...args);

  const summary = [
    { label: 'Report', value: config.label },
    { label: 'Records', value: total },
    { label: 'Generated On', value: new Date().toISOString() },
  ];

  let buffer;
  if (format === 'excel') {
    buffer = await buildExcelBuffer({ title: config.label, columns: config.columns, rows, summary });
  } else if (format === 'pdf') {
    buffer = await buildPdfBuffer({
      title: config.label,
      userName: req.user.fullName || req.user.email || `User #${req.user.userId}`,
      generatedAt: new Date().toISOString(),
      filtersApplied: filters,
      summary,
      columns: config.columns,
      rows,
    });
  } else {
    buffer = buildCsv({ columns: config.columns, rows });
  }

  await logReportHistory({
    userId: req.user.userId,
    isAdminReport,
    reportType: type,
    reportName: config.label,
    format,
    recordCount: total,
    filters,
  });

  const filename = `${type}-report-${new Date().toISOString().slice(0, 10)}.${extensionFor(format)}`;
  res.setHeader('Content-Type', contentTypeFor(format));
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

/* ═══════════════════════════════════════════════════════════════════════
   USER-SCOPED ENDPOINTS
   ═══════════════════════════════════════════════════════════════════════ */

async function getMySummary(req, res, next) {
  try {
    const summary = await ReportModel.getUserSummary(req.user.userId);
    res.json(summary);
  } catch (err) { next(err); }
}

async function getMyReportData(req, res, next) {
  try {
    const type = req.query.type;
    const config = USER_REPORT_TYPES[type];
    if (!config) {
      return res.status(400).json({ message: `Invalid report type. Must be one of: ${Object.keys(USER_REPORT_TYPES).join(', ')}` });
    }
    const filters = parseFilters(req.query, { paged: true });
    const { rows, total } = await config.modelFn(req.user.userId, filters);
    res.json({
      type, label: config.label, columns: config.columns,
      records: rows, total, generatedAt: new Date().toISOString(),
    });
  } catch (err) { next(err); }
}

async function exportMyReport(req, res, next) {
  try {
    const type = req.query.type;
    const config = USER_REPORT_TYPES[type];
    if (!config) {
      return res.status(400).json({ message: `Invalid report type. Must be one of: ${Object.keys(USER_REPORT_TYPES).join(', ')}` });
    }
    await runExport({ req, res, config, type, isAdminReport: false });
  } catch (err) { next(err); }
}

async function getMyReportHistory(req, res, next) {
  try {
    const pool = await getPool();
    const { recordset } = await pool.request()
      .input('UserId', sql.Int, req.user.userId)
      .query(`
        SELECT TOP 20 ReportId, ReportType, ReportName, Format, RecordCount, FiltersJson, CreatedAt
        FROM dbo.ReportHistory
        WHERE UserId = @UserId AND IsAdminReport = 0
        ORDER BY CreatedAt DESC
      `);
    res.json({ history: recordset });
  } catch (err) { next(err); }
}

/* ═══════════════════════════════════════════════════════════════════════
   ADMIN ENDPOINTS
   ═══════════════════════════════════════════════════════════════════════ */

async function getAdminSummary(req, res, next) {
  try {
    const summary = await ReportModel.getAdminSummary();
    res.json(summary);
  } catch (err) { next(err); }
}

async function getAdminReportData(req, res, next) {
  try {
    const type = req.query.type;
    const config = ADMIN_REPORT_TYPES[type];
    if (!config) {
      return res.status(400).json({ message: `Invalid report type. Must be one of: ${Object.keys(ADMIN_REPORT_TYPES).join(', ')}` });
    }
    const filters = parseFilters(req.query, { paged: true });
    const { rows, total } = await config.modelFn(filters);
    res.json({
      type, label: config.label, columns: config.columns,
      records: rows, total, generatedAt: new Date().toISOString(),
    });
  } catch (err) { next(err); }
}

async function exportAdminReport(req, res, next) {
  try {
    const type = req.query.type;
    const config = ADMIN_REPORT_TYPES[type];
    if (!config) {
      return res.status(400).json({ message: `Invalid report type. Must be one of: ${Object.keys(ADMIN_REPORT_TYPES).join(', ')}` });
    }
    await runExport({ req, res, config, type, isAdminReport: true });
  } catch (err) { next(err); }
}

// Scoped to the current admin's own generated history (not all admins') —
// consistent with "My Reports" being per-actor; can be broadened later if
// a cross-admin audit view is wanted.
async function getAdminReportHistory(req, res, next) {
  try {
    const pool = await getPool();
    const { recordset } = await pool.request()
      .input('UserId', sql.Int, req.user.userId)
      .query(`
        SELECT TOP 20 ReportId, ReportType, ReportName, Format, RecordCount, FiltersJson, CreatedAt
        FROM dbo.ReportHistory
        WHERE UserId = @UserId AND IsAdminReport = 1
        ORDER BY CreatedAt DESC
      `);
    res.json({ history: recordset });
  } catch (err) { next(err); }
}

module.exports = {
  USER_REPORT_TYPES,
  ADMIN_REPORT_TYPES,
  getMySummary,
  getMyReportData,
  exportMyReport,
  getMyReportHistory,
  getAdminSummary,
  getAdminReportData,
  exportAdminReport,
  getAdminReportHistory,
};
