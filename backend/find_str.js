const fs = require('fs');
const vm = require('vm');

const src = fs.readFileSync('src/services/compilerService.js', 'utf8');

// Binary search for the problematic line
function testUpTo(lineCount) {
  const partial = src.split('\n').slice(0, lineCount).join('\n');
  try {
    new vm.Script(partial);
    return true;
  } catch(e) {
    return e.message.includes('end of input') || e.message.includes('Unexpected') ? false : true;
  }
}

const totalLines = src.split('\n').length;
console.log('Total lines:', totalLines);

// Binary search
let lo = 1, hi = totalLines;
while (lo < hi) {
  const mid = Math.floor((lo + hi) / 2);
  if (testUpTo(mid)) lo = mid + 1;
  else hi = mid;
}

// Show context around the problem
const lines = src.split('\n');
const problemLine = lo;
console.log(`Problem around line ${problemLine}:`);
for (let i = Math.max(0, problemLine - 5); i <= Math.min(totalLines - 1, problemLine + 5); i++) {
  console.log(`${i+1}: ${lines[i]}`);
}
