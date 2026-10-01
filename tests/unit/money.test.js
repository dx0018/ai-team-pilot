const test = require('node:test');
const assert = require('node:assert/strict');
const money = require('../../js/money.js');

const MINUS = '\u2212';

test('parseMoney accepts sen amounts used by the PRD', () => {
  assert.deepEqual(money.parseMoney('0'), { ok: true, sen: 0 });
  assert.deepEqual(money.parseMoney('0.00'), { ok: true, sen: 0 });
  assert.deepEqual(money.parseMoney('0.10'), { ok: true, sen: 10 });
  assert.deepEqual(money.parseMoney('0.20'), { ok: true, sen: 20 });
  assert.deepEqual(money.parseMoney('0.30'), { ok: true, sen: 30 });
  assert.deepEqual(money.parseMoney('0.5'), { ok: true, sen: 50 });
  assert.deepEqual(money.parseMoney('5.00'), { ok: true, sen: 500 });
  assert.deepEqual(money.parseMoney('10.05'), { ok: true, sen: 1005 });
  assert.deepEqual(money.parseMoney('12.34'), { ok: true, sen: 1234 });
  assert.deepEqual(money.parseMoney('12.35'), { ok: true, sen: 1235 });
  assert.deepEqual(money.parseMoney('26.50'), { ok: true, sen: 2650 });
  assert.deepEqual(money.parseMoney('40'), { ok: true, sen: 4000 });
  assert.deepEqual(money.parseMoney('50.00'), { ok: true, sen: 5000 });
  assert.deepEqual(money.parseMoney('100'), { ok: true, sen: 10000 });
  assert.deepEqual(money.parseMoney(' 25.00 '), { ok: true, sen: 2500 });
});

test('parseMoney rejects negatives, extra decimals and non-numeric text', () => {
  ['-1', '-0.01', '1.234', '1.2.3', 'abc', '', '  ', 'RM 1.00', '+1.00'].forEach((text) => {
    const result = money.parseMoney(text);
    assert.equal(result.ok, false);
    assert.equal(typeof result.error, 'string');
    assert.ok(result.error.length > 0);
  });
  assert.equal(money.parseMoney(12.34).ok, false);
});

test('formatRM and formatSigned match the PRD display', () => {
  assert.equal(money.formatRM(1234), 'RM 12.34');
  assert.equal(money.formatRM(0), 'RM 0.00');
  assert.equal(money.formatRM(30), 'RM 0.30');
  assert.equal(money.formatRM(1440), 'RM 14.40');
  assert.equal(money.formatSigned(2), '+0.02');
  assert.equal(money.formatSigned(1), '+0.01');
  assert.equal(money.formatSigned(0), '0.00');
  assert.equal(money.formatSigned(-1), MINUS + '0.01');
  assert.equal(money.formatSigned(-2), MINUS + '0.02');
});

test('parseRate accepts 0–100 with at most 2 decimals, including 10.25%', () => {
  assert.deepEqual(money.parseRate('0'), { ok: true, bp: 0 });
  assert.deepEqual(money.parseRate('6'), { ok: true, bp: 600 });
  assert.deepEqual(money.parseRate('10'), { ok: true, bp: 1000 });
  assert.deepEqual(money.parseRate('10.25'), { ok: true, bp: 1025 });
  assert.deepEqual(money.parseRate('100'), { ok: true, bp: 10000 });
  assert.deepEqual(money.parseRate('100.00'), { ok: true, bp: 10000 });
  assert.deepEqual(money.parseRate('0.5'), { ok: true, bp: 50 });
});

test('parseRate rejects out-of-range and non-numeric rates', () => {
  ['-1', '101', '100.01', '10.256', 'abc', '', '6.5.1'].forEach((text) => {
    const result = money.parseRate(text);
    assert.equal(result.ok, false);
    assert.equal(typeof result.error, 'string');
  });
});
