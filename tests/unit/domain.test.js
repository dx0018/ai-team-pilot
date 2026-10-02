const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { createRequire } = require('module');

const requireFromRoot = createRequire(path.join(__dirname, '..', '..', 'package.json'));
const domain = requireFromRoot('./js/domain.js');
const clock = requireFromRoot('./js/clock.js');

function at(hour, minute) {
  return new Date(2026, 9, 1, hour, minute, 0).toISOString();
}

function item(id, sen, name) {
  return { id: id, name: name || id, priceSen: sen };
}

function dine(now) {
  return domain.newDineIn('t5', now || at(12, 0));
}

test('addItem snapshots the name and price and starts at qty 1', () => {
  const opened = dine();
  const next = domain.addItem(opened, item('nasi-lemak', 1200, 'Nasi Lemak 椰浆饭'));
  assert.equal(opened.lines.length, 0);
  assert.equal(next.lines.length, 1);
  assert.equal(next.lines[0].name, 'Nasi Lemak 椰浆饭');
  assert.equal(next.lines[0].unitPriceSen, 1200);
  assert.equal(next.lines[0].qty, 1);
  assert.equal(next.lines[0].committed, false);
  assert.equal(next.lines[0].void, null);
  assert.equal(next.state, 'ordering');
});

test('qty +/− changes an uncommitted line and − at 1 removes it', () => {
  let order = domain.addItem(dine(), item('teh', 250, 'Teh Tarik'));
  const id = order.lines[0].id;
  order = domain.incQty(order, id);
  assert.equal(order.lines[0].qty, 2);
  order = domain.decQty(order, id);
  assert.equal(order.lines[0].qty, 1);
  order = domain.decQty(order, id);
  assert.equal(domain.isEmpty(order), true);
});

test('a note is stored on the line', () => {
  let order = domain.addItem(dine(), item('nasi', 1200, 'Nasi Lemak'));
  order = domain.setNote(order, order.lines[0].id, 'Less spicy');
  assert.equal(order.lines[0].note, 'Less spicy');
});

test('void requires a reason, stamps the void date, and keeps the line', () => {
  const when = at(23, 55);
  let order = domain.addItem(dine(when), item('nasi', 1200, 'Nasi Lemak'));
  assert.throws(() => domain.voidLine(order, order.lines[0].id, '   ', when), /reason/);
  order = domain.voidLine(order, order.lines[0].id, ' Wrong item ', when);
  assert.equal(order.lines.length, 1);
  assert.equal(order.lines[0].void.reason, 'Wrong item');
  assert.equal(order.lines[0].void.businessDate, clock.businessDate(when));
  assert.deepEqual(order.voidDates, [clock.businessDate(when)]);
  assert.equal(domain.isEmpty(order), false);
});

test('void dates are the sorted distinct dates of voided lines', () => {
  const evening = at(23, 55);
  const nextMorning = new Date(2026, 9, 2, 0, 10, 0).toISOString();
  let order = domain.addItem(dine(evening), item('a', 100, 'A'));
  order = domain.addItem(order, item('b', 100, 'B'));
  order = domain.addItem(order, item('c', 100, 'C'));
  order = domain.voidLine(order, order.lines[0].id, 'Out', nextMorning);
  order = domain.voidLine(order, order.lines[1].id, 'Out', evening);
  order = domain.voidLine(order, order.lines[2].id, 'Out', evening);
  assert.deepEqual(order.voidDates, [clock.businessDate(evening), clock.businessDate(nextMorning)].sort());
});

test('opening the bill commits lines and − is refused afterwards', () => {
  let order = domain.addItem(dine(), item('nasi', 1200, 'Nasi Lemak'));
  assert.throws(() => domain.openBill(domain.newDineIn('t1', at(12, 0))), /Add an item/);
  order = domain.openBill(order);
  assert.equal(order.state, 'bill_requested');
  assert.equal(order.lines[0].committed, true);
  assert.throws(() => domain.decQty(order, order.lines[0].id), /voided/);
  assert.throws(() => domain.incQty(order, order.lines[0].id), /voided/);
});

test('adding an item to a bill returns to Ordering and clears the split', () => {
  let order = domain.addItem(dine(), item('nasi', 1000, 'Nasi'));
  order = domain.openBill(order);
  order = domain.setSplit(order, { mode: 'equal', n: 2 });
  order = domain.addItem(order, item('teh', 250, 'Teh'));
  assert.equal(order.state, 'ordering');
  assert.equal(order.split, null);
  assert.equal(order.lines[0].committed, true);
  assert.equal(order.lines[1].committed, false);
});

test('canPay blocks an empty order and an all-voided order', () => {
  const empty = dine();
  assert.equal(domain.canPay(empty).ok, false);
  let order = domain.addItem(empty, item('nasi', 1000, 'Nasi'));
  order = domain.voidLine(order, order.lines[0].id, 'Out', at(12, 0));
  assert.equal(domain.canPay(order).ok, false);
  assert.match(domain.canPay(order).reason, /item/);
});

test('split-by-item bases sum qty × price of each sub-bill and skip voids', () => {
  let order = domain.addItem(dine(), item('a', 1000, 'A'));
  order = domain.addItem(order, item('b', 2000, 'B'));
  order = domain.addItem(order, item('c', 500, 'C'));
  order = domain.incQty(order, order.lines[0].id);
  order = domain.setSplit(order, { mode: 'item', count: 3 });
  order = domain.assignLine(order, order.lines[0].id, 0);
  order = domain.assignLine(order, order.lines[1].id, 1);
  order = domain.assignLine(order, order.lines[2].id, 2);
  assert.deepEqual(domain.splitItemBases(order), [2000, 2000, 500]);
  order = domain.voidLine(order, order.lines[1].id, 'Wrong item', at(12, 0));
  assert.deepEqual(domain.splitItemBases(order), [2000, 0, 500]);
  assert.equal(domain.canPay(order).ok, false);
  order = domain.setSplit(order, { mode: 'item', count: 2 });
  order = domain.assignLine(order, order.lines[0].id, 0);
  order = domain.assignLine(order, order.lines[2].id, 1);
  assert.deepEqual(domain.splitItemBases(order), [2000, 500]);
  assert.equal(domain.canPay(order).ok, true);
});

test('equal split rejects a count outside 2..20', () => {
  const order = domain.addItem(dine(), item('a', 1000, 'A'));
  assert.throws(() => domain.setSplit(order, { mode: 'equal', n: 1 }), /2 to 20/);
  assert.throws(() => domain.setSplit(order, { mode: 'equal', n: 21 }), /2 to 20/);
  assert.equal(domain.setSplit(order, { mode: 'equal', n: 2 }).split.n, 2);
  assert.equal(domain.setSplit(order, { mode: 'equal', n: 20 }).split.n, 20);
});

test('closeTable marks a paid order closed', () => {
  let order = domain.addItem(dine(), item('a', 1000, 'A'));
  assert.throws(() => domain.closeTable(order), /paid/);
  order.state = 'paid';
  order.bill = { billNo: 'B-20261001-0001' };
  order = domain.closeTable(order);
  assert.equal(order.closed, true);
  assert.ok(order.closedAt);
});
