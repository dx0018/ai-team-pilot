(function () {
  function halfUpDiv(numerator, denominator) {
    var remainder = numerator % denominator;
    var quotient = (numerator - remainder) / denominator;
    if (remainder * 2 >= denominator) quotient += 1;
    return quotient;
  }

  function roundTo5Sen(sen) {
    var negative = sen < 0;
    var abs = negative ? -sen : sen;
    var last = abs % 10;
    var base = abs - last;
    var rounded = base;
    if (last >= 3 && last <= 7) rounded = base + 5;
    else if (last >= 8) rounded = base + 10;
    return negative ? -rounded : rounded;
  }

  function assertNonNegativeInt(value, message) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      throw new RangeError(message);
    }
  }

  function assertSplitCount(n) {
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 2 || n > 20) {
      throw new RangeError('Split count must be a whole number from 2 to 20');
    }
  }

  function assertRateBlock(block) {
    if (!block || block.rateBp == null) {
      if (block && block.enabled) {
        throw new RangeError('Rate must be a non-negative integer number of basis points');
      }
      return;
    }
    assertNonNegativeInt(block.rateBp, 'Rate must be a non-negative integer number of basis points');
  }

  function assertDiscount(billDiscount) {
    if (!billDiscount) return;
    if (billDiscount.kind === 'pct') {
      assertNonNegativeInt(billDiscount.bp, 'Discount must be a non-negative integer number of basis points');
    } else if (billDiscount.kind === 'rm') {
      assertNonNegativeInt(billDiscount.sen, 'Discount must be a non-negative integer number of sen');
    }
  }

  function discountOf(subtotalSen, billDiscount) {
    if (!billDiscount) return 0;
    var amount = 0;
    if (billDiscount.kind === 'pct') amount = halfUpDiv(subtotalSen * billDiscount.bp, 10000);
    else if (billDiscount.kind === 'rm') amount = billDiscount.sen;
    return amount > subtotalSen ? subtotalSen : amount;
  }

  function scRateBp(orderType, settings) {
    var block = orderType === 'takeaway' ? settings.serviceCharge.takeaway : settings.serviceCharge.dineIn;
    if (!block || !block.enabled) return 0;
    return block.rateBp;
  }

  function computeBill(input) {
    var subtotalSen = 0;
    var lines = input.lines || [];
    var i;
    var sc = input.settings.serviceCharge;
    for (i = 0; i < lines.length; i++) {
      assertNonNegativeInt(lines[i].qty, 'Quantity must be a non-negative integer');
      assertNonNegativeInt(lines[i].unitPriceSen, 'Price must be a non-negative integer number of sen');
    }
    assertDiscount(input.billDiscount);
    assertRateBlock(sc && sc.dineIn);
    assertRateBlock(sc && sc.takeaway);
    assertRateBlock(input.settings.sst);
    for (i = 0; i < lines.length; i++) {
      if (lines[i].void == null) subtotalSen += lines[i].qty * lines[i].unitPriceSen;
    }
    var discountSen = discountOf(subtotalSen, input.billDiscount);
    var baseSen = subtotalSen - discountSen;
    var serviceChargeSen = halfUpDiv(baseSen * scRateBp(input.orderType, input.settings), 10000);
    var sst = input.settings.sst;
    var sstBase = sst.includesServiceCharge ? baseSen + serviceChargeSen : baseSen;
    var sstSen = sst.enabled ? halfUpDiv(sstBase * sst.rateBp, 10000) : 0;
    var preRoundingSen = baseSen + serviceChargeSen + sstSen;
    var grandTotalSen = input.settings.rounding.enabled ? roundTo5Sen(preRoundingSen) : preRoundingSen;
    if (grandTotalSen < 0) grandTotalSen = 0;
    return {
      subtotalSen: subtotalSen,
      discountSen: discountSen,
      baseSen: baseSen,
      serviceChargeSen: serviceChargeSen,
      sstSen: sstSen,
      preRoundingSen: preRoundingSen,
      roundingSen: grandTotalSen - preRoundingSen,
      grandTotalSen: grandTotalSen
    };
  }

  function splitEqual(grandTotalSen, n) {
    assertNonNegativeInt(grandTotalSen, 'Grand total must be a non-negative integer number of sen');
    assertSplitCount(n);
    var each = (grandTotalSen - (grandTotalSen % n)) / n;
    var remainderSen = grandTotalSen - each * n;
    var amounts = [];
    for (var i = 0; i < n; i++) amounts.push(i === 0 ? each + remainderSen : each);
    return { amounts: amounts, remainderSen: remainderSen };
  }

  function splitByItem(grandTotalSen, bases) {
    var sum = 0;
    var i;
    assertNonNegativeInt(grandTotalSen, 'Grand total must be a non-negative integer number of sen');
    for (i = 0; i < bases.length; i++) {
      assertNonNegativeInt(bases[i], 'Split base must be a non-negative integer number of sen');
    }
    for (i = 0; i < bases.length; i++) sum += bases[i];
    if (sum === 0) {
      var zeros = [];
      for (i = 0; i < bases.length; i++) zeros.push(0);
      return { amounts: zeros, remainderSen: 0 };
    }
    var amounts = [];
    var allocated = 0;
    for (i = 0; i < bases.length; i++) {
      var product = grandTotalSen * bases[i];
      var share = (product - (product % sum)) / sum;
      amounts.push(share);
      allocated += share;
    }
    var remainderSen = grandTotalSen - allocated;
    amounts[0] += remainderSen;
    return { amounts: amounts, remainderSen: remainderSen };
  }

  function cashChange(dueSen, receivedSen) {
    if (receivedSen < dueSen) return { ok: false, reason: 'Cash received is below the amount due' };
    return { ok: true, changeSen: receivedSen - dueSen };
  }

  var api = {
    halfUpDiv: halfUpDiv,
    roundTo5Sen: roundTo5Sen,
    computeBill: computeBill,
    splitEqual: splitEqual,
    splitByItem: splitByItem,
    cashChange: cashChange
  };

  if (typeof module !== 'undefined') module.exports = api;
  else {
    window.POS = window.POS || {};
    window.POS.calc = api;
  }
})();
