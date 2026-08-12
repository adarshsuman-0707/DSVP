const fs = require('fs');
const src = fs.readFileSync('src/services/compilerService.js', 'utf8');

let depth = 0;
let inStr = null;
let escaped = false;
let lineNo = 1;
const opens = []; // stack of {depth, line}

for (let i = 0; i < src.length; i++) {
  const c = src[i];
  if (c === '\n') { lineNo++; escaped = false; continue; }
  if (escaped) { escaped = false; continue; }
  if (c === '\\') { escaped = true; continue; }

  if (inStr) {
    if (c === inStr) inStr = null;
    continue;
  }
  if (c === '"' || c === "'") { inStr = c; continue; }
  // Skip template literals (simplified)
  if (c === '`') { inStr = '`'; continue; }

  if (c === '/' && src[i+1] === '/') {
    while (i < src.length && src[i] !== '\n') i++;
    lineNo++;
    continue;
  }

  if (c === '{') {
    depth++;
    opens.push({ depth, line: lineNo });
  }
  if (c === '}') {
    opens.pop();
    depth--;
  }
}

console.log('Final brace depth:', depth);
if (depth > 0) {
  console.log('Unclosed opens (last', Math.min(depth, 5), '):');
  opens.slice(-depth).forEach(o => console.log(' ', o));
}
