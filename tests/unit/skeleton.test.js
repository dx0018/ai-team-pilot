const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');

test('index.html loads classic scripts and local stylesheets', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.equal(html.includes('type="module"'), false);
  assert.equal(html.includes('type=\'module\''), false);
  const routerAt = html.indexOf('src="js/router.js"');
  const appAt = html.indexOf('src="js/app.js"');
  assert.ok(routerAt > 0);
  assert.ok(appAt > routerAt);
  ['css/tokens.css', 'css/base.css', 'css/components.css', 'css/screens.css', 'css/print.css']
    .forEach(function (href) {
      assert.ok(html.includes('href="' + href + '"'));
    });
});
