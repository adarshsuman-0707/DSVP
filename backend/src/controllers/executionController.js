const { sql, getPool } = require('../config/db');
const { runCode }         = require('../services/compilerService');
const { buildTraceEvents } = require('../services/traceGeneratorService');

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
