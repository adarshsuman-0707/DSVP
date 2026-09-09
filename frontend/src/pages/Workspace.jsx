import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import CodeEditor from '../components/Editor/CodeEditor';
import VisualizationCanvas from '../components/Visualization/VisualizationCanvas';
import PlaybackBar from '../components/PlaybackBar/PlaybackBar';
import { runCode } from '../services/api';
import { saveCodeHistory, getCodeHistory, loadCodeHistory, deleteCodeHistory } from '../services/api';
import { Modal, FormField, Input, Btn } from '../components/AdminDashboard/ui';

const LANGUAGES = ['python', 'cpp', 'java', 'c', 'csharp'];
const LANG_LABELS = { python: 'Python', cpp: 'C++', java: 'Java', c: 'C', csharp: 'C#' };

const MODULES = [
  { slug: 'array',       label: 'Array'       },
  { slug: 'linked-list', label: 'Linked List' },
  { slug: 'stack',       label: 'Stack'       },
  { slug: 'queue',       label: 'Queue'       },
];

/* ── Starter code snippets per language ── */
const STARTER = {
  python: `# Array module — starter example
# Use Array() to create a traced array.
# Supports: arr[i] = v   (write)
#           arr[i]        (read)
#           arr.swap(i,j) (swap)
#           Array(size)   (init)

arr = Array(5)          # create array of size 5

for i in range(5):
    arr[i] = (i + 1) * 10  # fill: 10, 20, 30, 40, 50

arr.swap(0, 4)          # swap first and last
arr[2] = 99             # overwrite middle
val = arr[1]            # read index 1
print("Done! arr[1] =", val)
`,

  cpp: `// Array module — starter example
// Use DSVPArray to get a traced array.
// DSVPArray arr(5);       -- init size 5, fill 0
// arr.set(i, v)           -- write
// arr[i]                  -- read  (also traces)
// arr.swap_at(i, j)       -- swap

int main() {
    DSVPArray arr(5);

    for (int i = 0; i < arr.size(); i++)
        arr.set(i, (i + 1) * 10);  // 10 20 30 40 50

    arr.swap_at(0, 4);   // swap first and last
    arr.set(2, 99);      // overwrite index 2
    int v = arr[1];      // read index 1
    return 0;
}
`,

  java: `// Array module — starter example
// DSVPArray is pre-defined for you.
// new DSVPArray(size)   — init
// arr.set(i, v)         — write
// arr.get(i)            — read
// arr.swap(i, j)        — swap

public class Main {
    public static void main(String[] args) {
        DSVPArray arr = new DSVPArray(5);

        for (int i = 0; i < arr.size(); i++)
            arr.set(i, (i + 1) * 10);  // 10 20 30 40 50

        arr.swap(0, 4);        // swap first and last
        arr.set(2, 99);        // overwrite index 2
        int v = arr.get(1);    // read index 1
        System.out.println("Done! arr[1] = " + v);
    }
}
`,

  c: `// Array module — starter example
// DSVPArray is pre-defined via the shim.
// Array(size)           — init
// arr_set(&a, i, v)     — write
// arr_get(&a, i)        — read
// arr_swap(&a, i, j)    — swap

int main() {
    DSVPArray arr = Array(5);

    for (int i = 0; i < arr.size; i++)
        arr_set(&arr, i, (i + 1) * 10);  // 10 20 30 40 50

    arr_swap(&arr, 0, 4);   // swap first and last
    arr_set(&arr, 2, 99);   // overwrite index 2
    int v = arr_get(&arr, 1); // read index 1
    return 0;
}
`,

  csharp: `// Array module — starter example
// DSVPArray is pre-defined for you.
// new DSVPArray(size)   — init
// arr.Set(i, v)         — write
// arr.Get(i)            — read
// arr.Swap(i, j)        — swap

class Main {
    static void Main() {
        var arr = new DSVPArray(5);

        for (int i = 0; i < arr.Length; i++)
            arr.Set(i, (i + 1) * 10);  // 10 20 30 40 50

        arr.Swap(0, 4);        // swap first and last
        arr.Set(2, 99);        // overwrite index 2
        int v = arr.Get(1);    // read index 1
        System.Console.WriteLine("Done! arr[1] = " + v);
    }
}
`,
};

