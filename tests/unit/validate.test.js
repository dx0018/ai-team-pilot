const test = require('node:test');
const assert = require('node:assert/strict');
const validate = require('../../js/validate.js');

function tables(n) {
  const list = [];
  for (let i = 1; i <= n; i++) list.push({ id: 't' + i, name: 'T' + i });
  return list;
}

function rates(patch) {
  const settings = {
    serviceCharge: {
      dineIn: { enabled: true, rateBp: 1000 },
      takeaway: { enabled: false, rateBp: 1000 }
    },
    sst: { enabled: true, rateBp: 600, includesServiceCharge: true }
  };
  return patch(settings);
}

function assertFail(result, field) {
  assert.equal(result.ok, false);
  assert.equal(result.field, field);
  assert.equal(typeof result.message, 'string');
  assert.ok(result.message.length > 0);
}

test('R11 table count and names', () => {
  assert.deepEqual(validate.validateTables(tables(1)), { ok: true });
  assert.deepEqual(validate.validateTables(tables(20)), { ok: true });
  assert.deepEqual(validate.validateTables(tables(50)), { ok: true });
  assert.deepEqual(validate.validateTables([{ id: 'a', name: 'Patio 1' }]), { ok: true });
  assertFail(validate.validateTables([]), 'count');
  assertFail(validate.validateTables(tables(51)), 'count');
  assertFail(validate.validateTables([{ id: 'a', name: '  ' }]), 'name');
  assertFail(validate.validateTables([{ id: 'a', name: '' }]), 'name');
  assertFail(validate.validateTables([
    { id: 'a', name: 'Patio' },
    { id: 'b', name: 'patio' }
  ]), 'name');
  assertFail(validate.validateTables([{ id: 'a' }]), 'name');
});

test('R11 menu item price and name', () => {
  assert.deepEqual(validate.validateMenuItem({ name: 'Teh', priceSen: 0 }), { ok: true });
  assert.deepEqual(validate.validateMenuItem({ name: 'Nasi', priceSen: 1000 }), { ok: true });
  assert.deepEqual(validate.validateMenuItem({ name: 'Kopi', price: '2.50' }), { ok: true });
  assert.deepEqual(validate.validateMenuItem({ name: 'Air', price: '0' }), { ok: true });
  assertFail(validate.validateMenuItem({ name: '  ', priceSen: 100 }), 'name');
  assertFail(validate.validateMenuItem({ name: '', price: '1.00' }), 'name');
  assertFail(validate.validateMenuItem({ name: 'Teh', price: '-1' }), 'price');
  assertFail(validate.validateMenuItem({ name: 'Teh', price: '1.234' }), 'price');
  assertFail(validate.validateMenuItem({ name: 'Teh', price: 'abc' }), 'price');
  assertFail(validate.validateMenuItem({ name: 'Teh', priceSen: -1 }), 'price');
  assertFail(validate.validateMenuItem({ name: 'Teh', priceSen: 1.5 }), 'price');
});

test('R11 service charge and SST rates', () => {
  assert.deepEqual(validate.validateRates(rates((s) => s)), { ok: true });
  assert.deepEqual(validate.validateRates(rates((s) => {
    s.serviceCharge.dineIn.rateBp = 0;
    s.serviceCharge.takeaway.rateBp = 1025;
    s.sst.rateBp = 10000;
    return s;
  })), { ok: true });
  assert.deepEqual(validate.validateRates(rates((s) => {
    s.serviceCharge.dineIn = { enabled: true, rate: '5' };
    s.sst = { enabled: true, rate: '10.25', includesServiceCharge: true };
    return s;
  })), { ok: true });
  assertFail(validate.validateRates(rates((s) => {
    s.serviceCharge.dineIn.rateBp = -1;
    return s;
  })), 'serviceCharge.dineIn');
  assertFail(validate.validateRates(rates((s) => {
    s.serviceCharge.takeaway.rateBp = 10001;
    return s;
  })), 'serviceCharge.takeaway');
  assertFail(validate.validateRates(rates((s) => {
    s.sst.rateBp = 10.5;
    return s;
  })), 'sst');
  assertFail(validate.validateRates(rates((s) => {
    s.sst = { enabled: true, rate: '101', includesServiceCharge: true };
    return s;
  })), 'sst');
  assertFail(validate.validateRates(rates((s) => {
    s.serviceCharge.dineIn = { enabled: true, rate: '10.256' };
    return s;
  })), 'serviceCharge.dineIn');
  assertFail(validate.validateRates(rates((s) => {
    s.serviceCharge.takeaway = { enabled: true, rate: '-1' };
    return s;
  })), 'serviceCharge.takeaway');
});

test('R11 split count N', () => {
  [2, 3, 20].forEach((n) => {
    assert.deepEqual(validate.validateSplitN(n), { ok: true });
  });
  [1, 0, 21, 2.5, -1, '3'].forEach((n) => {
    assertFail(validate.validateSplitN(n), 'n');
  });
});

test('R11 bill discount percent and RM amount', () => {
  assert.deepEqual(validate.validateDiscount(null, 4000), { ok: true });
  assert.deepEqual(validate.validateDiscount({ kind: 'pct', bp: 0 }, 1235), { ok: true });
  assert.deepEqual(validate.validateDiscount({ kind: 'pct', bp: 1000 }, 1235), { ok: true });
  assert.deepEqual(validate.validateDiscount({ kind: 'pct', bp: 10000 }, 4000), { ok: true });
  assert.deepEqual(validate.validateDiscount({ kind: 'pct', rate: '10' }, 1235), { ok: true });
  assert.deepEqual(validate.validateDiscount({ kind: 'rm', sen: 0 }, 1235), { ok: true });
  assert.deepEqual(validate.validateDiscount({ kind: 'rm', sen: 500 }, 1235), { ok: true });
  assert.deepEqual(validate.validateDiscount({ kind: 'rm', sen: 5000 }, 4000), { ok: true });
  assert.deepEqual(validate.validateDiscount({ kind: 'rm', amount: '5.00' }, 1235), { ok: true });
  assertFail(validate.validateDiscount({ kind: 'pct', bp: -1 }, 1235), 'discount');
  assertFail(validate.validateDiscount({ kind: 'pct', bp: 10001 }, 1235), 'discount');
  assertFail(validate.validateDiscount({ kind: 'pct', bp: 10.5 }, 1235), 'discount');
  assertFail(validate.validateDiscount({ kind: 'pct', rate: '100.01' }, 1235), 'discount');
  assertFail(validate.validateDiscount({ kind: 'pct', rate: 'abc' }, 1235), 'discount');
  assertFail(validate.validateDiscount({ kind: 'rm', sen: -1 }, 1235), 'discount');
  assertFail(validate.validateDiscount({ kind: 'rm', sen: 1.25 }, 1235), 'discount');
  assertFail(validate.validateDiscount({ kind: 'rm', amount: '-1' }, 1235), 'discount');
  assertFail(validate.validateDiscount({ kind: 'rm', amount: '1.234' }, 1235), 'discount');
  assertFail(validate.validateDiscount({ kind: 'other' }, 1235), 'discount');
});

test('R11 cash received is numeric, ≥ 0, with at most 2 decimals', () => {
  const money = require('../../js/money.js');
  ['0', '0.00', '26.50', '50'].forEach((text) => {
    assert.equal(money.parseMoney(text).ok, true);
  });
  ['-0.01', '50.001', 'abc', ''].forEach((text) => {
    assert.equal(money.parseMoney(text).ok, false);
  });
});
