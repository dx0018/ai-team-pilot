// QA independent MTS runner. Expected values are hard-coded from URS §8 / PRD §3.1, not computed by js/calc.js.
// Run from repo root: node docs/qa/MTS/mts-calc.run.js
'use strict';
const path = require('path');
const calc = require(path.resolve('js/calc.js'));
const S = (o) => ({ serviceCharge: { dineIn: { enabled: o.sc !== false, rateBp: 1000 }, takeaway: { enabled: false, rateBp: 0 } },
  sst: { enabled: o.sst !== false, rateBp: 600, includesServiceCharge: o.inc !== false }, rounding: { enabled: o.round !== false } });
const L = (sen, qty, v) => ({ qty: qty || 1, unitPriceSen: sen, void: v ? { reason: 'qa' } : null });
const B = (lines, set, type, disc) => calc.computeBill({ lines, settings: set, orderType: type || 'dine_in', billDiscount: disc || null });
let pass = 0, fail = 0;
function check(id, label, expected, actual) {
  const ok = JSON.stringify(expected) === JSON.stringify(actual);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${label}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`);
}
const pick = (b, ks) => Object.fromEntries(ks.map(k => [k, b[k]]));
// MTS-01
let b = B([L(10000)], S({}));
check('MTS-01', 'Dine-in 100.00, SC 10%, SST 6% on base+SC', { serviceChargeSen: 1000, sstSen: 660, grandTotalSen: 11660 }, pick(b, ['serviceChargeSen', 'sstSen', 'grandTotalSen']));
// MTS-02
b = B([L(10000)], S({ inc: false }));
check('MTS-02', 'Same, SST on subtotal only', { serviceChargeSen: 1000, sstSen: 600, grandTotalSen: 11600 }, pick(b, ['serviceChargeSen', 'sstSen', 'grandTotalSen']));
// MTS-03
b = B([L(2500)], S({}), 'takeaway');
check('MTS-03', 'Takeaway 25.00, no SC, SST 6%', { serviceChargeSen: 0, sstSen: 150, grandTotalSen: 2650 }, pick(b, ['serviceChargeSen', 'sstSen', 'grandTotalSen']));
// MTS-04 rounding table
[[1001, 1000, -1], [1002, 1000, -2], [1003, 1005, 2], [1004, 1005, 1], [1006, 1005, -1], [1007, 1005, -2], [1008, 1010, 2], [1009, 1010, 1]].forEach(([pre, gt, r]) => {
  b = B([L(pre)], S({ sc: false, sst: false }));
  check('MTS-04', `rounding ${(pre / 100).toFixed(2)}`, { preRoundingSen: pre, grandTotalSen: gt, roundingSen: r }, pick(b, ['preRoundingSen', 'grandTotalSen', 'roundingSen']));
});
// MTS-05
let s = calc.splitEqual(10000, 3);
check('MTS-05', 'Split 100.00 equally by 3', { amounts: [3334, 3333, 3333], sum: 10000 }, { amounts: s.amounts, sum: s.amounts.reduce((a, c) => a + c, 0) });
// MTS-06 (calc level): order 30.00 + 20.00 + voided 15.00; voided excluded from total; split by item over the two live lines
b = B([L(3000), L(2000), L(1500, 1, true)], S({ sc: false, sst: false }));
s = calc.splitByItem(b.grandTotalSen, [3000, 2000]);
check('MTS-06', 'Voided 15.00 excluded; by-item split of live lines (calc level)', { subtotalSen: 5000, amounts: [3000, 2000], sum: 5000 }, { subtotalSen: b.subtotalSen, amounts: s.amounts, sum: s.amounts.reduce((a, c) => a + c, 0) });
// MTS-07
b = B([L(4000)], S({}), 'dine_in', { kind: 'pct', bp: 10000 });
check('MTS-07', '100% discount on 40.00', { discountSen: 4000, serviceChargeSen: 0, sstSen: 0, grandTotalSen: 0, anyNegative: false },
  Object.assign(pick(b, ['discountSen', 'serviceChargeSen', 'sstSen', 'grandTotalSen']), { anyNegative: Object.values(b).some(v => v < 0) }));
b = B([L(4000)], S({}), 'dine_in', { kind: 'rm', sen: 5000 });
check('MTS-07', 'RM 50.00 discount capped at 40.00', { discountSen: 4000, grandTotalSen: 0, anyNegative: false },
  Object.assign(pick(b, ['discountSen', 'grandTotalSen']), { anyNegative: Object.values(b).some(v => v < 0) }));
// MTS-08 (calc level only): empty / all-voided give 0.00; the payment block itself is UI
check('MTS-08', 'Empty order total 0.00 (calc level; UI block NOT EXECUTED)', 0, B([], S({})).grandTotalSen);
check('MTS-08', 'All-voided order total 0.00 (calc level)', 0, B([L(1000, 1, true)], S({})).grandTotalSen);
// MTS-09 (calc level): cash below due rejected with a reason
const c = calc.cashChange(11660, 11000);
check('MTS-09', 'Cash 110.00 vs due 116.60 rejected (calc level; UI block NOT EXECUTED)', { ok: false, hasReason: true }, { ok: c.ok, hasReason: typeof c.reason === 'string' && c.reason.length > 0 });
check('MTS-09', 'Cash equal to due accepted, change 0.00', { ok: true, changeSen: 0 }, calc.cashChange(11660, 11660));
// MTS-11 (calc level): SST off gives sst 0
b = B([L(10000)], S({ sst: false }));
check('MTS-11', 'SST off: sst 0.00, total 110.00 (calc level; bill/receipt display NOT EXECUTED)', { sstSen: 0, grandTotalSen: 11000 }, pick(b, ['sstSen', 'grandTotalSen']));
console.log(`\nSUMMARY pass=${pass} fail=${fail}`);
console.log('NOT EXECUTED: MTS-08 UI block, MTS-09 UI block, MTS-10 (refresh mid-order; ordering UI not built), MTS-11 bill/receipt display, MTS-12 (Chinese on receipt; receipt not built).');
process.exit(fail ? 1 : 0);
