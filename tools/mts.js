'use strict';

const path = require('path');
const { createRequire } = require('module');

const requireFromRoot = createRequire(path.join(__dirname, '..', 'package.json'));
const calc = requireFromRoot('./js/calc.js');
const domain = requireFromRoot('./js/domain.js');
const money = requireFromRoot('./js/money.js');

function settings(extra) {
  const next = {
    serviceCharge: {
      dineIn: { enabled: true, rateBp: 1000 },
      takeaway: { enabled: false, rateBp: 1000 }
    },
    sst: { enabled: true, rateBp: 600, includesServiceCharge: true },
    rounding: { enabled: true }
  };
  if (!extra) return next;
  if (extra.sc === false) {
    next.serviceCharge.dineIn.enabled = false;
    next.serviceCharge.takeaway.enabled = false;
  }
  if (extra.sst === false) next.sst.enabled = false;
  if (extra.includes === false) next.sst.includesServiceCharge = false;
  if (extra.rounding === false) next.rounding.enabled = false;
  return next;
}

function line(sen, qty, voided) {
  return { unitPriceSen: sen, qty: qty || 1, void: voided ? { reason: 'void' } : null };
}

let failed = 0;

function printCase(n, input, output) {
  const id = 'MTS-' + (n < 10 ? '0' : '') + n;
  console.log(id);
  console.log('input: ' + JSON.stringify(input));
  console.log('output: ' + JSON.stringify(output));
  console.log('');
}

function expect(n, ok, detail) {
  if (ok) return;
  failed += 1;
  console.log('MISMATCH MTS-' + n + ' ' + detail);
}

const mts1 = calc.computeBill({
  lines: [line(10000)],
  billDiscount: null,
  orderType: 'dine_in',
  settings: settings()
});
printCase(1, { orderType: 'dine_in', subtotal: 'RM 100.00', sc: '10%', sst: '6% on base + SC' }, {
  serviceCharge: money.formatRM(mts1.serviceChargeSen),
  sst: money.formatRM(mts1.sstSen),
  total: money.formatRM(mts1.grandTotalSen),
  sen: mts1
});
expect(1, mts1.serviceChargeSen === 1000 && mts1.sstSen === 660 && mts1.grandTotalSen === 11660, JSON.stringify(mts1));

const mts2 = calc.computeBill({
  lines: [line(10000)],
  billDiscount: null,
  orderType: 'dine_in',
  settings: settings({ includes: false })
});
printCase(2, { orderType: 'dine_in', subtotal: 'RM 100.00', sst: '6% on subtotal only' }, {
  serviceCharge: money.formatRM(mts2.serviceChargeSen),
  sst: money.formatRM(mts2.sstSen),
  total: money.formatRM(mts2.grandTotalSen),
  sen: mts2
});
expect(2, mts2.serviceChargeSen === 1000 && mts2.sstSen === 600 && mts2.grandTotalSen === 11600, JSON.stringify(mts2));

const mts3 = calc.computeBill({
  lines: [line(2500)],
  billDiscount: null,
  orderType: 'takeaway',
  settings: settings()
});
printCase(3, { orderType: 'takeaway', subtotal: 'RM 25.00', sc: 'off', sst: '6%' }, {
  serviceCharge: money.formatRM(mts3.serviceChargeSen),
  sst: money.formatRM(mts3.sstSen),
  total: money.formatRM(mts3.grandTotalSen),
  sen: mts3
});
expect(3, mts3.serviceChargeSen === 0 && mts3.sstSen === 150 && mts3.grandTotalSen === 2650, JSON.stringify(mts3));

const roundingRows = [1001, 1002, 1003, 1004, 1006, 1007, 1008, 1009].map(function (sen) {
  const result = calc.computeBill({
    lines: [line(sen)],
    billDiscount: null,
    orderType: 'dine_in',
    settings: settings({ sc: false, sst: false })
  });
  return {
    preRounding: money.formatRM(sen),
    rounding: money.formatSigned(result.roundingSen),
    total: money.formatRM(result.grandTotalSen),
    roundingSen: result.roundingSen,
    grandTotalSen: result.grandTotalSen
  };
});
printCase(4, { sc: 'off', sst: 'off', discount: 'off', endings: '.01 .02 .03 .04 .06 .07 .08 .09' }, roundingRows);
const expectedRound = [
  [1000, -1], [1000, -2], [1005, 2], [1005, 1], [1005, -1], [1005, -2], [1010, 2], [1010, 1]
];
expectedRound.forEach(function (pair, index) {
  expect(4, roundingRows[index].grandTotalSen === pair[0] && roundingRows[index].roundingSen === pair[1], JSON.stringify(roundingRows[index]));
});

