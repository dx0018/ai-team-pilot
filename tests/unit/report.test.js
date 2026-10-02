const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { createRequire } = require('module');

const requireFromRoot = createRequire(path.join(__dirname, '..', '..', 'package.json'));
const report = requireFromRoot('./js/report.js');

function paid(method, type, totals, date) {
  return {
    id: method + '-' + type,
    type: type,
    tableId: 't1',
    bill: {
      billNo: 'B-20261002-0001',
      businessDate: date,
      totals: totals,
      payment: { method: method },
      void: null
    }
  };
}

test('summariseDay totals bills by method and type', () => {
  const day = report.summariseDay('2026-10-02', [
    paid('Cash', 'dine_in', {
      subtotalSen: 2100, discountSen: 0, serviceChargeSen: 210, sstSen: 139, roundingSen: 1, grandTotalSen: 2450
    }, '2026-10-02'),
    paid('Card', 'takeaway', {
      subtotalSen: 250, discountSen: 0, serviceChargeSen: 0, sstSen: 15, roundingSen: 0, grandTotalSen: 265
    }, '2026-10-02'),
    paid('Cash', 'dine_in', {
      subtotalSen: 100, discountSen: 0, serviceChargeSen: 10, sstSen: 7, roundingSen: -2, grandTotalSen: 115
    }, '2026-10-01')
  ], []);
  assert.equal(day.billCount, 2);
  assert.equal(day.grossSen, 2350);
  assert.equal(day.serviceChargeSen, 210);
  assert.equal(day.sstSen, 154);
  assert.equal(day.roundingSen, 1);
  assert.equal(day.netSen, 2715);
  assert.equal(day.byMethod.Cash.billCount, 1);
  assert.equal(day.byMethod.Cash.netSen, 2450);
  assert.equal(day.byMethod.Card.netSen, 265);
  assert.equal(day.byType.dine_in.netSen + day.byType.takeaway.netSen, day.netSen);
  assert.deepEqual(day.voidedBills, []);
});

test('voids are listed by the void date, separate from the bill date', () => {
  const order = {
    id: 'late',
    type: 'dine_in',
    tableId: 't5',
    lines: [
      { id: 'a', name: 'Nasi Lemak', qty: 1, unitPriceSen: 1200, void: null },
      {
        id: 'b',
        name: 'Teh Tarik',
        qty: 2,
        unitPriceSen: 250,
        void: { reason: 'Out of stock', at: '2026-10-01T15:55:00.000Z', businessDate: '2026-10-01' }
      }
    ],
    bill: {
      billNo: 'B-20261002-0004',
      businessDate: '2026-10-02',
      totals: { subtotalSen: 1200, discountSen: 0, serviceChargeSen: 120, sstSen: 79, roundingSen: 1, grandTotalSen: 1400 },
      payment: { method: 'DuitNow QR' },
      void: null
    }
  };
  const paidDay = report.summariseDay('2026-10-02', [order], [order]);
  assert.equal(paidDay.billCount, 1);
  assert.equal(paidDay.voidedItems.length, 0);
  const voidDay = report.summariseDay('2026-10-01', [], [order]);
  assert.equal(voidDay.billCount, 0);
  assert.equal(voidDay.voidedItems.length, 1);
  assert.equal(voidDay.voidedItems[0].reason, 'Out of stock');
  assert.equal(voidDay.voidedItems[0].amountSen, 500);
  assert.equal(voidDay.voidedItems[0].billNo, 'B-20261002-0004');
  assert.equal(voidDay.netSen, 0);
});

test('a day with no bills is all zeros', () => {
  const day = report.summariseDay('2026-10-03', [], []);
  assert.equal(day.billCount, 0);
  assert.equal(day.grossSen, 0);
  assert.equal(day.netSen, 0);
  assert.deepEqual(day.voidedItems, []);
  assert.deepEqual(day.voidedBills, []);
});
