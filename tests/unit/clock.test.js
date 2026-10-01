const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { createRequire } = require('module');

const requireFromRoot = createRequire(path.join(__dirname, '..', '..', 'package.json'));
const clock = requireFromRoot('./js/clock.js');

function pad(n) {
  return n < 10 ? '0' + n : String(n);
}

function localDate(value) {
  const parsed = new Date(value);
  return parsed.getFullYear() + '-' + pad(parsed.getMonth() + 1) + '-' + pad(parsed.getDate());
}

test('clock.now and businessDate follow the device timezone', () => {
  clock.setOverride(null);
  const iso = clock.now();
  assert.equal(Number.isNaN(new Date(iso).getTime()), false);
  assert.equal(clock.businessDate(iso), localDate(iso));
});

test('clock.setOverride freezes now and businessDate until cleared', () => {
  const evening = new Date(2026, 9, 1, 23, 50, 0).toISOString();
  const afterMidnight = new Date(2026, 9, 2, 0, 10, 0).toISOString();
  clock.setOverride(evening);
  assert.equal(clock.now(), evening);
  assert.equal(clock.businessDate(), localDate(evening));
  assert.equal(clock.businessDate(afterMidnight), localDate(afterMidnight));
  assert.notEqual(localDate(evening), localDate(afterMidnight));
  clock.setOverride(null);
  assert.notEqual(clock.now(), evening);
});

test('clock.businessDate rejects an invalid date', () => {
  assert.throws(() => clock.businessDate('not-a-date'), RangeError);
});
