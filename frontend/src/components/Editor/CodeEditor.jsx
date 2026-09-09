import { useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { typography } from '../../styles/theme';

/**
 * CodeEditor
 * ───────────
 * Monaco editor with:
 *  - currentLine highlight  (green) — updated reactively during playback
 *  - errorLine   highlight  (red)   — set when compiler/runtime error returned
 *  - inline error banner below the editor
 */
export default function CodeEditor({
  language = 'python',
  value,
  onChange,
  currentLine = null,
  errorLine = null,
  errorMessage = '',
  onDismissError = null,
  disabled = false,
}) {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const decorationsRef = useRef([]);   // Monaco decoration IDs to clean up

  /* Store refs on mount */
  function handleMount(editor, monaco) {
    editorRef.current = editor;
    monacoRef.current = monaco;
    applyDecorations(editor, monaco, currentLine, errorLine);
  }

  /* Re-apply decorations whenever line props change */
  useEffect(() => {
    if (editorRef.current && monacoRef.current) {
      applyDecorations(editorRef.current, monacoRef.current, currentLine, errorLine);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLine, errorLine]);

  function applyDecorations(editor, monaco, traceLine, errLine) {
    const newDecorations = [];

    if (traceLine && traceLine > 0) {
      newDecorations.push({
        range: new monaco.Range(traceLine, 1, traceLine, 1),
        options: {
          isWholeLine: true,
          className: 'trace-line-highlight',
          linesDecorationsClassName: 'trace-line-gutter',
        },
      });
    }

    if (errLine && errLine > 0) {
      newDecorations.push({
        range: new monaco.Range(errLine, 1, errLine, 1),
        options: {
          isWholeLine: true,
          className: 'error-line-highlight',
          linesDecorationsClassName: 'error-line-gutter',
          glyphMarginClassName: 'error-glyph',
          overviewRuler: { color: '#E15759', position: 1 },
        },
      });
    }

    /* deltaDecorations returns new IDs; we pass old IDs to clear them */
    decorationsRef.current = editor.deltaDecorations(
      decorationsRef.current,
      newDecorations,
    );

    /* Scroll editor to the relevant line */
    const focusLine = traceLine || errLine;
    if (focusLine && focusLine > 0) {
      editor.revealLineInCenterIfOutsideViewport(focusLine);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Editor
        height="100%"
        theme="vs-dark"
        language={monacoLanguage(language)}
        value={value}
        onChange={onChange}
        onMount={handleMount}
        options={{
          fontFamily: typography.code.fontFamily,
          fontSize: 14,
          lineHeight: 22,
          minimap: { enabled: false },
          readOnly: disabled,
          scrollBeyondLastLine: false,
          padding: { top: 12 },
          glyphMargin: true,
        }}
      />

      
      {errorMessage && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              width: '500px',
              maxWidth: '90%',
              background: '#1e1e1e',
              border: '1px solid #6b1a1e',
              borderRadius: '8px',
              boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '12px 16px',
                background: '#2a1216',
                borderBottom: '1px solid #6b1a1e',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span
                style={{
                  color: '#fca5a5',
                  fontSize: '15px',
                  fontWeight: '600',
                }}
              >
                ⚠ Error
              </span>

              <button
                onClick={() => onDismissError?.()}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#aaa',
                  fontSize: '20px',
                  cursor: 'pointer',
                }}
              >
                ×
              </button>
            </div>

            {/* Error Message */}
            <div
              style={{
                padding: '16px',
                maxHeight: '300px',
                overflowY: 'auto',
              }}
            >
              <pre
                style={{
                  margin: 0,
                  fontSize: '12px',
                  color: '#fca5a5',
                  fontFamily: "'JetBrains Mono', monospace",
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {errorMessage}
              </pre>
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '10px 16px',
                borderTop: '1px solid #333',
                display: 'flex',
                justifyContent: 'flex-end',
              }}
            >
              <button
                onClick={() => onDismissError?.()}
                style={{
                  padding: '7px 18px',
                  background: '#6b1a1e',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* Monaco uses different language IDs from our internal names */
function monacoLanguage(lang) {
  const map = { cpp: 'cpp', csharp: 'csharp', c: 'c', python: 'python', java: 'java' };
  return map[lang] ?? lang;
}
