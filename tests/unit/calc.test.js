const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { createRequire } = require('module');
const requireFromRoot = createRequire(path.join(__dirname, '..', '..', 'package.json'));
const calc = requireFromRoot('./js/calc.js');
const money = requireFromRoot('./js/money.js');

const MINUS = '\u2212';

function settings(opts) {
  const o = opts || {};
  return {
    serviceCharge: {
      dineIn: { enabled: o.dineIn !== false, rateBp: o.dineInBp == null ? 1000 : o.dineInBp },
      takeaway: { enabled: o.takeaway === true, rateBp: o.takeawayBp == null ? 1000 : o.takeawayBp }
    },
    sst: {
      enabled: o.sst !== false,
      rateBp: o.sstBp == null ? 600 : o.sstBp,
      includesServiceCharge: o.includes !== false
    },
    rounding: { enabled: o.rounding !== false }
  };
}

function off() {
  return settings({ dineIn: false, sst: false, rounding: false });
}

function line(sen, qty, voided) {
  return { qty: qty || 1, unitPriceSen: sen, void: voided ? { reason: 'void' } : null };
}

function bill(lines, extra) {
  return calc.computeBill(Object.assign({
    lines: lines,
    billDiscount: null,
    orderType: 'dine_in',
    settings: settings()
  }, extra || {}));
}

test('require("./js/calc.js") exports the §3 functions', () => {
  ['halfUpDiv', 'roundTo5Sen', 'computeBill', 'splitEqual', 'splitByItem', 'cashChange'].forEach((name) => {
    assert.equal(typeof calc[name], 'function');
  });
  assert.equal(typeof money.parseMoney, 'function');
});

test('halfUpDiv matches the PRD half-sen cases', () => {
  assert.equal(calc.halfUpDiv(1234000, 10000), 123);
  assert.equal(calc.halfUpDiv(1005000, 10000), 101);
  assert.equal(calc.halfUpDiv(1235000, 10000), 124);
  assert.equal(calc.halfUpDiv(200, 100), 2);
});

test('W1 dine-in base RM 12.34', () => {
  assert.deepEqual(bill([line(1234)]), {
    subtotalSen: 1234,
    discountSen: 0,
    baseSen: 1234,
    serviceChargeSen: 123,
    sstSen: 81,
    preRoundingSen: 1438,
    roundingSen: 2,
    grandTotalSen: 1440
  });
  assert.equal(money.formatRM(1440), 'RM 14.40');
  assert.equal(money.formatSigned(2), '+0.02');
});

test('W2 dine-in base RM 10.05 half-up', () => {
  assert.deepEqual(bill([line(1005)]), {
    subtotalSen: 1005,
    discountSen: 0,
    baseSen: 1005,
    serviceChargeSen: 101,
    sstSen: 66,
    preRoundingSen: 1172,
    roundingSen: -2,
    grandTotalSen: 1170
  });
  assert.equal(money.formatSigned(-2), MINUS + '0.02');
});

test('W3 and AC-27 takeaway RM 25.00, no SC, SST 6%', () => {
  const result = bill([line(2500)], { orderType: 'takeaway' });
  assert.deepEqual(result, {
    subtotalSen: 2500,
    discountSen: 0,
    baseSen: 2500,
    serviceChargeSen: 0,
    sstSen: 150,
    preRoundingSen: 2650,
    roundingSen: 0,
    grandTotalSen: 2650
  });
});

test('W4 and AC-32 100% discount and RM discount capped at subtotal', () => {
  const percent = bill([line(4000)], { billDiscount: { kind: 'pct', bp: 10000 } });
  const fixed = bill([line(4000)], { billDiscount: { kind: 'rm', sen: 5000 } });
  const expected = {
    subtotalSen: 4000,
    discountSen: 4000,
    baseSen: 0,
    serviceChargeSen: 0,
    sstSen: 0,
    preRoundingSen: 0,
    roundingSen: 0,
    grandTotalSen: 0
  };
  assert.deepEqual(percent, expected);
  assert.deepEqual(fixed, expected);
  assert.ok(percent.grandTotalSen >= 0);
  assert.ok(percent.discountSen >= 0);
});

test('A-16 dine-in three RM 10.00 items', () => {
  assert.deepEqual(bill([line(1000), line(1000), line(1000)]), {
    subtotalSen: 3000,
    discountSen: 0,
    baseSen: 3000,
    serviceChargeSen: 300,
    sstSen: 198,
    preRoundingSen: 3498,
    roundingSen: 2,
    grandTotalSen: 3500
  });
});

test('W5 dine-in lines RM 10, 20 and 5', () => {
  assert.deepEqual(bill([line(1000), line(2000), line(500)]), {
    subtotalSen: 3500,
    discountSen: 0,
    baseSen: 3500,
    serviceChargeSen: 350,
    sstSen: 231,
    preRoundingSen: 4081,
    roundingSen: -1,
    grandTotalSen: 4080
  });
});

