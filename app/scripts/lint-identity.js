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
// The snippet comes from ESLint's own `source` field, not from re-reading the
// file: it is guaranteed to be the exact text ESLint analysed, needs no
// filesystem access, and cannot drift between the lint run and this script.
// If diagnostics exist but no source is available, this exits non-zero rather
// than emitting blank snippets — degrading silently would collapse generic
// same-rule diagnostics and reintroduce the false pass this script prevents.
//
// EXIT STATUS: 0 on a successful run (any number of diagnostics, including
// none); 1 if ESLint did not analyse the file or its source is missing.
//
// Callers: do NOT enable `set -o pipefail` around this pipeline. ESLint exits 1
// whenever it reports any problem, which is the normal case, so pipefail would
// make a healthy run look like a failure. Without it the pipeline's status is
// this script's, which is the signal you actually want.

let raw = '';
process.stdin.on('data', (d) => (raw += d)).on('end', () => {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    console.error('FATAL: eslint produced no valid JSON');
    process.exit(1);
  }

  const file = Array.isArray(data) ? data[0] : undefined;
  if (!file || !file.filePath) {
    console.error('FATAL: eslint did not analyse the file (wrong cwd or bad path)');
    process.exit(1);
  }

  const messages = file.messages || [];
  if (messages.length === 0) {
    // Nothing to identify. ESLint omits `source` for clean files, which is fine.
    process.exit(0);
  }

  if (typeof file.source !== 'string') {
    console.error(
      `FATAL: eslint reported ${messages.length} diagnostic(s) for ${file.filePath} ` +
        'but included no source, so snippets cannot be built. Refusing to emit ' +
        'weakened identities that could hide a same-rule swap.'
    );
    process.exit(1);
  }

  const src = file.source.split('\n');
  const lines = [];

  for (const m of messages) {
    let msg = (m.message || '').replace(/\s+/g, ' ').trim();
    const embedded = msg.indexOf(file.filePath);
    if (embedded >= 0) msg = msg.slice(0, embedded).trim();

    const lineNo = m.line || 1;
    if (lineNo < 1 || lineNo > src.length) {
      console.error(
        `FATAL: diagnostic at line ${lineNo} is outside ${file.filePath} ` +
          `(${src.length} lines); cannot build a reliable snippet.`
      );
      process.exit(1);
    }
    const snippet = src[lineNo - 1].replace(/\s+/g, ' ').trim();

    lines.push(
      [m.severity === 2 ? 'error' : 'warn', m.ruleId || '‹no ruleId›', msg, snippet].join('\t')
    );
  }

  lines.sort();
  console.log(lines.join('\n'));
});
