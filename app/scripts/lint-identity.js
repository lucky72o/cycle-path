// Emit a stable identity line per ESLint diagnostic, for baseline comparison.
//
// Usage:  npx eslint <file> -f json | node scripts/lint-identity.js
// Output: one sorted line per diagnostic —  severity \t ruleId \t message \t source-snippet
//
// Why this exists: comparing lint results by count (total or per-rule) cannot
// detect a swap — one diagnostic removed while another appears under the same
// rule. Identity has to include what the diagnostic is actually about.
//
// Two opposing constraints shape the identity:
//
//   * Numeric coordinates must be EXCLUDED. Some rules (react-hooks/refs,
//     react-hooks/set-state-in-effect) embed the absolute path, line:col, and a
//     source code-frame in the message body. Keeping those makes any unrelated
//     edit that shifts line numbers report every such diagnostic as
//     removed-and-re-added.
//
//   * But the message alone is TOO WEAK. Those same rules have generic text —
//     every set-state-in-effect violation reads identically — so stripping the
//     coordinates would let a violation removed in one place and introduced in
//     another pass as unchanged.
//
// Resolution: strip the embedded path/coords/code-frame, then append the source
// line at the diagnostic's location (whitespace-normalized). That is stable
// across line shifts while still distinguishing separate sites.
//
// Exits non-zero if ESLint did not actually analyse the file (e.g. run from the
// wrong directory), so callers must use `set -o pipefail` or check PIPESTATUS.

// ESM: app/package.json declares "type": "module", so `require` is unavailable here.
import fs from 'node:fs';

let raw = '';
process.stdin.on('data', (d) => (raw += d)).on('end', () => {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    console.error('FATAL: eslint produced no valid JSON');
    process.exit(1);
  }

  const file = data[0];
  if (!file || !file.filePath) {
    console.error('FATAL: eslint did not analyse the file (wrong cwd or bad path)');
    process.exit(1);
  }

  let src = [];
  try {
    src = fs.readFileSync(file.filePath, 'utf8').split('\n');
  } catch {
    // Snippets degrade to empty; ruleId + message still carry partial identity.
  }

  const lines = [];
  for (const m of file.messages) {
    let msg = (m.message || '').replace(/\s+/g, ' ').trim();
    const embedded = msg.indexOf(file.filePath);
    if (embedded >= 0) msg = msg.slice(0, embedded).trim();

    const snippet = (src[(m.line || 1) - 1] || '').replace(/\s+/g, ' ').trim();

    lines.push(
      [m.severity === 2 ? 'error' : 'warn', m.ruleId || '‹no ruleId›', msg, snippet].join('\t')
    );
  }

  lines.sort();
  if (lines.length) console.log(lines.join('\n'));
});
