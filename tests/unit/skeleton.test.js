const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');

test('index.html loads classic scripts and local stylesheets', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.equal(html.includes('type="module"'), false);
  assert.equal(html.includes('type=\'module\''), false);
  const order = [
    'src="config/menu.js"',
    'src="js/money.js"',
    'src="js/calc.js"',
    'src="js/validate.js"',
    'src="js/clock.js"',
    'src="js/domain.js"',
    'src="js/store.js"',
    'src="js/tablock.js"',
    'src="js/router.js"',
    'src="js/ui/dom.js"',
    'src="js/ui/tables.js"',
    'src="js/ui/order.js"',
    'src="js/app.js"'
  ];
  let previous = -1;
  order.forEach(function (src) {
    const at = html.indexOf(src);
    assert.ok(at > previous, src);
    previous = at;
  });
  ['css/tokens.css', 'css/base.css', 'css/components.css', 'css/screens.css', 'css/print.css']
    .forEach(function (href) {
      assert.ok(html.includes('href="' + href + '"'));
    });
});