export default function Workspace() {
  const [searchParams]                  = useSearchParams();
  const navigate                        = useNavigate();
  const initialSlug                     = searchParams.get('module') || 'array';

  const [language, setLanguage]         = useState('python');
  const [moduleSlug, setModuleSlug]     = useState(initialSlug);
  const [code, setCode]                 = useState(STARTER['python']);
  const [events, setEvents]             = useState([]);
  const [stepIndex, setStepIndex]       = useState(0);
  const [isPlaying, setIsPlaying]       = useState(false);
  const [speed, setSpeed]               = useState(1);
  const [errorMessage, setErrorMessage] = useState('');
  const [errorLine, setErrorLine]       = useState(null);
  const [running, setRunning]           = useState(false);
  const [userOutput, setUserOutput]     = useState('');
  const intervalRef                     = useRef(null);

  // Code history state
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [historyOpen, setHistoryOpen]     = useState(false);
  const [history, setHistory]             = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  /* Load code history on mount and when module changes */
  useEffect(() => {
    loadHistory();
  }, [moduleSlug]);

  async function loadHistory() {
    try {
      setLoadingHistory(true);
      const res = await getCodeHistory({ moduleSlug, limit: 50 });
      setHistory(res.data.history || []);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoadingHistory(false);
    }
  }

  /* Update starter code when language changes */
  function handleLanguageChange(lang) {
    setLanguage(lang);
    setCode(STARTER[lang] || '');
    clearRun();
  }

  /* Reset run state */
  function clearRun() {
    setEvents([]);
    setStepIndex(0);
    setIsPlaying(false);
    setErrorMessage('');
    setErrorLine(null);
    setUserOutput('');
  }

  /* Auto-advance playback */
  useEffect(() => {
    clearInterval(intervalRef.current);
    if (isPlaying && events.length > 0) {
      intervalRef.current = setInterval(() => {
        setStepIndex(i => {
          if (i >= events.length - 1) { setIsPlaying(false); return i; }
          return i + 1;
        });
      }, Math.round(400 / speed));
    }
    return () => clearInterval(intervalRef.current);
  }, [isPlaying, speed, events]);

  /* Keyboard controls */
  useEffect(() => {
    function onKey(e) {
      // Don't hijack keys when focus is inside the Monaco editor textarea
      if (e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Space' && events.length > 0) {
        e.preventDefault();
        setIsPlaying(p => !p);
      }
      if (e.code === 'ArrowRight') setStepIndex(i => Math.min(i + 1, events.length - 1));
      if (e.code === 'ArrowLeft')  setStepIndex(i => Math.max(i - 1, 0));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [events]);

  async function handleRun() {
    clearRun();
    setRunning(true);
    try {
      const res = await runCode({ language, code, moduleSlug });
      const data = res.data;

      if (data.status !== 'success') {
        setErrorMessage(data.errorMessage || 'Execution failed.');
        setErrorLine(data.errorLine || null);
        /* Show partial events even on runtime error */
        if (data.events?.length) {
          setEvents(data.events);
          setStepIndex(0);
        }
        return;
      }

      setEvents(data.events || []);
      setUserOutput(data.userOutput || '');
      setStepIndex(0);
      /* Auto-play after a short delay so UI settles */
      setTimeout(() => setIsPlaying(true), 300);
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Could not reach execution service.');
    } finally {
      setRunning(false);
    }
  }

  const currentEvent = events[stepIndex] ?? null;

  // Editor highlight: every event (array or execution) now carries
  // `currentLine` from traceGenerator.js — no more guessing via `.line`.
  const editorCurrentLine = currentEvent?.currentLine ?? null;

  // For the playback bar, count only "meaningful" events (skip bare
  // line-trace events, which exist purely to drive the editor highlight
  // and the variables panel — they'd make the step counter too noisy).
  // Precompute original-index -> meaningful-rank once per events change,
  // O(n) instead of the previous O(n^2) indexOf-in-a-loop approach.
  const meaningfulOriginalIndices = events.reduce((acc, e, idx) => {
    if (e.type !== 'line') acc.push(idx);
    return acc;
  }, []);
  const meaningfulRank = meaningfulOriginalIndices.findIndex(idx => idx >= stepIndex);
  const displayStep  = meaningfulRank >= 0 ? meaningfulRank + 1 : (meaningfulOriginalIndices.length || stepIndex + 1);
  const displayTotal = meaningfulOriginalIndices.length || events.length;

  /* Save code handler */
  async function handleSaveCode(title) {
    try {
      await saveCodeHistory({
        title,
        language,
        code,
        moduleSlug,
      });
      setSaveModalOpen(false);
      await loadHistory();
      return true;
    } catch (err) {
      console.error('Failed to save code:', err);
      return false;
    }
  }

  /* Load code from history */
  async function handleLoadCode(snippetId) {
    try {
      const res = await loadCodeHistory(snippetId);
      const snippet = res.data.snippet;
      setCode(snippet.Code);
      setLanguage(snippet.Language);
      if (snippet.ModuleSlug && snippet.ModuleSlug !== moduleSlug) {
        setModuleSlug(snippet.ModuleSlug);
      }
      clearRun();
      setHistoryOpen(false); // Close history sidebar after loading
    } catch (err) {
      console.error('Failed to load code:', err);
      alert('Failed to load code. Please try again.');
    }
  }

  /* Delete code from history */
  async function handleDeleteCode(snippetId) {
    if (!confirm('Are you sure you want to delete this saved code?')) return;
    try {
      await deleteCodeHistory(snippetId);
      await loadHistory();
    } catch (err) {
      console.error('Failed to delete code:', err);
    }
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      fontFamily: "'Inter', system-ui, sans-serif", background: '#0d1117',
    }}>

      {/* ── TOP BAR ── */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '0 16px', height: 52, flexShrink: 0,
        background: '#161b22',
        borderBottom: '1px solid rgba(255,255,255,.08)',
      }}>
        <button onClick={() => navigate('/dashboard')} style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#8b949e', fontSize: 13, padding: '4px 8px',
          borderRadius: 6, transition: 'color 150ms',
        }}
          onMouseEnter={e => { e.currentTarget.style.color = '#e6edf3'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#8b949e'; }}
        >← Dashboard</button>

        <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,.1)' }} />

        {/* Language selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={labelStyle}>Lang</span>
          <select
            value={language}
            onChange={e => handleLanguageChange(e.target.value)}
            disabled={isPlaying}
            style={selectStyle}
          >
            {LANGUAGES.map(l => <option key={l} value={l}>{LANG_LABELS[l]}</option>)}
          </select>
        </div>

        {/* Module selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={labelStyle}>Module</span>
          <select
            value={moduleSlug}
            onChange={e => { setModuleSlug(e.target.value); clearRun(); }}
            style={selectStyle}
          >
            {MODULES.map(m => <option key={m.slug} value={m.slug}>{m.label}</option>)}
          </select>
        </div>

        <div style={{ flex: 1 }} />

        {/* History toggle button */}
        <button
          onClick={() => setHistoryOpen(!historyOpen)}
          title="Code History"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
            color: historyOpen ? '#2E74B5' : '#8b949e',
            border: historyOpen ? '1px solid #2E74B5' : '1px solid rgba(255,255,255,.1)',
            background: historyOpen ? 'rgba(46,116,181,.1)' : 'transparent',
            cursor: 'pointer', transition: 'all 150ms',
          }}
        >
          📜 History
        </button>

        {/* Save button */}
        <button
          onClick={() => setSaveModalOpen(true)}
          disabled={!code.trim()}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
            color: '#fff', border: 'none',
            cursor: !code.trim() ? 'not-allowed' : 'pointer',
            background: !code.trim()
              ? 'rgba(139,148,158,.35)'
              : 'linear-gradient(135deg,#F2A93B,#E15759)',
            opacity: !code.trim() ? 0.5 : 1,
            transition: 'all 150ms',
          }}
        >
          💾 Save
        </button>

        {/* Step counter */}
        {events.length > 0 && (
          <span style={{ fontSize: 12, color: '#8b949e', fontWeight: 500 }}>
            Step {displayStep} / {displayTotal}
          </span>
        )}

        {/* Run button */}
        <button
          onClick={handleRun}
          disabled={running}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700,
            color: '#fff', border: 'none',
            cursor: running ? 'not-allowed' : 'pointer',
            background: running
              ? 'rgba(76,175,80,.35)'
              : 'linear-gradient(135deg,#4CAF50,#2E74B5)',
            boxShadow: running ? 'none' : '0 2px 10px rgba(76,175,80,.35)',
            transition: 'all 150ms',
          }}
        >
          {running ? <><SpinnerIcon /> Running…</> : <>▶ Run</>}
        </button>
      </header>

      {/* ── SPLIT SCREEN ── */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>

        {/* Editor panel */}
        <EditorPanel
          language={language}
          code={code}
          setCode={setCode}
          editorCurrentLine={editorCurrentLine}
          errorLine={errorLine}
          errorMessage={errorMessage}
          onDismissError={() => setErrorMessage('')}
          isPlaying={isPlaying}
        />

        {/* Visualization panel */}
        <VisualizationPanel
          moduleSlug={moduleSlug}
          currentEvent={currentEvent}
          totalSteps={events.length}
          allEvents={events}
          currentStep={stepIndex}
        />

        {/* History sidebar */}
        {historyOpen && (
          <HistorySidebar
            history={history}
            loading={loadingHistory}
            onLoad={handleLoadCode}
            onDelete={handleDeleteCode}
            onClose={() => setHistoryOpen(false)}
          />
        )}
      </div>

      {/* ── PLAYBACK BAR ── */}
      <PlaybackBar
        currentStep={stepIndex + 1}
        totalSteps={events.length}
        isPlaying={isPlaying}
        speed={speed}
        onPlayPause={() => setIsPlaying(p => !p)}
        onStep={delta => setStepIndex(i => Math.min(Math.max(i + delta, 0), events.length - 1))}
        onScrub={step  => setStepIndex(step - 1)}
        onSpeedChange={setSpeed}
        displayStep={displayStep}
        displayTotal={displayTotal}
      />

      {/* Save code modal */}
      <SaveCodeModal
        open={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        onSave={handleSaveCode}
      />
    </div>
  );
}

