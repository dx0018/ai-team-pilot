(function () {
  var clock = typeof module !== 'undefined' ? require('./clock.js') : window.POS.clock;
  var validate = typeof module !== 'undefined' ? require('./validate.js') : window.POS.validate;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function newId() {
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function refuse(message) {
    throw new Error(message);
  }

  function copy(order) {
    if (!order) refuse('Order is missing');
    return clone(order);
  }

  function findLine(order, lineId) {
    var i;
    for (i = 0; i < order.lines.length; i++) {
      if (order.lines[i].id === lineId) return order.lines[i];
    }
    return null;
  }

  function nonVoided(order) {
    var out = [];
    var i;
    for (i = 0; i < order.lines.length; i++) {
      if (order.lines[i].void == null) out.push(order.lines[i]);
    }
    return out;
  }

  function guardOpen(order) {
    if (order.state === 'paid' || order.state === 'closed_no_bill' || order.bill) {
      refuse('A paid order cannot be changed');
    }
  }

  function newDineIn(tableId, now) {
    return {
      id: newId(),
      type: 'dine_in',
      tableId: tableId,
      takeawayNo: null,
      state: 'ordering',
      closed: false,
      openedDate: clock.businessDate(now),
      openedAt: now,
      closedAt: null,
      voidDates: [],
      lines: [],
      billDiscount: null,
      split: null,
      bill: null
    };
  }

  function addItem(order, menuItem) {
    var next = copy(order);
    guardOpen(next);
    if (!menuItem || typeof menuItem.name !== 'string' || typeof menuItem.priceSen !== 'number') {
      refuse('Menu item is missing a name or price');
    }
    if (next.state === 'bill_requested') {
      next.state = 'ordering';
      next.split = null;
    }
    next.lines.push({
      id: newId(),
      itemId: menuItem.id,
      name: menuItem.name,
      unitPriceSen: menuItem.priceSen,
      qty: 1,
      note: '',
      committed: false,
      void: null
    });
    return next;
  }

  function incQty(order, lineId) {
    var next = copy(order);
    guardOpen(next);
    var line = findLine(next, lineId);
    if (!line) refuse('Line not found');
    if (line.void) refuse('A voided line cannot be changed');
    if (line.committed) refuse('A committed line can only be voided');
    line.qty += 1;
    return next;
  }

  function decQty(order, lineId) {
    var next = copy(order);
    guardOpen(next);
    var line = findLine(next, lineId);
    if (!line) refuse('Line not found');
    if (line.void) refuse('A voided line cannot be changed');
    if (line.committed) refuse('A committed line can only be voided');
    if (line.qty <= 1) {
      var kept = [];
      var i;
      for (i = 0; i < next.lines.length; i++) {
        if (next.lines[i].id !== lineId) kept.push(next.lines[i]);
      }
      next.lines = kept;
      return next;
    }
    line.qty -= 1;
    return next;
  }

  function setNote(order, lineId, text) {
    var next = copy(order);
    guardOpen(next);
    var line = findLine(next, lineId);
    if (!line) refuse('Line not found');
    if (line.void) refuse('A voided line cannot be changed');
    line.note = text == null ? '' : String(text);
    return next;
  }

  function rebuildVoidDates(order) {
    var seen = Object.create(null);
    var dates = [];
    var i;
    for (i = 0; i < order.lines.length; i++) {
      var when = order.lines[i].void && order.lines[i].void.businessDate;
      if (when && !seen[when]) {
        seen[when] = true;
        dates.push(when);
      }
    }
    dates.sort();
    order.voidDates = dates;
  }

  function voidLine(order, lineId, reason, now) {
    var next = copy(order);
    guardOpen(next);
    if (typeof reason !== 'string' || reason.trim() === '') refuse('A void reason is required');
    var line = findLine(next, lineId);
    if (!line) refuse('Line not found');
    if (line.void) refuse('Line is already voided');
    line.void = {
      reason: reason.trim(),
      at: now,
      businessDate: clock.businessDate(now)
    };
    rebuildVoidDates(next);
    if (next.split && next.split.mode === 'item' && next.split.assign) {
      delete next.split.assign[lineId];
    }
    return next;
  }

  function openBill(order) {
    var next = copy(order);
    guardOpen(next);
    if (nonVoided(next).length === 0) refuse('Add an item before opening the bill');
    next.state = 'bill_requested';
    var i;
    for (i = 0; i < next.lines.length; i++) next.lines[i].committed = true;
    return next;
  }

  function isEmpty(order) {
    return !order || !order.lines || order.lines.length === 0;
  }

  function setSplit(order, split) {
    var next = copy(order);
    guardOpen(next);
    if (!split) {
      next.split = null;
      return next;
    }
    if (split.mode === 'equal') {
      var equal = validate.validateSplitN(split.n);
      if (!equal.ok) refuse(equal.message);
      next.split = { mode: 'equal', n: split.n };
      return next;
    }
    if (split.mode === 'item') {
      var item = validate.validateSplitN(split.count);
      if (!item.ok) refuse(item.message);
      next.split = { mode: 'item', count: split.count, assign: {} };
      return next;
    }
    refuse('Unknown split mode');
  }

  function assignLine(order, lineId, subIndex) {
    var next = copy(order);
    guardOpen(next);
    if (!next.split || next.split.mode !== 'item') refuse('Split by item is not set');
    var line = findLine(next, lineId);
    if (!line) refuse('Line not found');
    if (line.void) refuse('A voided line is not assigned');
    if (typeof subIndex !== 'number' || !Number.isInteger(subIndex) || subIndex < 0 || subIndex >= next.split.count) {
      refuse('Choose a sub-bill');
    }
    next.split.assign[lineId] = subIndex;
    return next;
  }

  function splitItemBases(order) {
    if (!order || !order.split || order.split.mode !== 'item') return [];
    var count = order.split.count;
    var bases = [];
    var assign = order.split.assign || {};
    var i;
    for (i = 0; i < count; i++) bases.push(0);
    for (i = 0; i < order.lines.length; i++) {
      var line = order.lines[i];
      if (line.void != null) continue;
      var sub = assign[line.id];
      if (typeof sub !== 'number' || sub < 0 || sub >= count) continue;
      bases[sub] += line.qty * line.unitPriceSen;
    }
    return bases;
  }

  function canPay(order) {
    if (!order) return { ok: false, reason: 'Order is missing' };
    if (order.bill || order.state === 'paid') return { ok: false, reason: 'Order is already paid' };
    if (order.state === 'closed_no_bill') return { ok: false, reason: 'Order is closed without a bill' };
    if (nonVoided(order).length === 0) return { ok: false, reason: 'Add an item before payment' };
    if (order.split && order.split.mode === 'equal') {
      var n = validate.validateSplitN(order.split.n);
      if (!n.ok) return { ok: false, reason: n.message };
    }
    if (order.split && order.split.mode === 'item') {
      var count = order.split.count;
      var assign = order.split.assign || {};
      var used = [];
      var lines = nonVoided(order);
      var i;
      for (i = 0; i < count; i++) used.push(false);
      for (i = 0; i < lines.length; i++) {
        var sub = assign[lines[i].id];
        if (typeof sub !== 'number' || sub < 0 || sub >= count) {
          return { ok: false, reason: 'Assign every item to a sub-bill' };
        }
        used[sub] = true;
      }
      for (i = 0; i < used.length; i++) {
        if (!used[i]) return { ok: false, reason: 'Every sub-bill needs an item' };
      }
    }
    return { ok: true };
  }

  function closeTable(order) {
    var next = copy(order);
    if (next.state !== 'paid' || !next.bill) refuse('Only a paid table can be reset');
    next.closed = true;
    next.closedAt = clock.now();
    return next;
  }

  var api = {
    newDineIn: newDineIn,
    addItem: addItem,
    incQty: incQty,
    decQty: decQty,
    setNote: setNote,
    voidLine: voidLine,
    openBill: openBill,
    isEmpty: isEmpty,
    setSplit: setSplit,
    assignLine: assignLine,
    splitItemBases: splitItemBases,
    canPay: canPay,
    closeTable: closeTable
  };

  if (typeof module !== 'undefined') module.exports = api;
  else {
    window.POS = window.POS || {};
    window.POS.domain = api;
  }
})();
