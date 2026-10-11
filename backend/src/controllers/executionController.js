const { sql, getPool } = require('../config/db');
const { runCode }         = require('../services/compilerService');
const { buildTraceEvents, buildFailureEvent } = require('../services/traceGeneratorService');
const CoinModel = require('../models/coinModel');
const { validateRunRequest, sanitizeForClient } = require('../services/executionGuard');
const { buildHeapEvents } = require('../services/heap/heapReconstructor');

const HEAP_SLUG = 'heap';

/** What the Heap module can and cannot observe, in words a learner can act on. */
function heapUnsupportedMessage(reason, { language, code, info }) {
  if (reason === 'too-large') {
    return `The heap array has ${info.maxLen} elements; the visualizer supports up to 256. Use a smaller input.`;
  }
  const usesPQ = language === 'java' ? /\bPriorityQueue\b/.test(code) : /\b(PriorityQueue|queue\.PriorityQueue)\b/.test(code);
  return [
    'The program ran, but no array-based heap was observed.',
    usesPQ
      ? 'PriorityQueue hides its internal array, so it cannot be traced. Write the heap yourself with an array or list (heapq is supported in Python).'
      : 'The tracer follows heaps stored in a Python list or a Java array / ArrayList (comparisons with < <= > >=, writes, append/pop/add/remove).',
    'Make sure the program inserts into or rearranges a heap, and that comparisons use the heap\'s own elements. '
      + 'Heaps built from linked nodes (left/right pointers) are not supported by this module.',
  ].join('\n');
}

/** Last source line the program reached (for pointing at a runtime failure). */
function lastHeapLine(rawSteps) {
  for (let i = rawSteps.length - 1; i >= 0; i--) {
    const s = rawSteps[i];
    if (s.op === 'hp_err' && Number.isInteger(s.line) && s.line > 0) return s.line;
  }
  for (let i = rawSteps.length - 1; i >= 0; i--) {
    const s = rawSteps[i];
    if (Number.isInteger(s.line) && s.line > 0) return s.line;
  }
  return null;
}

/**
 * Best-effort insert into dbo.ExecutionTraces for one run (success or
 * compile/runtime error). Never throws — a DB hiccup must not fail the run.
 */
