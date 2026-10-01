const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

test('one primary token and one accent token colour every primary element', () => {
  const tokens = read('css/tokens.css');
  assert.equal((tokens.match(/--color-primary\s*:/g) || []).length, 1);
  assert.equal((tokens.match(/--color-accent\s*:/g) || []).length, 1);
  assert.match(tokens, /--color-primary:\s*#1f6b4a/);
  assert.match(tokens, /--color-accent:\s*#c46b3a/);
  ['css/base.css', 'css/components.css', 'css/screens.css', 'css/print.css'].forEach(function (file) {
    const css = read(file);
    assert.equal(css.includes('#1f6b4a'), false, file);
    assert.equal(css.includes('#c46b3a'), false, file);
  });
  const components = read('css/components.css');
  assert.match(components, /\.btn-primary[\s\S]*var\(--color-primary\)/);
  assert.match(components, /\.text-primary[\s\S]*var\(--color-primary\)/);
  assert.match(components, /\.status-bill[\s\S]*var\(--color-primary\)/);
  assert.match(components, /\.status-ordering[\s\S]*var\(--color-accent\)/);
});

test('cards, 44px controls, status text badges and totals typography', () => {
  const components = read('css/components.css');
  const screens = read('css/screens.css');
  const tokens = read('css/tokens.css');
  assert.match(components, /\.card\s*\{[^}]*border-radius:\s*var\(--radius\)/);
  assert.match(components, /\.card\s*\{[^}]*box-shadow:\s*var\(--shadow-card\)/);
  assert.match(tokens, /--shadow-card:\s*0 /);
  assert.equal(/box-shadow:\s*none/.test(components), false);
  assert.match(components, /button,\s*\n\.btn\s*\{[^}]*min-width:\s*44px/);
  assert.match(components, /min-height:\s*44px/);
  ['empty', 'ordering', 'bill', 'paid'].forEach(function (name) {
    assert.match(components, new RegExp('\\.status-' + name));
  });
  assert.match(components, /\.status-badge\s*\{/);
  assert.match(tokens, /--font-size-total:\s*2rem/);
  assert.match(tokens, /--font-size-title:\s*1\.5rem/);
  assert.match(components, /\.grand-total,\s*\n\.running-total\s*\{[^}]*font-size:\s*var\(--font-size-total\)/);
  assert.match(screens, /font-size:\s*var\(--font-size-title\)/);
});

test('bundled Noto Sans SC subset is local and covers Latin plus 3500 han', () => {
  const base = read('css/base.css');
  assert.match(base, /font-family:\s*"Noto Sans SC"/);
  assert.match(base, /url\("\.\.\/fonts\/NotoSansSC-subset-400\.woff2"\)\s*format\("woff2"\)/);
  assert.match(base, /url\("\.\.\/fonts\/NotoSansSC-subset-700\.woff2"\)\s*format\("woff2"\)/);
  assert.match(base, /font-weight:\s*400/);
  assert.match(base, /font-weight:\s*700/);
  assert.equal(/https?:/.test(base), false);
  ['NotoSansSC-subset-400.woff2', 'NotoSansSC-subset-700.woff2'].forEach(function (name) {
    const bytes = fs.readFileSync(path.join(root, 'fonts', name));
    assert.equal(bytes.subarray(0, 4).toString('ascii'), 'wOF2');
    assert.ok(bytes.length > 10000);
  });
  assert.ok(fs.existsSync(path.join(root, 'fonts', 'OFL.txt')));
  const sample = read('tools/subset-text.txt');
  const han = Array.from(sample).filter(function (ch) { return ch >= '\u4e00' && ch <= '\u9fff'; });
  assert.equal(new Set(han).size, 3500);
  Array.from('椰浆饭谢谢').forEach(function (ch) {
    assert.ok(sample.includes(ch), ch);
  });
  assert.ok(sample.includes('\u2212'));
  assert.ok(sample.includes('A') && sample.includes('0'));
  ['index.html', 'css/tokens.css', 'css/base.css', 'css/components.css', 'css/screens.css', 'css/print.css',
    'js/app.js', 'js/store.js', 'js/clock.js', 'js/tablock.js', 'config/menu.js'].forEach(function (file) {
    assert.equal(/https?:/.test(read(file)), false, file);
  });
});