test('AC-21 RM 0.10 and RM 0.20 with SC, SST and rounding off', () => {
  const result = bill([line(10), line(20)], { settings: off() });
  assert.equal(result.subtotalSen, 30);
  assert.equal(result.grandTotalSen, 30);
  assert.equal(money.formatRM(result.subtotalSen), 'RM 0.30');
});

test('AC-22 dine-in SC is RM 10.00 and takeaway SC is RM 0.00 on RM 100.00', () => {
  assert.equal(bill([line(10000)]).serviceChargeSen, 1000);
  assert.equal(bill([line(10000)], { orderType: 'takeaway' }).serviceChargeSen, 0);
});

test('AC-24 MTS-01 dine-in RM 100, SC 10%, SST 6% on base + SC', () => {
  assert.deepEqual(bill([line(10000)]), {
    subtotalSen: 10000,
    discountSen: 0,
    baseSen: 10000,
    serviceChargeSen: 1000,
    sstSen: 660,
    preRoundingSen: 11660,
    roundingSen: 0,
    grandTotalSen: 11660
  });
});

test('AC-25 MTS-02 SST on base only', () => {
  const result = bill([line(10000)], { settings: settings({ includes: false }) });
  assert.equal(result.serviceChargeSen, 1000);
  assert.equal(result.sstSen, 600);
  assert.equal(result.grandTotalSen, 11600);
});

test('AC-29 rounding table', () => {
  const rows = [
    [1001, 1000, -1, MINUS + '0.01'],
    [1002, 1000, -2, MINUS + '0.02'],
    [1003, 1005, 2, '+0.02'],
    [1004, 1005, 1, '+0.01'],
    [1006, 1005, -1, MINUS + '0.01'],
    [1007, 1005, -2, MINUS + '0.02'],
    [1008, 1010, 2, '+0.02'],
    [1009, 1010, 1, '+0.01']
  ];
  rows.forEach((row) => {
    const result = bill([line(row[0])], { settings: off() });
    assert.equal(result.preRoundingSen, row[0]);
    assert.equal(result.serviceChargeSen, 0);
    assert.equal(result.sstSen, 0);
    assert.equal(result.discountSen, 0);
    const rounded = bill([line(row[0])], {
      settings: settings({ dineIn: false, sst: false, rounding: true })
    });
    assert.equal(rounded.grandTotalSen, row[1]);
    assert.equal(rounded.roundingSen, row[2]);
    assert.equal(money.formatSigned(rounded.roundingSen), row[3]);
    assert.equal(calc.roundTo5Sen(row[0]), row[1]);
  });
});

test('AC-30 pre-rounding totals ending in .00 or .05 have a 0.00 rounding line', () => {
  [1000, 1005].forEach((sen) => {
    const result = bill([line(sen)], {
      settings: settings({ dineIn: false, sst: false, rounding: true })
    });
    assert.equal(result.preRoundingSen, sen);
    assert.equal(result.roundingSen, 0);
    assert.equal(result.grandTotalSen, sen);
    assert.equal(money.formatSigned(result.roundingSen), '0.00');
  });
});

test('AC-31 rounding switched off leaves the pre-rounding total unchanged', () => {
  const result = bill([line(1001)], { settings: off() });
  assert.equal(result.preRoundingSen, 1001);
  assert.equal(result.roundingSen, 0);
  assert.equal(result.grandTotalSen, 1001);
  assert.equal(money.formatSigned(result.roundingSen), '0.00');
});

test('AC-32a bill discount 10% of RM 12.35 and a fixed RM 5.00', () => {
  const percent = bill([line(1235)], { billDiscount: { kind: 'pct', bp: 1000 } });
  assert.equal(percent.discountSen, 124);
  assert.equal(percent.baseSen, 1111);
  const fixed = bill([line(1235)], { billDiscount: { kind: 'rm', sen: 500 } });
  assert.equal(fixed.discountSen, 500);
  assert.equal(fixed.baseSen, 735);
});

test('R2 qty multiplies and voided lines are excluded', () => {
  const doubled = bill([line(10, 2)], { settings: off() });
  assert.equal(doubled.subtotalSen, 20);
  const mixed = bill([line(10, 1, true), line(20)], { settings: off() });
  assert.equal(mixed.subtotalSen, 20);
});

test('AC-35 and equal split of RM 100.00 by 3', () => {
  assert.deepEqual(calc.splitEqual(10000, 3), {
    amounts: [3334, 3333, 3333],
    remainderSen: 1
  });
});

test('equal split N = 2..20 sums exactly and puts the remainder on sub-bill 1', () => {
  for (let n = 2; n <= 20; n++) {
    const split = calc.splitEqual(10000, n);
    assert.equal(split.amounts.length, n);
    let sum = 0;
    for (let i = 0; i < n; i++) sum += split.amounts[i];
    assert.equal(sum, 10000);
    for (let i = 2; i < n; i++) assert.equal(split.amounts[i], split.amounts[1]);
    assert.equal(split.amounts[0], split.amounts[1] + split.remainderSen);
  }
});