/* ── tiny shared style pieces ── */
const labelStyle = {
  fontSize: 10, fontWeight: 700, color: '#8b949e',
  textTransform: 'uppercase', letterSpacing: '.06em',
};
const selectStyle = {
  background: '#21262d', border: '1px solid rgba(255,255,255,.1)',
  color: '#e6edf3', borderRadius: 6, padding: '5px 10px',
  fontSize: 13, cursor: 'pointer', outline: 'none',
};

function PanelLabel({ children }) {
  return (
    <div style={{
      padding: '5px 16px', background: '#161b22',
      borderBottom: '1px solid rgba(255,255,255,.06)',
      fontSize: 10, fontWeight: 700, color: '#8b949e',
      textTransform: 'uppercase', letterSpacing: '.06em',
      flexShrink: 0,
    }}>{children}</div>
  );
}

function SpinnerIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5"
      style={{ animation: 'spin 0.7s linear infinite' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

/* ── Resizable Panels ── */
function EditorPanel({ language, code, setCode, editorCurrentLine, errorLine, errorMessage, onDismissError, isPlaying }) {
  const [editorWidth, setEditorWidth] = useState(50); // Percentage
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e) => {
      if (!containerRef.current) return;
      const parentRect = containerRef.current.parentElement.getBoundingClientRect();
      const newWidth = ((e.clientX - parentRect.left) / parentRect.width) * 100;
      setEditorWidth(Math.max(20, Math.min(80, newWidth)));
    };

    const handleMouseUp = () => setIsResizing(false);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  return (
    <>
      <div
        ref={containerRef}
        style={{
          width: `${editorWidth}%`,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          userSelect: isResizing ? 'none' : 'auto',
        }}
      >
        <PanelLabel>Editor</PanelLabel>
        <CodeEditor
          language={language}
          value={code}
          onChange={v => { setCode(v ?? ''); }}
          currentLine={editorCurrentLine}
          errorLine={errorLine}
          errorMessage={errorMessage}
          onDismissError={onDismissError}
          disabled={isPlaying}
        />
      </div>

      {/* Vertical Resize Handle */}
      <div
        onMouseDown={() => setIsResizing(true)}
        style={{
          width: 4,
          cursor: 'col-resize',
          background: isResizing ? 'rgba(76,175,80,.5)' : 'rgba(255,255,255,.07)',
          transition: isResizing ? 'none' : 'background 150ms ease',
          position: 'relative',
          flexShrink: 0,
          zIndex: 10,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 20,
            height: 40,
            background: isResizing ? 'rgba(76,175,80,.3)' : 'transparent',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            color: '#8b949e',
          }}
        >
          ⋮
        </div>
      </div>
    </>
  );
}

function VisualizationPanel({ moduleSlug, currentEvent, totalSteps, allEvents, currentStep }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <PanelLabel>Visualization</PanelLabel>
      <div style={{ flex: 1, minHeight: 0 }}>
        <VisualizationCanvas
          moduleSlug={moduleSlug}
          event={currentEvent}
          totalSteps={totalSteps}
          allEvents={allEvents}
          currentStep={currentStep + 1}
        />
      </div>
    </div>
  );
}

