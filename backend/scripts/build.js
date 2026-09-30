// Plain Node.js backend — no bundler/transpiler needed. "Build" here means
// a fast pre-deploy sanity check: syntax-validate every source file so a
// typo surfaces at build time instead of at runtime in production.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SRC_DIR = path.join(__dirname, '..', 'src');

function collectJsFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectJsFiles(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

const files = collectJsFiles(SRC_DIR);
let failed = 0;

for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    failed++;
    console.error(`✗ ${path.relative(process.cwd(), file)}`);
    console.error(err.stderr.toString());
  }
}

if (failed > 0) {
  console.error(`\nBuild failed: ${failed} file(s) with syntax errors.`);
  process.exit(1);
}

console.log(`Build OK — ${files.length} file(s) syntax-checked.`);