async function persistTrace({ userId, moduleSlug, language, code, events, status, errorMessage = null }) {
  try {
    const pool = await getPool();

    let moduleId = null;
    if (moduleSlug) {
      const modResult = await pool.request()
        .input('Slug', sql.NVarChar(100), moduleSlug)
        .query('SELECT ModuleId FROM dbo.Modules WHERE Slug = @Slug');
      if (modResult.recordset.length > 0) moduleId = modResult.recordset[0].ModuleId;
    }

    await pool.request()
      .input('UserId',          sql.Int,               userId)
      .input('ModuleId',        sql.Int,               moduleId)
      .input('Language',        sql.VarChar(20),       language)
      .input('SourceCode',      sql.NVarChar(sql.MAX), code)
      .input('TraceEventsJson', sql.NVarChar(sql.MAX), JSON.stringify(events || []))
      .input('Status',          sql.VarChar(20),       status)
      .input('ErrorMessage',    sql.NVarChar(sql.MAX), errorMessage)
      .query(`
        INSERT INTO dbo.ExecutionTraces
          (UserId, ModuleId, Language, SourceCode, TraceEventsJson, Status, ErrorMessage)
        VALUES
          (@UserId, @ModuleId, @Language, @SourceCode, @TraceEventsJson, @Status, @ErrorMessage)
      `);
  } catch (dbErr) {
    console.error('[executionController] DB persist failed (non-fatal):', dbErr.message);
  }
}

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
    const check = validateRunRequest(req.body);
    if (!check.ok) {
      return res.status(400).json({ message: check.message });
    }
    const { language, code, moduleSlug, stdin } = check.value;
    const isHeap = moduleSlug === HEAP_SLUG;

    // A client that goes away (Stop button, a newer run, closed tab) must not leave
    // its child process running: abort kills it.
    const abort = new AbortController();
    res.on('close', () => { if (!res.writableEnded) abort.abort(); });

    /* ── 1. Execute ── */
    const runResult = await runCode({ language, code, moduleSlug, stdin, signal: abort.signal });
    if (runResult.status === 'cancelled') return;     // nobody is listening any more

    if (isHeap && runResult.status === 'unsupported_implementation') {
      return res.status(200).json({
        status: 'unsupported_implementation', errorMessage: runResult.errorMessage, errorLine: null, events: [], userOutput: '',
      });
    }

    /* ── 2. Errors ── */
    if (runResult.status !== 'success') {
      // Try to extract a line number from the error message so the
      // frontend can highlight the offending line in the editor.
      let errorLine = extractErrorLine(runResult.errorMessage, language);

      // A Java RUNTIME exception reports a line in the instrumented Main.java
      // (shim + injected trace calls), which doesn't match the user's source.
      // The last traced 'line' step is the statement that was about to run
      // when it threw, expressed in the user's own line numbers.
      if (language === 'java' && runResult.status === 'runtime_error') {
        const steps = runResult.trace?.steps || [];
        for (let i = steps.length - 1; i >= 0; i--) {
          if (steps[i].op === 'line' && Number.isInteger(steps[i].line) && steps[i].line > 0) {
            errorLine = steps[i].line;
            break;
          }
        }
      }

      // Even on runtime error there may be partial trace steps
      let heapInfo = null;
      let partialEvents;
      if (isHeap) {
        const h = runResult.trace?.steps?.length ? buildHeapEvents(runResult.trace.steps) : { events: [] };
        partialEvents = h.events || [];
        heapInfo = h.info || null;
        // Java runtime exceptions report lines of the instrumented file; the last observed line is the user's own.
        if (language === 'java' && runResult.status === 'runtime_error' && runResult.trace?.steps?.length) {
          errorLine = lastHeapLine(runResult.trace.steps) || errorLine;
        }
      } else {
        partialEvents = runResult.trace?.steps?.length
          ? buildTraceEvents({
              language,
              rawTrace:   runResult.trace,
              moduleSlug,
              userOutput: runResult.trace.userOutput || '',
            })
          : [];
      }

      // Stack/Queue: turn EmptyStackException & co. into an explicit
      // UNDERFLOW/OVERFLOW step so the UI halts on the failing operation.
      if (runResult.status === 'runtime_error' || (partialEvents.length > 0 && /IndexError|EmptyStack|NoSuchElement/.test(runResult.errorMessage || ''))) {
        const failEvt = buildFailureEvent({
          moduleSlug,
          errorMessage: runResult.errorMessage,
          lastEvent: [...partialEvents].reverse().find(e => e.sqState) || partialEvents[partialEvents.length - 1],
        });
        if (failEvt) {
          failEvt.step = partialEvents.length + 1;
          failEvt.sqEvent.step = failEvt.step;
          partialEvents.push(failEvt);
        }
      }

      // Failed runs are logged too, so admins can see errors under a user's
      // Submissions / Activity (best-effort, never blocks the response).
      await persistTrace({
        userId:       req.user.userId,
        moduleSlug,
        language,
        code,
        events:       partialEvents,
        status:       runResult.status === 'compile_error' ? 'compile_error' : 'runtime_error',
        errorMessage: runResult.errorMessage || runResult.rawOutput || null,
      });

      return res.status(200).json({
        status:       runResult.status,   // 'compile_error' | 'runtime_error'
        errorMessage: runResult.errorMessage,
        errorLine,
        events:       partialEvents,
        userOutput:   sanitizeForClient(runResult.rawOutput || ''),
        ...(heapInfo ? { heapInfo } : {}),
      });
    }

    /* ── 3. Build events ── */
    let events;
    let heapInfo = null;
    if (isHeap) {
      const h = buildHeapEvents(runResult.trace.steps || []);
      if (h.error || !h.events.length) {
        // The program ran fine; the module just could not see a heap in it. Say so plainly.
        return res.status(200).json({
          status: 'unsupported_implementation',
          errorMessage: heapUnsupportedMessage(h.error || 'no-heap-array', { language, code, info: { maxLen: h.maxLen } }),
          errorLine: null,
          events: [],
          userOutput: sanitizeForClient(runResult.trace.userOutput || ''),
        });
      }
      events = h.events;
      heapInfo = { ...h.info, traceTruncated: !!runResult.trace.truncated || h.info.truncated };
    } else {
      events = buildTraceEvents({
        language,
        rawTrace:   runResult.trace,
        moduleSlug,
        userOutput: runResult.trace.userOutput || '',
      });
    }

    /* ── 4. Persist (best-effort — don't fail the request if DB is down) ── */
    await persistTrace({
      userId: req.user.userId, moduleSlug, language, code, events, status: 'success',
    });

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
      userOutput: sanitizeForClient(runResult.trace.userOutput || ''),
      traceTruncated: !!runResult.trace.truncated,
      ...(heapInfo ? { heapInfo } : {}),
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
