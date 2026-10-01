const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const root = path.join(__dirname, '..', '..');
const requireFromRoot = createRequire(path.join(root, 'package.json'));
const store = requireFromRoot('./js/store.js');

function line(id, sen, voided) {
  return {
    id: id,
    itemId: id,
    name: id,
    unitPriceSen: sen,
    qty: 1,
    note: '',
    committed: false,
    void: voided ? { reason: 'void', at: '2026-10-01T15:55:00.000Z', businessDate: '2026-10-01' } : null
  };
}

test('default settings seed 20 tables T1–T20 and the built-in rates', () => {
  const settings = store.defaultSettings();
  assert.equal(settings.tables.length, 20);
  settings.tables.forEach(function (table, index) {
    assert.equal(table.name, 'T' + (index + 1));
    assert.equal(table.id, 't' + (index + 1));
  });
  assert.deepEqual(settings.serviceCharge, {
    dineIn: { enabled: true, rateBp: 1000 },
    takeaway: { enabled: false, rateBp: 1000 }
  });
  assert.deepEqual(settings.sst, { enabled: true, rateBp: 600, includesServiceCharge: true });
  assert.deepEqual(settings.rounding, { enabled: true });
  assert.equal(settings.receiptFooter, 'Thank you! Terima kasih! 谢谢!');
});

test('config/menu.js is a strict JSON payload inside the AD-04 wrapper', () => {
  const text = fs.readFileSync(path.join(root, 'config', 'menu.js'), 'utf8');
  const lines = text.split(/\r?\n/);
  assert.equal(lines[0], 'window.POS_DEFAULT_MENU =');
  assert.equal(lines[lines.length - 1] === '' ? lines[lines.length - 2] : lines[lines.length - 1], ';');
  const end = lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
  const payload = lines.slice(1, end - 1).join('\n');
  const menu = JSON.parse(payload);
  assert.ok(menu.categories.length >= 1);
  assert.ok(menu.items.some(function (item) { return item.name === 'Nasi Lemak 椰浆饭' && item.priceSen === 1200; }));
});

test('bill and takeaway numbers and schema gate', () => {
  assert.equal(store.formatBillNo('2026-10-01', 1), 'B-20261001-0001');
  assert.equal(store.formatBillNo('2026-10-02', 1), 'B-20261002-0001');
  assert.equal(store.formatBillNo('2026-10-01', 3), 'B-20261001-0003');
  assert.equal(store.formatTakeawayNo(1), 'TA-001');
  assert.equal(store.formatTakeawayNo(2), 'TA-002');
  assert.equal(store.schemaIsNewer(1), false);
  assert.equal(store.schemaIsNewer(undefined), false);
  assert.equal(store.schemaIsNewer(2), true);
});

test('paymentRefusal blocks paid, empty and all-voided orders', () => {
  assert.equal(store.paymentRefusal(null), 'Order not found');
  assert.equal(store.paymentRefusal({ state: 'paid', bill: { billNo: 'B-20261001-0001' }, lines: [line('a', 100, false)] }), 'Order is already paid');
  assert.equal(store.paymentRefusal({ state: 'closed_no_bill', lines: [line('a', 100, true)] }), 'Order is closed without a bill');
  assert.equal(store.paymentRefusal({ state: 'ordering', lines: [] }), 'Order has no payable line');
  assert.equal(store.paymentRefusal({ state: 'ordering', lines: [line('a', 100, true)] }), 'Order has no payable line');
  assert.equal(store.paymentRefusal({ state: 'bill_requested', lines: [line('a', 100, false)] }), null);
  assert.equal(store.paymentRefusal({
    state: 'bill_requested',
    lines: [line('a', 100, false), line('b', 100, false)],
    split: { mode: 'item', count: 2, assign: { a: 0 } }
  }), 'A line is not assigned to a sub-bill');
  assert.equal(store.paymentRefusal({
    state: 'bill_requested',
    lines: [line('a', 100, false)],
    split: { mode: 'item', count: 2, assign: { a: 0 } }
  }), 'A sub-bill has no line');
  assert.equal(store.paymentRefusal({
    state: 'bill_requested',
    lines: [line('a', 100, false), line('b', 100, false)],
    split: { mode: 'item', count: 2, assign: { a: 0, b: 1 } }
  }), null);
});

test('router records route performance marks', () => {
  const router = fs.readFileSync(path.join(root, 'js', 'router.js'), 'utf8');
  assert.ok(router.includes("performance.mark('route:start:' + name)"));
  assert.ok(router.includes("performance.mark('route:rendered:' + name)"));
  assert.ok(router.includes("performance.measure('route:' + name, 'route:start:' + name, 'route:rendered:' + name)"));
});
