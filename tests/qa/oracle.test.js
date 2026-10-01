'use strict';

/**
 * SM-03 independent billing oracle.
 *
 * Rules: docs/PRD.md v0.5 (commit dabc649) — R1–R9, worked examples W1–W5,
 * A-16, and AC-19 through AC-38 where they state a number or a split rule.
 * Callable contract: docs/ARCHITECTURE.md v1.3 (commit 18560a0) §3.
 *   js/calc.js
 *   computeBill({ lines, billDiscount, orderType, settings }) →
 *     { subtotalSen, discountSen, baseSen, serviceChargeSen, sstSen,
 *       preRoundingSen, roundingSen, grandTotalSen }
 *   splitEqual(grandTotalSen, n) → { amounts[], remainderSen }
 *   splitByItem(grandTotalSen, bases[]) → { amounts[], remainderSen }
 * Nested fields (line.unitPriceSen / qty / void, billDiscount {kind,bp|sen},
 * order type 'dine_in'|'takeaway', settings.serviceCharge / sst / rounding)
 * are the §2 entities those parameters carry. §3 names the parameters and
 * does not restate the fields.
 *
 * Nothing under js/ is read to learn behaviour. js/calc.js is loaded only
 * for the comparison suite, and only by the three export names above.
 * If the file or those exports are missing, that suite is skipped.
 *
 * Money is integer sen (BigInt). Rates are basis points, 6% = 600,
 * 10% = 1000, 10.25% = 1025 (ARCHITECTURE §2), divided by 10_000 (R1, R11).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SEED = 20261001;
const ORDER_CASE_COUNT = 1000;
const EQUAL_SPLIT_COUNT = 190;
const BY_ITEM_SPLIT_COUNT = 160;

const BILL_FIELDS = [
  'subtotalSen',
  'discountSen',
  'baseSen',
  'serviceChargeSen',
  'sstSen',
  'preRoundingSen',
  'roundingSen',
  'grandTotalSen',
];

// R8 last-sen-digit adjustment. Second copy lives in assertBillInvariants.
const R8_ADJ = [0n, -1n, -2n, 2n, 1n, 0n, -1n, -2n, 2n, 1n];

function num(value) {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) {
    throw new Error(`sen ${value.toString()} is outside the safe integer range`);
  }
  return n;
}

// R6 / ARCHITECTURE §3 halfUpDiv. Non-negative integers.
// floor(n/d + 1/2) = (2n + d) // (2d). Half goes up (W2: 1.005 → 1.01),
// which is not banker's rounding (that would keep 100.5 sen at 100).
function halfUpDiv(numerator, denominator) {
  const n = BigInt(numerator);
  const d = BigInt(denominator);
  if (n < 0n || d <= 0n) {
    throw new Error('halfUpDiv expects non-negative inputs');
  }
  return (n * 2n + d) / (d * 2n);
}

// R8: nearest RM 0.05 by the last sen digit.
// .01/.02 down to .00, .03/.04 up to .05, .06/.07 down to .05, .08/.09 up to .10.
// .00 and .05 stay put (AC-30). No exact half-sen tie exists at whole sen.
function roundTo5Sen(sen) {
  const s = BigInt(sen);
  if (s < 0n) {
    throw new Error('R8 is specified for a non-negative pre-rounding total');
  }
  return s + R8_ADJ[Number(s % 10n)];
}

function serviceChargeFor(orderType, settings) {
  // Order.type is 'dine_in' | 'takeaway' (ARCHITECTURE §2). Settings keys
  // are dineIn and takeaway. PRD names are Dine-in and Takeaway.
  if (orderType === 'dine_in') return settings.serviceCharge.dineIn;
  if (orderType === 'takeaway') return settings.serviceCharge.takeaway;
  throw new Error(`orderType ${orderType} is not dine_in or takeaway`);
}

function referenceComputeBill(input) {
  const { lines, billDiscount, orderType, settings } = input;

  // R2 Subtotal: qty × unit price over non-voided lines only (AC-19).
  let subtotal = 0n;
  for (const ln of lines) {
    if (ln.void) continue;
    subtotal += BigInt(ln.qty) * BigInt(ln.unitPriceSen);
  }

  // R3 Bill-level discount. A percentage is converted to sen with half-up,
  // as in R6 (AC-32a: 1.235 → 1.24). An RM amount is already sen.
  // The discount is then capped at Subtotal, and Base = Subtotal − Discount.
  // AC-32a subtracts the rounded discount (12.35 − 1.24 = 11.11).
  // Item-level discounts are not applied; see the AC-71 todo.
  let discount = 0n;
  if (billDiscount && billDiscount.kind === 'pct') {
    if (billDiscount.bp < 0) {
      throw new Error('negative discount % is invalid input (R11)');
    }
    discount = halfUpDiv(subtotal * BigInt(billDiscount.bp), 10000n);
  } else if (billDiscount && billDiscount.kind === 'rm') {
    if (billDiscount.sen < 0) {
      throw new Error('negative RM discount is invalid input (R11)');
    }
    discount = BigInt(billDiscount.sen);
  } else if (billDiscount) {
    throw new Error('billDiscount.kind must be pct or rm');
  }
  if (discount > subtotal) discount = subtotal;
  const base = subtotal - discount;

  // R4 SC = Base × the order type's rate, and only when that type's SC is enabled.
  // R6 rounds SC to the nearest sen, half-sen up, before it is used again.
  const scCfg = serviceChargeFor(orderType, settings);
  const serviceCharge = scCfg.enabled
    ? halfUpDiv(base * BigInt(scCfg.rateBp), 10000n)
    : 0n;

  // R5 SST base is Base + rounded SC when "SST includes service charge" is on,
  // otherwise Base. Unrounded SC never enters the SST base (W1: 1.234 → 1.23,
  // then 13.57 × 6%). SST is 0 when SST is off (AC-26). R6 rounds SST.
  let sst = 0n;
  if (settings.sst.enabled) {
    const sstBase = settings.sst.includesServiceCharge ? base + serviceCharge : base;
    sst = halfUpDiv(sstBase * BigInt(settings.sst.rateBp), 10000n);
  }

  // R7 Pre-rounding total = Base + SC + SST (the already-rounded charge lines).
  const preRounding = base + serviceCharge + sst;

  // R8 Rounding adjustment is 0 when rounding is off (AC-31).
  // R9 Grand Total = pre-rounding total + Rounding Adjustment. It is never negative.
  let rounding = 0n;
  let grand = preRounding;
  if (settings.rounding.enabled) {
    grand = roundTo5Sen(preRounding);
    rounding = grand - preRounding;
  }
  if (grand < 0n) {
    throw new Error('R9 grand total went negative; the PRD states no separate clamp');
  }

  return {
    subtotalSen: num(subtotal),
    discountSen: num(discount),
    baseSen: num(base),
    serviceChargeSen: num(serviceCharge),
    sstSen: num(sst),
    preRoundingSen: num(preRounding),
    roundingSen: num(rounding),
    grandTotalSen: num(grand),
  };
}

function referenceSplitEqual(grandTotalSen, n) {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error('splitEqual n must be a positive integer');
  }
  const grand = BigInt(grandTotalSen);
  if (grand < 0n) throw new Error('negative grand total is outside R9');
  const nn = BigInt(n);
  // AC-34: allocate the Grand Total. Do not 5-sen-round the parts.
  // A-16 floors each share (35.00/3 = 11.666… down to 11.66). The whole
  // remainder (0.02 sen-lump) is added to sub-bill 1, which is index 0.
  // That is 11.68/11.66/11.66, not a one-sen spread (11.67/11.67/11.66).
  // AC-35 is the same rule: 100.00/3 → 33.34/33.33/33.33, remainder 1 sen.
  const floorEach = grand / nn;
  const remainder = grand % nn;
  const amounts = [];
  for (let i = 0; i < n; i += 1) {
    amounts.push(num(i === 0 ? floorEach + remainder : floorEach));
  }
  return { amounts, remainderSen: num(remainder) };
}

function referenceSplitByItem(grandTotalSen, bases) {
  const grand = BigInt(grandTotalSen);
  if (grand < 0n) throw new Error('negative grand total is outside R9');
  const parts = bases.map((base) => {
    const value = BigInt(base);
    if (value < 0n) throw new Error('negative base is outside AC-38');
    return value;
  });
  const sum = parts.reduce((acc, value) => acc + value, 0n);
  // AC-38 / §3: when Σbase = 0 every sub-bill is 0.00, and the return is all zero.
  if (sum === 0n) {
    return { amounts: parts.map(() => 0), remainderSen: 0 };
  }
  // AC-38: floor(GrandTotal_sen × base_i / Σbase). Remainder sen, as a lump,
  // go to sub-bill 1 (index 0). W5: floors 1165, 2331, 582, remainder 2.
  // Parts are not 5-sen rounded (A-16, AC-38).
  const floors = parts.map((base) => (grand * base) / sum);
  const floorSum = floors.reduce((acc, value) => acc + value, 0n);
  const remainder = grand - floorSum;
  const amounts = floors.map((floor, index) => num(index === 0 ? floor + remainder : floor));
  return { amounts, remainderSen: num(remainder) };
}

// --- second writing of the split rules, used only by assertions ---

function assertEqualSpec(grandTotalSen, n, result, message) {
  const grand = BigInt(grandTotalSen);
  const nn = BigInt(n);
  const floorEach = grand / nn;
  const remainder = grand % nn;
  assert.equal(result.amounts.length, n, message);
  assert.equal(result.remainderSen, num(remainder), message);
  assert.equal(result.amounts[0], num(floorEach + remainder), message);
  for (let i = 1; i < n; i += 1) {
    assert.equal(result.amounts[i], num(floorEach), message);
  }
  // SM-04 / AC-35: the parts sum to the Grand Total exactly.
  const sum = result.amounts.reduce((acc, value) => acc + value, 0);
  assert.equal(sum, grandTotalSen, message);
  for (const amount of result.amounts) {
    assert.ok(amount >= 0, message);
  }
}

function assertItemSpec(grandTotalSen, bases, result, message) {
  const grand = BigInt(grandTotalSen);
  const parts = bases.map((base) => BigInt(base));
  const sumBase = parts.reduce((acc, value) => acc + value, 0n);
  assert.equal(result.amounts.length, bases.length, message);
  if (sumBase === 0n) {
    for (const amount of result.amounts) assert.equal(amount, 0, message);
    assert.equal(result.remainderSen, 0, message);
    return;
  }
  const floors = parts.map((base) => (grand * base) / sumBase);
  const floorSum = floors.reduce((acc, value) => acc + value, 0n);
  const remainder = grand - floorSum;
  assert.equal(result.remainderSen, num(remainder), message);
  assert.equal(result.amounts[0], num(floors[0] + remainder), message);
  for (let i = 1; i < parts.length; i += 1) {
    assert.equal(result.amounts[i], num(floors[i]), message);
  }
  const sum = result.amounts.reduce((acc, value) => acc + value, 0);
  assert.equal(sum, grandTotalSen, message);
  for (const amount of result.amounts) assert.ok(amount >= 0, message);
}

// R8 digit table written again so a drift in roundTo5Sen fails generated cases.
const R8_ADJ_CHECK = [0, -1, -2, 2, 1, 0, -1, -2, 2, 1];

function halfUpCheck(numerator, denominator) {
  const n = BigInt(numerator);
  const d = BigInt(denominator);
  return (n * 2n + d) / (d * 2n);
}

function assertBillInvariants(input, bill, message) {
  for (const field of BILL_FIELDS) {
    assert.equal(typeof bill[field], 'number', `${message} ${field}`);
    assert.ok(Number.isSafeInteger(bill[field]), `${message} ${field}`);
  }
  for (const field of BILL_FIELDS) {
    if (field === 'roundingSen') continue;
    assert.ok(bill[field] >= 0, `${message} ${field} negative`);
  }
  // R3
  assert.equal(bill.baseSen, bill.subtotalSen - bill.discountSen, message);
  assert.ok(bill.discountSen <= bill.subtotalSen, message);
  // R7
  assert.equal(
    bill.preRoundingSen,
    bill.baseSen + bill.serviceChargeSen + bill.sstSen,
    message,
  );
  // R9
  assert.equal(bill.grandTotalSen, bill.preRoundingSen + bill.roundingSen, message);
  assert.ok(bill.grandTotalSen >= 0, message);

  let subtotal = 0n;
  for (const ln of input.lines) {
    if (ln.void) continue; // R2, AC-19
    subtotal += BigInt(ln.qty) * BigInt(ln.unitPriceSen);
  }
  assert.equal(BigInt(bill.subtotalSen), subtotal, message);

  let discount = 0n;
  if (input.billDiscount && input.billDiscount.kind === 'pct') {
    discount = halfUpCheck(subtotal * BigInt(input.billDiscount.bp), 10000n);
  } else if (input.billDiscount && input.billDiscount.kind === 'rm') {
    discount = BigInt(input.billDiscount.sen);
  }
  if (discount > subtotal) discount = subtotal;
  assert.equal(BigInt(bill.discountSen), discount, message);

  const scCfg = serviceChargeFor(input.orderType, input.settings);
  const serviceCharge = scCfg.enabled
    ? halfUpCheck(BigInt(bill.baseSen) * BigInt(scCfg.rateBp), 10000n)
    : 0n;
  assert.equal(BigInt(bill.serviceChargeSen), serviceCharge, message); // R4
  if (!scCfg.enabled) assert.equal(bill.serviceChargeSen, 0, message);

  let sst = 0n;
  if (input.settings.sst.enabled) {
    const sstBase = input.settings.sst.includesServiceCharge
      ? BigInt(bill.baseSen) + serviceCharge
      : BigInt(bill.baseSen);
    sst = halfUpCheck(sstBase * BigInt(input.settings.sst.rateBp), 10000n);
  }
  assert.equal(BigInt(bill.sstSen), sst, message); // R5
  if (!input.settings.sst.enabled) assert.equal(bill.sstSen, 0, message);

  if (!input.settings.rounding.enabled) {
    assert.equal(bill.roundingSen, 0, message); // R8, AC-31
    assert.equal(bill.grandTotalSen, bill.preRoundingSen, message);
  } else {
    const adj = R8_ADJ_CHECK[bill.preRoundingSen % 10];
    assert.equal(bill.roundingSen, adj, message); // R8
    assert.equal(bill.grandTotalSen % 5, 0, message);
  }
}

function baseSettings({
  dineInEnabled = true,
  dineInBp = 1000,
  takeawayEnabled = false,
  takeawayBp = 1000,
  sstEnabled = true,
  sstBp = 600,
  includesServiceCharge = true,
  rounding = true,
} = {}) {
  // Defaults: A-02 dine-in SC 10% on, takeaway SC off; A-01 SST 6%;
  // A-03 SST on Base + SC; A-04 rounding on. Stored rates are basis points.
  return {
    serviceCharge: {
      dineIn: { enabled: dineInEnabled, rateBp: dineInBp },
      takeaway: { enabled: takeawayEnabled, rateBp: takeawayBp },
    },
    sst: { enabled: sstEnabled, rateBp: sstBp, includesServiceCharge },
    rounding: { enabled: rounding },
  };
}

function chargesOff({ rounding = false } = {}) {
  return baseSettings({
    dineInEnabled: false,
    takeawayEnabled: false,
    sstEnabled: false,
    rounding,
  });
}

function line(unitPriceSen, qty = 1, voided = false) {
  return {
    unitPriceSen,
    qty,
    void: voided
      ? { reason: 'void', at: '2026-10-01T12:00:00.000Z', businessDate: '2026-10-01' }
      : null,
  };
}

function billInput(lines, {
  billDiscount = null,
  orderType = 'dine_in',
  settings = baseSettings(),
} = {}) {
  return { lines, billDiscount, orderType, settings };
}

function totals(
  subtotalSen,
  discountSen,
  baseSen,
  serviceChargeSen,
  sstSen,
  preRoundingSen,
  roundingSen,
  grandTotalSen,
) {
  return {
    subtotalSen,
    discountSen,
    baseSen,
    serviceChargeSen,
    sstSen,
    preRoundingSen,
    roundingSen,
    grandTotalSen,
  };
}

const HAND_BILLS = [
  {
    name: 'W1 dine-in base RM 12.34 (R4–R9)',
    input: billInput([line(1234)]),
    // SC 1.234 → 1.23; SST 13.57 × 6% = 0.8142 → 0.81; pre 14.38; +0.02; grand 14.40
    expected: totals(1234, 0, 1234, 123, 81, 1438, 2, 1440),
  },
  {
    name: 'W2 dine-in base RM 10.05 half-up (R6)',
    input: billInput([line(1005)]),
    // SC 1.005 → 1.01; SST 11.06 × 6% = 0.6636 → 0.66; pre 11.72; −0.02; grand 11.70
    expected: totals(1005, 0, 1005, 101, 66, 1172, -2, 1170),
  },
  {
    name: 'AC-27/W3/MTS-03 takeaway RM 25.00',
    input: billInput([line(2500)], { orderType: 'takeaway' }),
    expected: totals(2500, 0, 2500, 0, 150, 2650, 0, 2650),
  },
  {
    name: 'AC-32/W4/MTS-07 100% bill discount of RM 40.00',
    input: billInput([line(4000)], { billDiscount: { kind: 'pct', bp: 10000 } }),
    expected: totals(4000, 4000, 0, 0, 0, 0, 0, 0),
  },
  {
    name: 'AC-32/MTS-07 RM 50.00 discount capped at RM 40.00 (R3)',
    input: billInput([line(4000)], { billDiscount: { kind: 'rm', sen: 5000 } }),
    expected: totals(4000, 4000, 0, 0, 0, 0, 0, 0),
  },
  {
    name: 'W5 bill RM 10.00 + RM 20.00 + RM 5.00',
    input: billInput([line(1000), line(2000), line(500)]),
    // SC 3.50; SST 38.50 × 6% = 2.31; pre 40.81; rounding −0.01; grand 40.80
    expected: totals(3500, 0, 3500, 350, 231, 4081, -1, 4080),
  },
  {
    name: 'A-16 bill three RM 10.00 lines',
    input: billInput([line(1000), line(1000), line(1000)]),
    // SC 3.00; SST 33.00 × 6% = 1.98; pre 34.98; rounding +0.02; grand 35.00
    expected: totals(3000, 0, 3000, 300, 198, 3498, 2, 3500),
  },
  {
    name: 'AC-21 RM 0.10 + RM 0.20, SC SST and rounding off',
    input: billInput([line(10), line(20)], { settings: chargesOff() }),
    expected: totals(30, 0, 30, 0, 0, 30, 0, 30),
  },
  {
    name: 'AC-22 dine-in RM 100.00 default SC RM 10.00',
    input: billInput([line(10000)]),
    expected: totals(10000, 0, 10000, 1000, 660, 11660, 0, 11660),
  },
  {
    name: 'AC-22 takeaway RM 100.00 default SC RM 0.00',
    input: billInput([line(10000)], { orderType: 'takeaway' }),
    expected: totals(10000, 0, 10000, 0, 600, 10600, 0, 10600),
  },
  {
    name: 'AC-23 dine-in SC 5% on RM 100.00',
    input: billInput([line(10000)], {
      settings: baseSettings({ dineInBp: 500 }),
    }),
    expected: totals(10000, 0, 10000, 500, 630, 11130, 0, 11130),
  },
  {
    name: 'AC-23 dine-in SC switched off on RM 100.00',
    input: billInput([line(10000)], {
      settings: baseSettings({ dineInEnabled: false }),
    }),
    expected: totals(10000, 0, 10000, 0, 600, 10600, 0, 10600),
  },
  {
    name: 'AC-23 takeaway SC 10% switched on for RM 100.00',
    input: billInput([line(10000)], {
      orderType: 'takeaway',
      settings: baseSettings({ takeawayEnabled: true, takeawayBp: 1000 }),
    }),
    expected: totals(10000, 0, 10000, 1000, 660, 11660, 0, 11660),
  },
  {
    name: 'AC-24/MTS-01 dine-in RM 100.00, SC 10%, SST 6% on base + SC',
    input: billInput([line(10000)]),
    expected: totals(10000, 0, 10000, 1000, 660, 11660, 0, 11660),
  },
  {
    name: 'AC-25/MTS-02 SST on base only, dine-in RM 100.00',
    input: billInput([line(10000)], {
      settings: baseSettings({ includesServiceCharge: false }),
    }),
    expected: totals(10000, 0, 10000, 1000, 600, 11600, 0, 11600),
  },
  {
    name: 'AC-26/MTS-11 SST switched off, dine-in RM 100.00',
    input: billInput([line(10000)], {
      settings: baseSettings({ sstEnabled: false }),
    }),
    expected: totals(10000, 0, 10000, 1000, 0, 11000, 0, 11000),
  },
  {
    name: 'AC-28 unpaid bill uses SST 8%',
    input: billInput([line(10000)], {
      settings: baseSettings({ sstBp: 800 }),
    }),
    expected: totals(10000, 0, 10000, 1000, 880, 11880, 0, 11880),
  },
  {
    name: 'AC-32a 10% of RM 12.35 is RM 1.24, base RM 11.11',
    input: billInput([line(1235)], { billDiscount: { kind: 'pct', bp: 1000 } }),
    // Discount 124 sen. Base 1111. SC half-up 111.1 → 111.
    // SST base 1222 × 6% = 73.32 → 73. Pre 12.95, already on .05.
    expected: totals(1235, 124, 1111, 111, 73, 1295, 0, 1295),
  },
  {
    name: 'AC-32a fixed RM 5.00 discount on RM 12.35',
    input: billInput([line(1235)], { billDiscount: { kind: 'rm', sen: 500 } }),
    // Base 735. SC 73.5 → 74. SST base 809 × 6% = 48.54 → 49.
    // Pre 8.58 → grand 8.60, rounding +0.02.
    expected: totals(1235, 500, 735, 74, 49, 858, 2, 860),
  },
  {
    name: 'AC-19 voided RM 5.00 excluded; live line RM 10.00',
    input: billInput([line(1000), line(500, 1, true)]),
    expected: totals(1000, 0, 1000, 100, 66, 1166, -1, 1165),
  },
  {
    name: 'AC-36 qty 3 × RM 10.00 stays one line in the subtotal',
    input: billInput([line(1000, 3), line(1000)]),
    // Subtotal 40.00. SC 4.00. SST 44.00 × 6% = 2.64. Pre 46.64 → 46.65.
    expected: totals(4000, 0, 4000, 400, 264, 4664, 1, 4665),
  },
  {
    name: 'AC-37/MTS-06 voided RM 20.00 excluded from subtotal',
    input: billInput([line(1000), line(2000, 1, true), line(500)]),
    // Live base 15.00. SC 1.50. SST 16.50 × 6% = 0.99. Pre 17.49 → 17.50.
    expected: totals(1500, 0, 1500, 150, 99, 1749, 1, 1750),
  },
  {
    name: 'R2 qty 2 × RM 10.00, charges off',
    input: billInput([line(1000, 2)], { settings: chargesOff() }),
    expected: totals(2000, 0, 2000, 0, 0, 2000, 0, 2000),
  },
  {
    name: 'R2/AC-33 order with no lines',
    input: billInput([]),
    expected: totals(0, 0, 0, 0, 0, 0, 0, 0),
  },
  {
    name: 'R2/AC-19/AC-33 every line voided',
    input: billInput([line(1000, 1, true), line(2500, 2, true)]),
    expected: totals(0, 0, 0, 0, 0, 0, 0, 0),
  },
  {
    name: 'R6 5 sen × 10% is half a sen and rounds up',
    input: billInput([line(5)], {
      settings: baseSettings({ sstEnabled: false, rounding: false }),
    }),
    expected: totals(5, 0, 5, 1, 0, 6, 0, 6),
  },
  {
    name: 'R6 4 sen × 10% is 0.4 sen and stays 0',
    input: billInput([line(4)], {
      settings: baseSettings({ sstEnabled: false, rounding: false }),
    }),
    expected: totals(4, 0, 4, 0, 0, 4, 0, 4),
  },
  {
    name: 'R6 15 sen × 10% is 1.5 sen and rounds up',
    input: billInput([line(15)], {
      settings: baseSettings({ sstEnabled: false, rounding: false }),
    }),
    expected: totals(15, 0, 15, 2, 0, 17, 0, 17),
  },
  {
    name: 'R3/R6 50% of RM 10.01 half-up to RM 5.01',
    input: billInput([line(1001)], {
      billDiscount: { kind: 'pct', bp: 5000 },
      settings: chargesOff(),
    }),
    expected: totals(1001, 501, 500, 0, 0, 500, 0, 500),
  },
  {
    name: 'R8 1 sen rounds down to RM 0.00',
    input: billInput([line(1)], { settings: chargesOff({ rounding: true }) }),
    expected: totals(1, 0, 1, 0, 0, 1, -1, 0),
  },
  {
    name: 'R8 2 sen rounds down to RM 0.00',
    input: billInput([line(2)], { settings: chargesOff({ rounding: true }) }),
    expected: totals(2, 0, 2, 0, 0, 2, -2, 0),
  },
  {
    name: 'R8 3 sen rounds up to RM 0.05',
    input: billInput([line(3)], { settings: chargesOff({ rounding: true }) }),
    expected: totals(3, 0, 3, 0, 0, 3, 2, 5),
  },
  {
    name: 'R1 large dine-in RM 123456.78 in integer sen',
    input: billInput([line(12345678)]),
    // SC 1,234,567.8 → 1,234,568. SST base 13,580,246 × 6% = 814,814.76 → 814,815.
    // Pre 14,395,061 → 14,395,060.
    expected: totals(12345678, 0, 12345678, 1234568, 814815, 14395061, -1, 14395060),
  },
  {
    name: 'R5 W1 base with SST on base only',
    input: billInput([line(1234)], {
      settings: baseSettings({ includesServiceCharge: false }),
    }),
    // SC still 123. SST 12.34 × 6% = 0.7404 → 0.74. Pre 14.31 → 14.30.
    expected: totals(1234, 0, 1234, 123, 74, 1431, -1, 1430),
  },
  {
    name: 'R4 SC enabled at 0% is 0',
    input: billInput([line(10000)], {
      settings: baseSettings({ dineInBp: 0, sstEnabled: false, rounding: false }),
    }),
    expected: totals(10000, 0, 10000, 0, 0, 10000, 0, 10000),
  },
  {
    name: 'R3 RM discount equal to the subtotal',
    input: billInput([line(1235)], { billDiscount: { kind: 'rm', sen: 1235 } }),
    expected: totals(1235, 1235, 0, 0, 0, 0, 0, 0),
  },
  {
    name: 'R3 0% bill discount leaves the dine-in RM 100.00 bill unchanged',
    input: billInput([line(10000)], { billDiscount: { kind: 'pct', bp: 0 } }),
    expected: totals(10000, 0, 10000, 1000, 660, 11660, 0, 11660),
  },
  {
    name: 'R4/R6/R11 SC 10.25% of RM 100.00',
    input: billInput([line(10000)], {
      settings: baseSettings({ dineInBp: 1025 }),
    }),
    // SC 10.25 exactly. SST base 110.25 × 6% = 6.615 → 6.62.
    // Pre 116.87 → 116.85, rounding −0.02.
    expected: totals(10000, 0, 10000, 1025, 662, 11687, -2, 11685),
  },
  {
    name: 'R5 SST enabled at 0% is 0',
    input: billInput([line(10000)], {
      settings: baseSettings({ sstBp: 0 }),
    }),
    expected: totals(10000, 0, 10000, 1000, 0, 11000, 0, 11000),
  },
];

// AC-29 (MTS-04) and AC-30. SC, SST and discount are off, so pre-rounding
// equals the subtotal. Rounding stays on.
const AC29_ROWS = [
  ['10.01', 1001, 1000, -1],
  ['10.02', 1002, 1000, -2],
  ['10.03', 1003, 1005, 2],
  ['10.04', 1004, 1005, 1],
  ['10.06', 1006, 1005, -1],
  ['10.07', 1007, 1005, -2],
  ['10.08', 1008, 1010, 2],
  ['10.09', 1009, 1010, 1],
];
for (const [label, pre, grand, rounding] of AC29_ROWS) {
  HAND_BILLS.push({
    name: `AC-29/MTS-04 rounding ${label}`,
    input: billInput([line(pre)], { settings: chargesOff({ rounding: true }) }),
    expected: totals(pre, 0, pre, 0, 0, pre, rounding, grand),
  });
}
HAND_BILLS.push(
  {
    name: 'AC-30 pre-rounding RM 10.00 rounding line 0.00',
    input: billInput([line(1000)], { settings: chargesOff({ rounding: true }) }),
    expected: totals(1000, 0, 1000, 0, 0, 1000, 0, 1000),
  },
  {
    name: 'AC-30 pre-rounding RM 10.05 rounding line 0.00',
    input: billInput([line(1005)], { settings: chargesOff({ rounding: true }) }),
    expected: totals(1005, 0, 1005, 0, 0, 1005, 0, 1005),
  },
  {
    name: 'AC-31 rounding off leaves RM 10.01 unchanged',
    input: billInput([line(1001)], { settings: chargesOff({ rounding: false }) }),
    expected: totals(1001, 0, 1001, 0, 0, 1001, 0, 1001),
  },
  {
    name: 'AC-31 rounding off leaves RM 10.09 unchanged',
    input: billInput([line(1009)], { settings: chargesOff({ rounding: false }) }),
    expected: totals(1009, 0, 1009, 0, 0, 1009, 0, 1009),
  },
  {
    name: 'AC-31 rounding off keeps the W2 pre-rounding total RM 11.72',
    input: billInput([line(1005)], { settings: baseSettings({ rounding: false }) }),
    expected: totals(1005, 0, 1005, 101, 66, 1172, 0, 1172),
  },
);

function equalSplitSpec(grandTotalSen, n) {
  const grand = BigInt(grandTotalSen);
  const nn = BigInt(n);
  const floorEach = grand / nn;
  const remainder = grand % nn;
  const amounts = [];
  for (let i = 0; i < n; i += 1) {
    amounts.push(num(i === 0 ? floorEach + remainder : floorEach));
  }
  return { amounts, remainderSen: num(remainder) };
}

const ones = (count, value) => Array.from({ length: count }, () => value);

const HAND_SPLITS = [
  {
    name: 'AC-35/MTS-05 equal RM 100.00 / 3',
    kind: 'equal',
    grand: 10000,
    n: 3,
    amounts: [3334, 3333, 3333],
    remainderSen: 1,
  },
  {
    name: 'A-16 equal RM 35.00 / 3',
    kind: 'equal',
    grand: 3500,
    n: 3,
    amounts: [1168, 1166, 1166],
    remainderSen: 2,
  },
  {
    name: 'A-16 by-item three RM 10.00 bases',
    kind: 'item',
    grand: 3500,
    bases: [1000, 1000, 1000],
    amounts: [1168, 1166, 1166],
    remainderSen: 2,
  },
  {
    name: 'W5/AC-38 by-item RM 10 / RM 20 / RM 5',
    kind: 'item',
    grand: 4080,
    bases: [1000, 2000, 500],
    amounts: [1167, 2331, 582],
    remainderSen: 2,
  },
  {
    name: 'AC-38 Σbase 0 yields RM 0.00 sub-bills',
    kind: 'item',
    grand: 0,
    bases: [0, 0, 0],
    amounts: [0, 0, 0],
    remainderSen: 0,
  },
  {
    name: 'AC-38 Σbase 0 and a nonzero grand still yields RM 0.00',
    kind: 'item',
    grand: 500,
    bases: [0, 0],
    amounts: [0, 0],
    remainderSen: 0,
  },
  {
    name: 'AC-36 qty 3 line is one base of RM 30.00 beside RM 10.00',
    kind: 'item',
    grand: 4665,
    bases: [3000, 1000],
    amounts: [3499, 1166],
    remainderSen: 1,
  },
  {
    name: 'AC-37 voided line is left out of the bases',
    kind: 'item',
    grand: 1750,
    bases: [1000, 500],
    amounts: [1167, 583],
    remainderSen: 1,
  },
  {
    name: 'AC-34/AC-35 equal 1 sen across 2 people',
    kind: 'equal',
    grand: 1,
    n: 2,
    amounts: [1, 0],
    remainderSen: 1,
  },
  {
    name: 'AC-34 equal 101 sen across N=20',
    kind: 'equal',
    grand: 101,
    n: 20,
    amounts: [6, ...ones(19, 5)],
    remainderSen: 1,
  },
  {
    name: 'AC-38 by-item RM 0.10 across three 1-sen bases',
    kind: 'item',
    grand: 10,
    bases: [1, 1, 1],
    amounts: [4, 3, 3],
    remainderSen: 1,
  },
];

for (let n = 2; n <= 20; n += 1) {
  const spec = equalSplitSpec(10000, n);
  HAND_SPLITS.push({
    name: `AC-34 equal N=${n} of RM 100.00`,
    kind: 'equal',
    grand: 10000,
    n,
    amounts: spec.amounts,
    remainderSen: spec.remainderSen,
  });
}

// --- generated corpus (deterministic; money stays integer) ---

const EDGE_PRICES = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 49, 50, 95, 99, 100, 105, 123, 124, 125,
  200, 999, 1000, 1005, 1234, 1235, 2500, 4000, 10000,
];

function makePrng(seed) {
  // Numerical Recipes LCG, mod 2^32. Used only to pick integers, never as money.
  let state = seed >>> 0;
  return function next() {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state;
  };
}

function randomLines(rng, count) {
  const lines = [];
  for (let k = 0; k < count; k += 1) {
    const price = rng() % 3 === 0
      ? EDGE_PRICES[rng() % EDGE_PRICES.length]
      : rng() % 200001;
    const qty = 1 + (rng() % 12);
    const voided = rng() % 6 === 0;
    lines.push(line(price, qty, voided));
  }
  return lines;
}

function makeOrder(rng, index) {
  const band = index % 10;
  const step = Math.floor(index / 10);
  const orderType = step % 2 === 0 ? 'dine_in' : 'takeaway';
  let scEnabled = true;
  let scBp = 1000;
  let sstEnabled = true;
  let sstBp = 600;
  let includes = true;
  let rounding = true;
  let billDiscount = null;
  let lines;

  if (band === 0) {
    lines = step % 2 === 0
      ? []
      : [line(100 + (step % 50), 1, true), line(200, 2, true)];
  } else if (band === 1) {
    // 1 sen, charges off, rounding on: the R8 edge below one ringgit.
    lines = [line(1, 1 + (step % 5), false)];
    scEnabled = false;
    sstEnabled = false;
  } else if (band === 2) {
    // Last sen digit 0..9, including the RM 0.05 boundary, charges off.
    lines = [line(step % 10, 1, false)];
    if (step % 10 === 5) lines.push(line(5, 2, false));
    scEnabled = false;
    sstEnabled = false;
  } else if (band === 3) {
    const price = 1000000 + ((step * 997) % 5000000);
    lines = [line(price, 1 + (step % 9), false)];
    if (step % 2 === 0) lines.push(line(2500, 1, true));
    scBp = [1000, 1025, 500, 0, 10000][step % 5];
    sstBp = [600, 800, 1025, 0, 1000][step % 5];
  } else if (band === 4) {
    lines = randomLines(rng, 2 + (step % 4));
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = line(last.unitPriceSen, last.qty, true);
    billDiscount = {
      kind: 'pct',
      bp: [0, 1000, 5000, 10000, 3333, 50, 1025, 125][step % 8],
    };
    scBp = [0, 500, 1000, 1025, 800, 10000][step % 6];
  } else if (band === 5) {
    lines = [line(100 + (step % 400), 1 + (step % 3), false)];
    billDiscount = { kind: 'rm', sen: step % 2 === 0 ? 1000000 : (step % 80) };
  } else if (band === 6) {
    lines = randomLines(rng, 1 + (step % 5));
    scEnabled = false;
  } else if (band === 7) {
    lines = randomLines(rng, 1 + (step % 5));
    if (step % 2 === 0) sstEnabled = false;
    else includes = false;
  } else if (band === 8) {
    lines = randomLines(rng, 1 + (step % 6));
    rounding = false;
    scBp = 1025;
  } else {
    lines = randomLines(rng, step % 8);
    if (step % 5 === 1) billDiscount = { kind: 'pct', bp: step % 10001 };
    if (step % 5 === 2) billDiscount = { kind: 'rm', sen: (step * 17) % 5000 };
    scEnabled = step % 4 !== 0;
    sstEnabled = step % 5 !== 0;
    includes = step % 3 !== 0;
    rounding = step % 4 !== 0;
    scBp = step % 10001;
    sstBp = (step * 3) % 10001;
  }

  return {
    lines,
    billDiscount,
    orderType,
    settings: baseSettings({
      dineInEnabled: orderType === 'dine_in' ? scEnabled : false,
      dineInBp: scBp,
      takeawayEnabled: orderType === 'takeaway' ? scEnabled : false,
      takeawayBp: scBp,
      sstEnabled,
      sstBp,
      includesServiceCharge: includes,
      rounding,
    }),
  };
}

function generateOrders() {
  const rng = makePrng(SEED);
  const orders = [];
  for (let i = 0; i < ORDER_CASE_COUNT; i += 1) orders.push(makeOrder(rng, i));
  return orders;
}

function generateEqualSplits() {
  const rng = makePrng(SEED);
  const edges = [0, 1, 2, 4, 5, 7, 9, 10, 99, 100, 101, 3500, 4080, 10000, 11660, 11670];
  const cases = [];
  for (let i = 0; i < EQUAL_SPLIT_COUNT; i += 1) {
    const n = 2 + (i % 19);
    const cycle = Math.floor(i / 19);
    let grand;
    if (cycle === 0) grand = edges[i % edges.length];
    else if (cycle === 1) grand = n * 100 + (n - 1); // remainder n−1, all on /1
    else if (cycle === 2) grand = 0;
    else grand = rng() % 50000001;
    cases.push({ grand, n });
  }
  return cases;
}

function generateItemSplits() {
  const rng = makePrng(SEED);
  const cases = [];
  for (let i = 0; i < BY_ITEM_SPLIT_COUNT; i += 1) {
    const n = 2 + (i % 19);
    // AC-36: each line is wholly in one base. A qty > 1 line is one entry,
    // never a shared or per-unit split. This generator does not build those.
    if (i % 20 === 0) {
      const grand = i % 40 === 0 ? 0 : 1 + (rng() % 5000);
      cases.push({ grand, bases: Array.from({ length: n }, () => 0) });
      continue;
    }
    const bases = [];
    for (let j = 0; j < n; j += 1) {
      const roll = rng() % 10;
      if (roll === 0) bases.push(0);
      else if (roll <= 2) {
        bases.push([1, 5, 10, 100, 500, 1000, 2000, 10000][rng() % 8]);
      } else bases.push(rng() % 100000);
    }
    const sum = bases.reduce((acc, value) => acc + value, 0);
    let grand;
    if (sum === 0) grand = 0;
    else if (i % 5 === 0) grand = sum;
    else grand = rng() % (sum * 2 + 1);
    cases.push({ grand, bases });
  }
  return cases;
}

const ORDERS = generateOrders();
const EQUAL_CASES = generateEqualSplits();
const ITEM_CASES = generateItemSplits();

function assertCorpus(orders) {
  const missing = [];
  const has = (pred, label) => {
    if (!orders.some(pred)) missing.push(label);
  };
  has((o) => o.lines.length === 0, 'empty order');
  has((o) => o.lines.length >= 5, '5 or more lines');
  has((o) => o.lines.some((ln) => ln.unitPriceSen === 1), '1 sen price');
  has((o) => o.lines.some((ln) => ln.unitPriceSen === 5), 'RM 0.05 price');
  has((o) => o.lines.some((ln) => ln.qty * ln.unitPriceSen >= 1000000), 'large line');
  has((o) => o.lines.some((ln) => ln.void) && o.lines.some((ln) => !ln.void), 'mixed void');
  has((o) => o.lines.length > 0 && o.lines.every((ln) => ln.void), 'all voided');
  has((o) => o.billDiscount && o.billDiscount.kind === 'pct', 'percent discount');
  has((o) => o.billDiscount && o.billDiscount.kind === 'pct' && o.billDiscount.bp === 10000, '100% discount');
  has((o) => o.billDiscount && o.billDiscount.kind === 'rm', 'RM discount');
  has((o) => o.billDiscount && o.billDiscount.kind === 'rm' && o.billDiscount.sen >= 1000000, 'RM discount over subtotal');
  has((o) => o.orderType === 'dine_in' && o.settings.serviceCharge.dineIn.enabled, 'dine-in SC on');
  has((o) => o.orderType === 'dine_in' && !o.settings.serviceCharge.dineIn.enabled, 'dine-in SC off');
  has((o) => o.orderType === 'takeaway' && o.settings.serviceCharge.takeaway.enabled, 'takeaway SC on');
  has((o) => o.orderType === 'takeaway' && !o.settings.serviceCharge.takeaway.enabled, 'takeaway SC off');
  has((o) => !o.settings.sst.enabled, 'SST off');
  has((o) => o.settings.sst.enabled && o.settings.sst.includesServiceCharge, 'SST includes SC');
  has((o) => o.settings.sst.enabled && !o.settings.sst.includesServiceCharge, 'SST on base only');
  has((o) => o.settings.rounding.enabled, 'rounding on');
  has((o) => !o.settings.rounding.enabled, 'rounding off');
  has((o) => o.settings.serviceCharge.dineIn.rateBp === 1025 || o.settings.serviceCharge.takeaway.rateBp === 1025, '10.25% rate');
  has((o) => o.lines.some((ln) => ln.qty > 1), 'qty greater than 1');
  if (missing.length) {
    throw new Error(`generated corpus is missing: ${missing.join(', ')}`);
  }
}

function caseMessage(label, index, payload) {
  return `seed=${SEED} ${label} #${index} ${JSON.stringify(payload)}`;
}

function loadImplementation() {
  const calcPath = path.resolve(__dirname, '../../js/calc.js');
  if (!fs.existsSync(calcPath)) {
    return {
      impl: null,
      reason: 'js/calc.js is not present (T-03 not built). The reference self-check still runs.',
    };
  }
  let loaded;
  try {
    loaded = require(calcPath);
  } catch (err) {
    const detail = err && err.message ? err.message : String(err);
    return {
      impl: null,
      reason: `js/calc.js could not be loaded (${detail}). The reference self-check still runs.`,
    };
  }
  const missing = ['computeBill', 'splitEqual', 'splitByItem']
    .filter((name) => !loaded || typeof loaded[name] !== 'function');
  if (missing.length) {
    return {
      impl: null,
      reason: `js/calc.js does not export ${missing.join(', ')} (ARCHITECTURE §3). The reference self-check still runs.`,
    };
  }
  return {
    impl: {
      computeBill: loaded.computeBill,
      splitEqual: loaded.splitEqual,
      splitByItem: loaded.splitByItem,
    },
    reason: null,
  };
}

function asSen(value, label) {
  if (typeof value === 'bigint') return num(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  throw new Error(`${label} must be integer sen, got ${typeof value} ${String(value)}`);
}

function billFromImpl(impl, input, label) {
  const out = impl.computeBill(JSON.parse(JSON.stringify(input)));
  const norm = {};
  for (const field of BILL_FIELDS) {
    if (!out || out[field] === undefined) {
      throw new Error(`${label} computeBill is missing ${field}`);
    }
    norm[field] = asSen(out[field], `${label}.${field}`);
  }
  return norm;
}

function splitFromImpl(out, label) {
  if (!out || !Array.isArray(out.amounts) || out.remainderSen === undefined) {
    throw new Error(`${label} must return { amounts[], remainderSen }`);
  }
  return {
    amounts: out.amounts.map((amount, index) => asSen(amount, `${label}.amounts[${index}]`)),
    remainderSen: asSen(out.remainderSen, `${label}.remainderSen`),
  };
}

const { impl, reason: SKIP_REASON } = loadImplementation();

console.log(
  `SM-03 oracle seed=${SEED} handBills=${HAND_BILLS.length} handSplits=${HAND_SPLITS.length} generatedOrders=${ORDER_CASE_COUNT} generatedSplits=${EQUAL_SPLIT_COUNT + BY_ITEM_SPLIT_COUNT}`,
);
if (SKIP_REASON) console.log(`SKIP SM-03 comparison: ${SKIP_REASON}`);

describe('SM-03 reference self-check', () => {
  test('AC-20 totals use the §3 field set', () => {
    const bill = referenceComputeBill(HAND_BILLS[0].input);
    assert.deepEqual(Object.keys(bill), BILL_FIELDS);
  });

  test('R6 half-up anchors from W1, W2 and AC-32a', () => {
    // 12.34 × 10% = 1.234 → 1.23; 10.05 × 10% = 1.005 → 1.01;
    // 12.35 × 10% = 1.235 → 1.24; W1 SST 0.8142 → 0.81; W2 SST 0.6636 → 0.66.
    assert.equal(num(halfUpDiv(1234000n, 10000n)), 123);
    assert.equal(num(halfUpDiv(1005000n, 10000n)), 101);
    assert.equal(num(halfUpDiv(1235000n, 10000n)), 124);
    assert.equal(num(halfUpDiv(814200n, 10000n)), 81);
    assert.equal(num(halfUpDiv(663600n, 10000n)), 66);
  });

  for (const fixture of HAND_BILLS) {
    test(fixture.name, () => {
      const got = referenceComputeBill(fixture.input);
      assert.deepEqual(got, fixture.expected, `seed=${SEED} ${fixture.name}`);
      assertBillInvariants(fixture.input, got, fixture.name);
      for (const field of BILL_FIELDS) {
        if (field === 'roundingSen') continue;
        assert.ok(got[field] >= 0, fixture.name);
      }
    });
  }

  for (const fixture of HAND_SPLITS) {
    test(fixture.name, () => {
      const got = fixture.kind === 'equal'
        ? referenceSplitEqual(fixture.grand, fixture.n)
        : referenceSplitByItem(fixture.grand, fixture.bases);
      assert.deepEqual(got, {
        amounts: fixture.amounts,
        remainderSen: fixture.remainderSen,
      }, `seed=${SEED} ${fixture.name}`);
      if (fixture.kind === 'equal') {
        assertEqualSpec(fixture.grand, fixture.n, got, fixture.name);
      } else {
        assertItemSpec(fixture.grand, fixture.bases, got, fixture.name);
      }
      if (fixture.name.startsWith('W5/')) {
        // PRD: "The floors of 4080 × base_i / 3500 sen are 1165, 2331 and 582".
        assert.equal(num((4080n * 1000n) / 3500n), 1165);
        assert.equal(num((4080n * 2000n) / 3500n), 2331);
        assert.equal(num((4080n * 500n) / 3500n), 582);
        assert.equal(got.amounts.reduce((acc, value) => acc + value, 0), 4080);
        assert.notEqual(got.amounts[0] % 5, 0);
      }
      if (fixture.name === 'AC-35/MTS-05 equal RM 100.00 / 3') {
        assert.equal(num(10000n / 3n), 3333);
        assert.equal(num(10000n % 3n), 1);
        assert.equal(got.amounts.reduce((acc, value) => acc + value, 0), 10000);
        assert.notEqual(got.amounts[0] % 5, 0); // AC-34: not 5-sen rounded
      }
      if (fixture.name === 'A-16 equal RM 35.00 / 3') {
        // 11.666… floored to 11.66, then the whole 0.02 goes to sub-bill 1.
        assert.equal(num(3500n / 3n), 1166);
        assert.equal(num(3500n % 3n), 2);
        assert.equal(got.amounts[0], 1168);
      }
      if (fixture.name === 'AC-34 equal N=3 of RM 100.00') {
        assert.deepEqual(fixture.amounts, [3334, 3333, 3333]);
        assert.equal(fixture.remainderSen, 1);
      }
      if (fixture.name.startsWith('AC-38 Σbase 0 and')) {
        assert.equal(got.amounts.reduce((acc, value) => acc + value, 0), 0);
        assert.notEqual(fixture.grand, 0);
      }
    });
  }

  test(`generated orders (${ORDER_CASE_COUNT}) reference invariants`, () => {
    assert.equal(ORDERS.length, ORDER_CASE_COUNT);
    assertCorpus(ORDERS);
    ORDERS.forEach((input, index) => {
      const message = caseMessage('order', index, input);
      const got = referenceComputeBill(input);
      assertBillInvariants(input, got, message);
    });
  });

  test(`generated equal splits (${EQUAL_SPLIT_COUNT}) reference invariants`, () => {
    assert.equal(EQUAL_CASES.length, EQUAL_SPLIT_COUNT);
    const seen = new Set();
    EQUAL_CASES.forEach((entry, index) => {
      seen.add(entry.n);
      const message = caseMessage('equal', index, entry);
      const got = referenceSplitEqual(entry.grand, entry.n);
      assertEqualSpec(entry.grand, entry.n, got, message);
    });
    for (let n = 2; n <= 20; n += 1) {
      assert.ok(seen.has(n), `missing equal split N=${n}`);
    }
  });

  test(`generated by-item splits (${BY_ITEM_SPLIT_COUNT}) reference invariants`, () => {
    assert.equal(ITEM_CASES.length, BY_ITEM_SPLIT_COUNT);
    let zeroBase = 0;
    ITEM_CASES.forEach((entry, index) => {
      const message = caseMessage('by-item', index, entry);
      const got = referenceSplitByItem(entry.grand, entry.bases);
      assertItemSpec(entry.grand, entry.bases, got, message);
      const sumBase = entry.bases.reduce((acc, value) => acc + value, 0);
      if (sumBase === 0) zeroBase += 1;
    });
    assert.ok(zeroBase > 0, 'corpus needs a Σbase = 0 split');
  });

  test('PRNG restarts at the same seed', () => {
    const again = generateOrders();
    assert.deepEqual(again[0], ORDERS[0]);
    assert.deepEqual(again[ORDER_CASE_COUNT - 1], ORDERS[ORDER_CASE_COUNT - 1]);
    const first = makePrng(SEED)();
    const second = makePrng(SEED)();
    assert.equal(first, second);
  });

  // PRD gaps. These are not guessed from an implementation.
  test.todo(
    'AC-71/R3 item-level discount: the PRD says item discounts (percent or RM) apply before the bill-level discount and that AC-38 base_i is the line sum after them, but it gives no line field, no per-line cap, no rule for whether each line is half-up rounded on its own, and no worked number. It also does not say whether a following bill-level percentage applies to the original subtotal or to the amount left after item discounts. §3 computeBill has no item-discount argument.',
  );
  test.todo(
    'AC-34/R11: a split count outside the whole numbers 2..20 is blocked before allocation. splitEqual is not given a result for n < 2, a non-integer n, or n > 20.',
  );
  test.todo(
    'R11/R9: negative unit prices, negative rates, a negative grand total, and a negative discount are invalid input and are blocked before calculation. No calc result is specified for them.',
  );
});

const comparison = { skip: SKIP_REASON || false };

describe('SM-03 implementation comparison', () => {
  test('hand-written bills match js/calc.js computeBill', comparison, () => {
    for (const fixture of HAND_BILLS) {
      const ref = referenceComputeBill(fixture.input);
      const actual = billFromImpl(impl, fixture.input, fixture.name);
      assert.deepEqual(actual, ref, `seed=${SEED} ${fixture.name}`);
      assert.deepEqual(actual, fixture.expected, `seed=${SEED} ${fixture.name}`);
      assertBillInvariants(fixture.input, actual, fixture.name);
    }
  });

  test('hand-written splits match js/calc.js splitEqual and splitByItem', comparison, () => {
    for (const fixture of HAND_SPLITS) {
      const ref = fixture.kind === 'equal'
        ? referenceSplitEqual(fixture.grand, fixture.n)
        : referenceSplitByItem(fixture.grand, fixture.bases);
      const actual = fixture.kind === 'equal'
        ? splitFromImpl(impl.splitEqual(fixture.grand, fixture.n), fixture.name)
        : splitFromImpl(impl.splitByItem(fixture.grand, fixture.bases.slice()), fixture.name);
      assert.deepEqual(actual, ref, `seed=${SEED} ${fixture.name}`);
      assert.deepEqual(actual, {
        amounts: fixture.amounts,
        remainderSen: fixture.remainderSen,
      }, `seed=${SEED} ${fixture.name}`);
    }
  });

  test(`generated orders (${ORDER_CASE_COUNT}) match js/calc.js computeBill`, comparison, () => {
    ORDERS.forEach((input, index) => {
      const message = caseMessage('order', index, input);
      const ref = referenceComputeBill(input);
      const actual = billFromImpl(impl, input, message);
      assert.deepEqual(actual, ref, message);
      assertBillInvariants(input, actual, message);
    });
  });

  test(`generated splits (${EQUAL_SPLIT_COUNT + BY_ITEM_SPLIT_COUNT}) match js/calc.js`, comparison, () => {
    EQUAL_CASES.forEach((entry, index) => {
      const message = caseMessage('equal', index, entry);
      const ref = referenceSplitEqual(entry.grand, entry.n);
      const actual = splitFromImpl(impl.splitEqual(entry.grand, entry.n), message);
      assert.deepEqual(actual, ref, message);
      assertEqualSpec(entry.grand, entry.n, actual, message);
    });
    ITEM_CASES.forEach((entry, index) => {
      const message = caseMessage('by-item', index, entry);
      const ref = referenceSplitByItem(entry.grand, entry.bases);
      const actual = splitFromImpl(
        impl.splitByItem(entry.grand, entry.bases.slice()),
        message,
      );
      assert.deepEqual(actual, ref, message);
      assertItemSpec(entry.grand, entry.bases, actual, message);
    });
  });
});
