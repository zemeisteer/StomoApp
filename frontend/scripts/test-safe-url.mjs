// Tests for src/lib/safeUrl.ts without a test framework: transpile with the project's TypeScript
// and run the assertions with node:test. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const src = readFileSync(fileURLToPath(new URL('../src/lib/safeUrl.ts', import.meta.url)), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const { safeUrl } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('allows https and same-site paths', () => {
  assert.equal(safeUrl('https://t.me/clinic'), 'https://t.me/clinic');
  assert.equal(safeUrl('  https://maps.google.com/?q=1  '), 'https://maps.google.com/?q=1');
  assert.equal(safeUrl('/api/media/file/a.webp'), '/api/media/file/a.webp');
});

test('rejects scripts, other schemes and protocol-relative paths', () => {
  for (const bad of [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html,<b>x</b>',
    'http://insecure.example',
    'vbscript:x',
    '//evil.example',
    '/\\evil.example',
    'https://ok.example/a b',
    'https://ok.example/\u0000',
    'https://ok.example/a\u2028b',
    'mailto:x@y.z',
    '',
    '   ',
    null,
    undefined,
    42,
    { href: 'https://x' },
  ]) {
    assert.equal(safeUrl(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
});
