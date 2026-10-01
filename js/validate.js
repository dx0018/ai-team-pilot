(function () {
  var money = typeof module !== 'undefined' ? require('./money.js') : window.POS.money;

  function ok() {
    return { ok: true };
  }

  function fail(field, message) {
    return { ok: false, field: field, message: message };
  }

  function rateBpOk(bp) {
    return typeof bp === 'number' && Number.isInteger(bp) && bp >= 0 && bp <= 10000;
  }

  function validateTables(tables) {
    if (!Array.isArray(tables) || tables.length < 1 || tables.length > 50) {
      return fail('count', 'Table count must be a whole number from 1 to 50');
    }
    var seen = Object.create(null);
    for (var i = 0; i < tables.length; i++) {
      var raw = tables[i] && tables[i].name;
      var name = typeof raw === 'string' ? raw.trim() : '';
      if (name === '') return fail('name', 'Table name is required');
      var key = name.toLowerCase();
      if (seen[key]) return fail('name', 'Table names must be unique');
      seen[key] = true;
    }
    return ok();
  }

  function validateMenuItem(item) {
    if (!item || typeof item.name !== 'string' || item.name.trim() === '') {
      return fail('name', 'Name is required');
    }
    if (typeof item.price === 'string') {
      if (!money.parseMoney(item.price).ok) {
        return fail('price', 'Price must be ≥ 0 with at most 2 decimals');
      }
      return ok();
    }
    if (typeof item.priceSen !== 'number' || !Number.isInteger(item.priceSen) || item.priceSen < 0) {
      return fail('price', 'Price must be ≥ 0 with at most 2 decimals');
    }
    return ok();
  }

  function checkRate(block, field) {
    if (!block) return fail(field, 'Rate must be 0–100 with at most 2 decimals');
    if (typeof block.rate === 'string') {
      if (!money.parseRate(block.rate).ok) return fail(field, 'Rate must be 0–100 with at most 2 decimals');
      return null;
    }
    if (!rateBpOk(block.rateBp)) return fail(field, 'Rate must be 0–100 with at most 2 decimals');
    return null;
  }

  function validateRates(settings) {
    var sc = settings && settings.serviceCharge;
    var sst = settings && settings.sst;
    var dineIn = checkRate(sc && sc.dineIn, 'serviceCharge.dineIn');
    if (dineIn) return dineIn;
    var takeaway = checkRate(sc && sc.takeaway, 'serviceCharge.takeaway');
    if (takeaway) return takeaway;
    var sstResult = checkRate(sst, 'sst');
    if (sstResult) return sstResult;
    return ok();
  }

  function validateSplitN(n) {
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 2 || n > 20) {
      return fail('n', 'Split count must be a whole number from 2 to 20');
    }
    return ok();
  }

  function validateDiscount(d, subtotalSen) {
    if (typeof subtotalSen !== 'number' || !Number.isInteger(subtotalSen) || subtotalSen < 0) {
      return fail('subtotal', 'Subtotal must be a whole number of sen');
    }
    if (d == null) return ok();
    if (d.kind === 'pct') {
      if (typeof d.rate === 'string') {
        if (!money.parseRate(d.rate).ok) {
          return fail('discount', 'Discount percent must be 0–100 with at most 2 decimals');
        }
        return ok();
      }
      if (!rateBpOk(d.bp)) return fail('discount', 'Discount percent must be 0–100 with at most 2 decimals');
      return ok();
    }
    if (d.kind === 'rm') {
      if (typeof d.amount === 'string') {
        if (!money.parseMoney(d.amount).ok) {
          return fail('discount', 'Discount amount must be ≥ 0 with at most 2 decimals');
        }
        return ok();
      }
      if (typeof d.sen !== 'number' || !Number.isInteger(d.sen) || d.sen < 0) {
        return fail('discount', 'Discount amount must be ≥ 0 with at most 2 decimals');
      }
      return ok();
    }
    return fail('discount', 'Discount is not valid');
  }

  var api = {
    validateTables: validateTables,
    validateMenuItem: validateMenuItem,
    validateRates: validateRates,
    validateSplitN: validateSplitN,
    validateDiscount: validateDiscount
  };

  if (typeof module !== 'undefined') module.exports = api;
  else {
    window.POS = window.POS || {};
    window.POS.validate = api;
  }
})();