/* ── Save Code Modal ── */
function SaveCodeModal({ open, onClose, onSave }) {
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setTitle('');
      setError('');
    }
  }, [open]);

  async function handleSave() {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    if (title.length > 200) {
      setError('Title must be 200 characters or less');
      return;
    }
    setSaving(true);
    const success = await onSave(title.trim());
    setSaving(false);
    if (success) {
      setTitle('');
      setError('');
    } else {
      setError('Failed to save code');
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Save Code" width={480}>
      <FormField label={`Title (${title.length}/200)`} error={error}>
        <Input
          value={title}
          onChange={setTitle}
          placeholder="Give your code a descriptive title"
          maxLength={200}
          disabled={saving}
          onKeyPress={e => { if (e.key === 'Enter') handleSave(); }}
        />
      </FormField>
      <div style={{
        display: 'flex', gap: 10, justifyContent: 'flex-end',
        paddingTop: 16, borderTop: '1px solid #e2e8f0', marginTop: 8,
      }}>
        <Btn variant="ghost" onClick={onClose} disabled={saving}>Cancel</Btn>
        <Btn variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Code'}
        </Btn>
      </div>
    </Modal>
  );
}

/* ── History Sidebar ── */
function HistorySidebar({ history, loading, onLoad, onDelete, onClose }) {
  const [copiedId, setCopiedId] = useState(null);
  const [loadingCopy, setLoadingCopy] = useState(null);

  async function handleCopy(snippet) {
    try {
      setLoadingCopy(snippet.SnippetId);
      // Fetch full code if not available
      let codeText = snippet.Code;
      if (!codeText) {
        const res = await loadCodeHistory(snippet.SnippetId);
        codeText = res.data.snippet.Code;
      }
      await navigator.clipboard.writeText(codeText || '');
      setCopiedId(snippet.SnippetId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      alert('Failed to copy code');
    } finally {
      setLoadingCopy(null);
    }
  }

  return (
    <aside style={{
      width: 320, flexShrink: 0, background: '#161b22',
      borderLeft: '1px solid rgba(255,255,255,.08)',
      display: 'flex', flexDirection: 'column',
      position: 'absolute', right: 0, top: 0, bottom: 0,
      zIndex: 100, boxShadow: '-4px 0 12px rgba(0,0,0,.3)',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#0d1117',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>📜</span>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#e6edf3', margin: 0 }}>
            Code History
          </h3>
        </div>
        <button onClick={onClose} style={{
          width: 24, height: 24, borderRadius: 6, border: '1px solid rgba(255,255,255,.1)',
          background: 'rgba(255,255,255,.05)', cursor: 'pointer',
          color: '#8b949e', fontSize: 14, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>✕</button>
      </div>

      {/* History list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#8b949e' }}>
            Loading...
          </div>
        ) : history.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📝</div>
            <p style={{ fontSize: 13, color: '#8b949e', margin: 0 }}>
              No saved code yet
            </p>
          </div>
        ) : (
          history.map(item => (
            <div key={item.SnippetId} style={{
              background: '#21262d', border: '1px solid rgba(255,255,255,.08)',
              borderRadius: 10, padding: '12px', marginBottom: 10,
              transition: 'all 150ms',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(46,116,181,.5)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.08)'; }}
            >
              <div style={{ marginBottom: 8 }}>
                <div style={{
                  fontSize: 13, fontWeight: 600, color: '#e6edf3',
                  marginBottom: 4, lineHeight: 1.4,
                  overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>{item.Title}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: 10, padding: '2px 6px', borderRadius: 4,
                    background: 'rgba(46,116,181,.2)', color: '#58a6ff',
                    fontWeight: 600,
                  }}>{LANG_LABELS[item.Language] || item.Language}</span>
                  {item.ModuleSlug && (
                    <span style={{
                      fontSize: 10, padding: '2px 6px', borderRadius: 4,
                      background: 'rgba(76,175,80,.2)', color: '#7ee787',
                      fontWeight: 600,
                    }}>{item.ModuleSlug}</span>
                  )}
                </div>
              </div>
              <div style={{
                fontSize: 10, color: '#8b949e', marginBottom: 10,
              }}>
                {new Date(item.CreatedAt).toLocaleDateString('en-IN', {
                  day: 'numeric', month: 'short', year: 'numeric',
                  hour: '2-digit', minute: '2-digit'
                })}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => onLoad(item.SnippetId)}
                  style={{
                    flex: 1, padding: '6px 10px', borderRadius: 6,
                    background: 'rgba(46,116,181,.15)', border: '1px solid rgba(46,116,181,.3)',
                    color: '#58a6ff', fontSize: 11, fontWeight: 600,
                    cursor: 'pointer', transition: 'all 150ms',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(46,116,181,.25)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(46,116,181,.15)'; }}
                >
                  Load
                </button>
                <button
                  onClick={() => handleCopy(item)}
                  disabled={loadingCopy === item.SnippetId}
                  style={{
                    flex: 1, padding: '6px 10px', borderRadius: 6,
                    background: copiedId === item.SnippetId ? 'rgba(76,175,80,.15)' : 'rgba(242,169,59,.15)',
                    border: copiedId === item.SnippetId ? '1px solid rgba(76,175,80,.3)' : '1px solid rgba(242,169,59,.3)',
                    color: copiedId === item.SnippetId ? '#7ee787' : '#d29922',
                    fontSize: 11, fontWeight: 600,
                    cursor: loadingCopy === item.SnippetId ? 'wait' : 'pointer',
                    transition: 'all 150ms',
                    opacity: loadingCopy === item.SnippetId ? 0.6 : 1,
                  }}
                  onMouseEnter={e => {
                    if (copiedId !== item.SnippetId && loadingCopy !== item.SnippetId) {
                      e.currentTarget.style.background = 'rgba(242,169,59,.25)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (copiedId !== item.SnippetId && loadingCopy !== item.SnippetId) {
                      e.currentTarget.style.background = 'rgba(242,169,59,.15)';
                    }
                  }}
                >
                  {loadingCopy === item.SnippetId ? '...' : copiedId === item.SnippetId ? '✓ Copied' : '📋 Copy'}
                </button>
                <button
                  onClick={() => onDelete(item.SnippetId)}
                  style={{
                    padding: '6px 10px', borderRadius: 6,
                    background: 'rgba(225,87,89,.15)', border: '1px solid rgba(225,87,89,.3)',
                    color: '#f85149', fontSize: 11, fontWeight: 600,
                    cursor: 'pointer', transition: 'all 150ms',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(225,87,89,.25)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(225,87,89,.15)'; }}
                  title="Delete"
                >
                  🗑
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

