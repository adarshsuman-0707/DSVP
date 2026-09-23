const { sql, getPool } = require('../config/db');
const { runCode }         = require('../services/compilerService');
const { buildTraceEvents } = require('../services/traceGeneratorService');
const CoinModel = require('../models/coinModel');

/**
 * POST /api/execution/run
 * body: { language, code, moduleSlug }
 *
 * Flow:
 * 1. Run code via Piston sandbox (compilerService)
 * 2. On compile/runtime error → return error details to frontend immediately
 * 3. On success → build visualization events (traceGeneratorService)
 * 4. Persist trace to DB
 * 5. Return events + userOutput to frontend
 */
async function runAndTrace(req, res, next) {
  try {
    const { language, code, moduleSlug = 'array' } = req.body;

    if (!language || !code) {
      return res.status(400).json({ message: 'language and code are required' });
    }

    /* ── 1. Execute ── */
    const runResult = await runCode({ language, code });

    /* ── 2. Errors ── */
    if (runResult.status !== 'success') {
      // Try to extract a line number from the error message so the
      // frontend can highlight the offending line in the editor.
      const errorLine = extractErrorLine(runResult.errorMessage, language);

      // Even on runtime error there may be partial trace steps
      const partialEvents = runResult.trace?.steps?.length
        ? buildTraceEvents({
            language,
            rawTrace:   runResult.trace,
            moduleSlug,
            userOutput: runResult.trace.userOutput || '',
          })
        : [];

      return res.status(200).json({
        status:       runResult.status,   // 'compile_error' | 'runtime_error'
        errorMessage: runResult.errorMessage,
        errorLine,
        events:       partialEvents,
        userOutput:   runResult.rawOutput || '',
      });
    }

    /* ── 3. Build events ── */
    const events = buildTraceEvents({
      language,
      rawTrace:   runResult.trace,
      moduleSlug,
      userOutput: runResult.trace.userOutput || '',
    });

    /* ── 4. Persist (best-effort — don't fail the request if DB is down) ── */
    try {
      const pool = await getPool();

      // Resolve moduleSlug → ModuleId
      let moduleId = null;
      if (moduleSlug) {
        const modResult = await pool.request()
          .input('Slug', sql.NVarChar(100), moduleSlug)
          .query('SELECT ModuleId FROM dbo.Modules WHERE Slug = @Slug');
        if (modResult.recordset.length > 0) {
          moduleId = modResult.recordset[0].ModuleId;
        }
      }

      await pool
        .request()
        .input('UserId',          sql.Int,                req.user.userId)
        .input('ModuleId',        sql.Int,                moduleId)
        .input('Language',        sql.VarChar(20),        language)
        .input('SourceCode',      sql.NVarChar(sql.MAX),  code)
        .input('TraceEventsJson', sql.NVarChar(sql.MAX),  JSON.stringify(events))
        .input('Status',          sql.VarChar(20),        'success')
        .query(`
          INSERT INTO dbo.ExecutionTraces
            (UserId, ModuleId, Language, SourceCode, TraceEventsJson, Status)
          VALUES
            (@UserId, @ModuleId, @Language, @SourceCode, @TraceEventsJson, @Status)
        `);
    } catch (dbErr) {
      console.error('[executionController] DB persist failed (non-fatal):', dbErr.message);
    }

    // First clean (error-free) run of THIS module earns a one-time bonus —
    // dedup key is the module slug itself, so re-running the same module
    // doesn't farm coins, but trying a new module each time does.
    let justCompletedModule = false;
    if (moduleSlug) {
      try {
        const already = await CoinModel.hasEarnedFor(req.user.userId, 'module_complete', moduleSlug);
        if (!already) {
          await CoinModel.earn(req.user.userId, 10, 'module_complete', moduleSlug);
          justCompletedModule = true;
        }
      } catch (coinErr) {
        console.error('[executionController] coin award failed (non-fatal):', coinErr.message);
      }
    }

    // Track per-user module progress (dbo.UserProgress) so Reports/admin
    // views have real data instead of an always-empty table. "Started" =
    // at least one successful run of the module; "completed" reuses the
    // exact same first-clean-run signal that already earns the
    // 'module_complete' coin bonus above, rather than inventing a separate
    // completion criteria the rest of the app doesn't otherwise have.
    try {
      const pool2 = await getPool();
      let progModuleId = null;
      if (moduleSlug) {
        const modResult = await pool2.request()
          .input('Slug', sql.NVarChar(100), moduleSlug)
          .query('SELECT ModuleId FROM dbo.Modules WHERE Slug = @Slug');
        if (modResult.recordset.length > 0) progModuleId = modResult.recordset[0].ModuleId;
      }
      if (progModuleId) {
        const existing = await pool2.request()
          .input('UserId', sql.Int, req.user.userId)
          .input('ModuleId', sql.Int, progModuleId)
          .query(`
            SELECT TOP 1 ProgressId, Status, CompletionPct FROM dbo.UserProgress
            WHERE UserId = @UserId AND ModuleId = @ModuleId AND ProblemId IS NULL
          `);

        const newStatus = justCompletedModule
          ? 'completed'
          : (existing.recordset[0]?.Status === 'completed' ? 'completed' : 'in_progress');
        const newPct = newStatus === 'completed'
          ? 100
          : Math.max(existing.recordset[0]?.CompletionPct || 0, 50);

        if (existing.recordset.length > 0) {
          await pool2.request()
            .input('ProgressId', sql.Int, existing.recordset[0].ProgressId)
            .input('Status', sql.VarChar(20), newStatus)
            .input('CompletionPct', sql.Int, newPct)
            .query(`
              UPDATE dbo.UserProgress
              SET Status = @Status, CompletionPct = @CompletionPct, LastAccessedAt = SYSUTCDATETIME()
              WHERE ProgressId = @ProgressId
            `);
        } else {
          await pool2.request()
            .input('UserId', sql.Int, req.user.userId)
            .input('ModuleId', sql.Int, progModuleId)
            .input('Status', sql.VarChar(20), newStatus)
            .input('CompletionPct', sql.Int, newPct)
            .query(`
              INSERT INTO dbo.UserProgress (UserId, ModuleId, ProblemId, Status, CompletionPct, LastAccessedAt)
              VALUES (@UserId, @ModuleId, NULL, @Status, @CompletionPct, SYSUTCDATETIME())
            `);
        }
      }
    } catch (progErr) {
      console.error('[executionController] progress tracking failed (non-fatal):', progErr.message);
    }

    /* ── 5. Respond ── */
    res.json({
      status:     'success',
      events,
      userOutput: runResult.trace.userOutput || '',
    });

  } catch (err) {
    next(err);
  }
}

/**
 * Attempt to parse a 1-based line number from a compiler/runtime error string.
 * Returns null if none found.
 *
 * Patterns covered:
 *   Python   : "  File \"main.py\", line 7"  or "line 7"
 *   C/C++    : "main.c:7:" or "main.cpp:7:"
 *   Java     : "Main.java:7:"
 *   C#       : "(7,"  or  "main.cs(7,"
 */
function extractErrorLine(errorMessage, language) {
  if (!errorMessage) return null;

  const patterns = [
    /line (\d+)/i,                          // Python, generic
    /\.(?:c|cpp|java|cs|py):(\d+):/i,       // C, C++, Java, C#
    /\((\d+),\s*\d+\)/,                     // C# (line,col)
    /:(\d+):\d+:/,                           // gcc/clang "file:line:col:"
  ];

  for (const re of patterns) {
    const m = errorMessage.match(re);
    if (m) {
      const line = parseInt(m[1], 10);
      if (!isNaN(line) && line > 0) return line;
    }
  }
  return null;
}

module.exports = { runAndTrace };