const mts5 = calc.splitEqual(10000, 3);
printCase(5, { grandTotal: 'RM 100.00', n: 3 }, {
  amounts: mts5.amounts.map(money.formatRM),
  remainder: money.formatRM(mts5.remainderSen),
  sen: mts5
});
expect(5, mts5.amounts[0] === 3334 && mts5.amounts[1] === 3333 && mts5.amounts[2] === 3333 && mts5.remainderSen === 1, JSON.stringify(mts5));

const when = new Date(2026, 9, 1, 12, 0, 0).toISOString();
let order = domain.newDineIn('t1', when);
order = domain.addItem(order, { id: 'a', name: 'Item A', priceSen: 1000 });
order = domain.addItem(order, { id: 'b', name: 'Item B', priceSen: 500 });
order = domain.setSplit(order, { mode: 'item', count: 2 });
order = domain.assignLine(order, order.lines[0].id, 0);
order = domain.assignLine(order, order.lines[1].id, 1);
order = domain.voidLine(order, order.lines[1].id, 'Wrong item', when);
const bases = domain.splitItemBases(order);
const live = calc.computeBill({
  lines: order.lines,
  billDiscount: null,
  orderType: 'dine_in',
  settings: settings()
});
const mts6 = calc.splitByItem(live.grandTotalSen, bases);
printCase(6, {
  lines: [
    { name: 'Item A', price: 'RM 10.00', void: null },
    { name: 'Item B', price: 'RM 5.00', void: 'Wrong item' }
  ],
  basesSen: bases
}, { grandTotal: money.formatRM(live.grandTotalSen), amounts: mts6.amounts.map(money.formatRM), sen: mts6 });
expect(6, bases[0] === 1000 && bases[1] === 0 && mts6.amounts[1] === 0, JSON.stringify({ bases: bases, split: mts6 }));

const mts7 = calc.computeBill({
  lines: [line(5000)],
  billDiscount: { kind: 'pct', bp: 10000 },
  orderType: 'dine_in',
  settings: settings()
});
printCase(7, { subtotal: 'RM 50.00', discount: '100%' }, {
  discount: money.formatRM(mts7.discountSen),
  serviceCharge: money.formatRM(mts7.serviceChargeSen),
  sst: money.formatRM(mts7.sstSen),
  total: money.formatRM(mts7.grandTotalSen),
  sen: mts7
});
expect(7, mts7.grandTotalSen === 0 && mts7.sstSen === 0 && mts7.serviceChargeSen === 0 && mts7.discountSen === 5000, JSON.stringify(mts7));

const empty = domain.canPay(domain.newDineIn('t1', when));
printCase(8, { lines: [] }, empty);
expect(8, empty.ok === false, JSON.stringify(empty));

const short = calc.cashChange(2650, 2000);
printCase(9, { due: 'RM 26.50', received: 'RM 20.00' }, short);
expect(9, short.ok === false, JSON.stringify(short));

printCase(10, { action: 'refresh the browser mid-order' }, {
  note: 'Not a calc.js result. tests/e2e/smoke.test.js reloads mid-order and again after payment, then reads the bill back from IndexedDB.'
});

const mts11 = calc.computeBill({
  lines: [line(10000)],
  billDiscount: null,
  orderType: 'dine_in',
  settings: settings({ sst: false })
});
printCase(11, { sst: 'off', subtotal: 'RM 100.00' }, {
  sstSen: mts11.sstSen,
  total: money.formatRM(mts11.grandTotalSen),
  sen: mts11
});
expect(11, mts11.sstSen === 0, JSON.stringify(mts11));

const chinese = 'Nasi Lemak 椰浆饭';
printCase(12, { name: chinese, unitPrice: 'RM 12.00' }, {
  name: chinese,
  lineAmount: money.formatRM(1200)
});
expect(12, chinese.indexOf('椰浆饭') !== -1, chinese);

if (failed) {
  console.log(failed + ' mismatch(es)');
  process.exit(1);
}
console.log('12 MTS cases printed');