test('A-16 split by item is 11.68 / 11.66 / 11.66', () => {
  assert.deepEqual(calc.splitByItem(3500, [1000, 1000, 1000]), {
    amounts: [1168, 1166, 1166],
    remainderSen: 2
  });
});

test('W5 split by item is 11.67 / 23.31 / 5.82', () => {
  assert.deepEqual(calc.splitByItem(4080, [1000, 2000, 500]), {
    amounts: [1167, 2331, 582],
    remainderSen: 2
  });
});

test('AC-37 a voided line is omitted from splitByItem bases', () => {
  const lines = [line(1000), line(500, 1, true)];
  const bases = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].void == null) bases.push(lines[i].qty * lines[i].unitPriceSen);
  }
  assert.deepEqual(bases, [1000]);
  assert.deepEqual(calc.splitByItem(1000, bases), { amounts: [1000], remainderSen: 0 });
});

test('splitByItem with Σbase = 0 is 0.00 on every sub-bill', () => {
  assert.deepEqual(calc.splitByItem(500, [0, 0]), { amounts: [0, 0], remainderSen: 0 });
  assert.deepEqual(calc.splitByItem(0, []), { amounts: [], remainderSen: 0 });
});

test('R11-blocked inputs throw RangeError', () => {
  [0, 1, 21, 2.5, -1, NaN, Infinity].forEach((n) => {
    assert.throws(() => calc.splitEqual(10000, n), RangeError);
  });
  assert.throws(() => calc.splitEqual(-1, 2), RangeError);
  assert.throws(() => calc.splitEqual(10.5, 3), RangeError);

  assert.throws(() => calc.splitByItem(-1, [1000]), RangeError);
  assert.throws(() => calc.splitByItem(10.5, [1000]), RangeError);
  assert.throws(() => calc.splitByItem(1000, [-1]), RangeError);
  assert.throws(() => calc.splitByItem(1000, [1.5]), RangeError);
  assert.throws(() => calc.splitByItem(1000, [500, 1.2]), RangeError);
  assert.throws(() => calc.splitByItem(-5, [0, 0]), RangeError);

  assert.throws(() => bill([line(-1)]), RangeError);
  assert.throws(() => bill([{ qty: 1, unitPriceSen: 1.5, void: null }]), RangeError);
  assert.throws(() => bill([{ qty: -1, unitPriceSen: 100, void: null }]), RangeError);
  assert.throws(() => bill([{ qty: 1.5, unitPriceSen: 100, void: null }]), RangeError);
  assert.throws(() => bill([{ qty: -2, unitPriceSen: 100, void: { reason: 'void' } }]), RangeError);
  assert.throws(() => bill([line(100)], { settings: settings({ dineInBp: -1 }) }), RangeError);
  assert.throws(() => bill([line(100)], { settings: settings({ dineInBp: 10.5 }) }), RangeError);
  assert.throws(() => bill([line(100)], { settings: settings({ takeaway: true, takeawayBp: -1 }), orderType: 'takeaway' }), RangeError);
  assert.throws(() => bill([line(100)], { settings: settings({ sstBp: -5 }) }), RangeError);
  assert.throws(() => bill([line(100)], { settings: settings({ sstBp: 6.5 }) }), RangeError);
  assert.throws(() => bill([line(100)], { billDiscount: { kind: 'pct', bp: -1 } }), RangeError);
  assert.throws(() => bill([line(100)], { billDiscount: { kind: 'pct', bp: 1.5 } }), RangeError);
  assert.throws(() => bill([line(100)], { billDiscount: { kind: 'rm', sen: -1 } }), RangeError);
  assert.throws(() => bill([line(100)], { billDiscount: { kind: 'rm', sen: 1.25 } }), RangeError);
});

test('zero sen, zero quantity and the split bounds stay valid', () => {
  const result = bill([{ qty: 0, unitPriceSen: 0, void: null }], {
    settings: settings({ dineInBp: 0, sstBp: 0 }),
    billDiscount: { kind: 'pct', bp: 0 }
  });
  assert.equal(result.grandTotalSen, 0);
  assert.deepEqual(calc.splitEqual(0, 2), { amounts: [0, 0], remainderSen: 0 });
  assert.equal(calc.splitEqual(10000, 20).amounts.length, 20);
  assert.deepEqual(calc.splitByItem(0, [0]), { amounts: [0], remainderSen: 0 });
});

test('AC-42 and AC-43 cash change', () => {
  assert.deepEqual(calc.cashChange(2650, 5000), { ok: true, changeSen: 2350 });
  assert.deepEqual(calc.cashChange(2650, 2650), { ok: true, changeSen: 0 });
  const below = calc.cashChange(2650, 2649);
  assert.equal(below.ok, false);
  assert.equal(typeof below.reason, 'string');
  assert.ok(below.reason.length > 0);
});
