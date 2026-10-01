const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const root = path.join(__dirname, '..', '..');
const requireFromRoot = createRequire(path.join(root, 'package.json'));

const FORBIDDEN = [
  'document',
  'HTMLElement',
  'querySelector',
  'addEventListener',
  'innerHTML',
  'localStorage',
  'indexedDB'
];

test('AC-64 calc.js and money.js compute W1 in Node with no document or window', () => {
  delete global.window;
  delete global.document;
  assert.equal(typeof window, 'undefined');
  assert.equal(typeof document, 'undefined');

  const calc = requireFromRoot('./js/calc.js');
  const money = requireFromRoot('./js/money.js');
  const totals = calc.computeBill({
    lines: [{ qty: 1, unitPriceSen: 1234, void: null }],
    billDiscount: null,
    orderType: 'dine_in',
    settings: {
      serviceCharge: {
        dineIn: { enabled: true, rateBp: 1000 },
        takeaway: { enabled: false, rateBp: 1000 }
      },
      sst: { enabled: true, rateBp: 600, includesServiceCharge: true },
      rounding: { enabled: true }
    }
  });

  assert.deepEqual(totals, {
    subtotalSen: 1234,
    discountSen: 0,
    baseSen: 1234,
    serviceChargeSen: 123,
    sstSen: 81,
    preRoundingSen: 1438,
    roundingSen: 2,
    grandTotalSen: 1440
  });
  assert.equal(money.formatRM(totals.grandTotalSen), 'RM 14.40');
});

test('AC-64 calc.js source does not reference the DOM or browser storage', () => {
  const source = fs.readFileSync(path.join(root, 'js', 'calc.js'), 'utf8');
  FORBIDDEN.forEach(function (name) {
    const hit = new RegExp('\\b' + name + '\\b').test(source);
    assert.equal(hit, false, 'js/calc.js references ' + name);
  });
});
