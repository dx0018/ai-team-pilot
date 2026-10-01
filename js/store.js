(function () {
  var calc = typeof module !== 'undefined' ? require('./calc.js') : window.POS.calc;
  var clock = typeof module !== 'undefined' ? require('./clock.js') : window.POS.clock;

  var DB_NAME = 'mini-pos';
  var DB_VERSION = 1;
  var SCHEMA_VERSION = 1;

  var db = null;
  var failNext = false;
  var writeFailureHandler = null;
  var memory = { settings: null, menu: null, openOrders: [] };

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function pad(n, width) {
    var s = String(n);
    while (s.length < width) s = '0' + s;
    return s;
  }

  function formatBillNo(businessDate, n) {
    return 'B-' + String(businessDate).replace(/-/g, '') + '-' + pad(n, 4);
  }

  function formatTakeawayNo(n) {
    return 'TA-' + pad(n, 3);
  }

  function schemaIsNewer(version) {
    return typeof version === 'number' && version > SCHEMA_VERSION;
  }

  function defaultSettings() {
    var tables = [];
    var i;
    for (i = 1; i <= 20; i++) tables.push({ id: 't' + i, name: 'T' + i });
    return {
      restaurant: { name: '', ssmNo: '', address: '', phone: '', sstRegNo: '' },
      tables: tables,
      serviceCharge: {
        dineIn: { enabled: true, rateBp: 1000 },
        takeaway: { enabled: false, rateBp: 1000 }
      },
      sst: { enabled: true, rateBp: 600, includesServiceCharge: true },
      rounding: { enabled: true },
      receiptFooter: 'Thank you! Terima kasih! 谢谢!'
    };
  }

  function defaultMenu() {
    if (typeof window !== 'undefined' && window.POS_DEFAULT_MENU) return clone(window.POS_DEFAULT_MENU);
    throw new Error('Default menu is missing');
  }

  function paymentRefusal(order) {
    if (!order) return 'Order not found';
    if (order.bill || order.state === 'paid') return 'Order is already paid';
    if (order.state === 'closed_no_bill') return 'Order is closed without a bill';
    var lines = order.lines || [];
    var i;
    var payable = false;
    for (i = 0; i < lines.length; i++) {
      if (lines[i].void == null && lines[i].qty > 0) payable = true;
    }
    if (!payable) return 'Order has no payable line';
    if (order.split && order.split.mode === 'equal') {
      var n = order.split.n;
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 2 || n > 20) {
        return 'Split count must be a whole number from 2 to 20';
      }
    }
    if (order.split && order.split.mode === 'item') {
      var count = order.split.count;
      var assign = order.split.assign || {};
      var used = [];
      if (typeof count !== 'number' || !Number.isInteger(count) || count < 2) return 'A sub-bill has no line';
      for (i = 0; i < count; i++) used.push(false);
      for (i = 0; i < lines.length; i++) {
        if (lines[i].void != null) continue;
        var sub = assign[lines[i].id];
        if (typeof sub !== 'number' || sub < 0 || sub >= count) return 'A line is not assigned to a sub-bill';
        used[sub] = true;
      }
      for (i = 0; i < used.length; i++) {
        if (!used[i]) return 'A sub-bill has no line';
      }
    }
    return null;
  }

  function onWriteFailure(fn) {
    writeFailureHandler = fn;
  }

  function notifyWriteFailure(err) {
    if (typeof writeFailureHandler === 'function') writeFailureHandler(err);
  }

  function failNextWrite() {
    failNext = true;
  }

  function consumeFail() {
    if (!failNext) return false;
    failNext = false;
    return true;
  }

  function requestToPromise(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () {
        if (req.error) reject(req.error);
        else reject(new Error('IndexedDB request failed'));
      };
    });
  }

  function openDatabase() {
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('indexedDB is missing'));
        return;
      }
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var upgrading = req.result;
        if (!upgrading.objectStoreNames.contains('settings')) upgrading.createObjectStore('settings');
        if (!upgrading.objectStoreNames.contains('menu')) upgrading.createObjectStore('menu');
        if (!upgrading.objectStoreNames.contains('meta')) upgrading.createObjectStore('meta');
        if (!upgrading.objectStoreNames.contains('orders')) {
          var orders = upgrading.createObjectStore('orders', { keyPath: 'id' });
          orders.createIndex('state', 'state');
          orders.createIndex('billDate', 'bill.businessDate');
          orders.createIndex('voidDates', 'voidDates', { multiEntry: true });
        }
      };
      req.onsuccess = function () { resolve({ db: req.result }); };
      req.onerror = function (event) {
        if (event && event.preventDefault) event.preventDefault();
        var err = req.error;
        if (err && err.name === 'VersionError') {
          resolve({
            blocked: true,
            message: 'This data was written by a newer version of the app. Open that version to continue. Nothing was changed.'
          });
          return;
        }
        reject(err || new Error('IndexedDB open failed'));
      };
    });
  }

  function writeFailed(tx) {
    return new Promise(function (resolve, reject) {
      var error = new Error('IndexedDB write failed');
      tx.onabort = function () {
        notifyWriteFailure(error);
        reject(error);
      };
      tx.onerror = function (event) {
        if (event && event.preventDefault) event.preventDefault();
      };
      try { tx.abort(); } catch (err) {
        notifyWriteFailure(error);
        reject(error);
      }
    });
  }

  function remember(settings, menu, orders) {
    memory.settings = clone(settings);
    memory.menu = clone(menu);
    memory.openOrders = [];
    var i;
    var list = orders || [];
    for (i = 0; i < list.length; i++) {
      if (list[i].closed !== true) memory.openOrders.push(clone(list[i]));
    }
  }

  function applyOrderMemory(order) {
    var next = [];
    var i;
    for (i = 0; i < memory.openOrders.length; i++) {
      if (memory.openOrders[i].id !== order.id) next.push(memory.openOrders[i]);
    }
    if (order.closed !== true) next.push(clone(order));
    memory.openOrders = next;
  }

  function current() {
    return {
      settings: clone(memory.settings),
      menu: clone(memory.menu),
      openOrders: clone(memory.openOrders)
    };
  }

  function readAll() {
    var tx = db.transaction(['settings', 'menu', 'orders', 'meta'], 'readonly');
    return Promise.all([
      requestToPromise(tx.objectStore('settings').get('current')),
      requestToPromise(tx.objectStore('menu').get('current')),
      requestToPromise(tx.objectStore('orders').getAll()),
      requestToPromise(tx.objectStore('meta').get('schemaVersion'))
    ]).then(function (parts) {
      return { settings: parts[0] || null, menu: parts[1] || null, orders: parts[2] || [], schemaVersion: parts[3] };
    });
  }

  function blockedState() {
    return {
      blocked: true,
      message: 'This data was written by a newer version of the app. Open that version to continue. Nothing was changed.',
      settings: null,
      menu: null,
      openOrders: [],
      firstRun: false
    };
  }

  function seed() {
    var settings = defaultSettings();
    var menu = defaultMenu();
    var tx = db.transaction(['settings', 'menu', 'meta'], 'readwrite');
    if (consumeFail()) return writeFailed(tx);
    tx.objectStore('settings').put(clone(settings), 'current');
    tx.objectStore('menu').put(clone(menu), 'current');
    tx.objectStore('meta').put(SCHEMA_VERSION, 'schemaVersion');
    return new Promise(function (resolve, reject) {
      tx.oncomplete = function () {
        remember(settings, menu, []);
        resolve({
          blocked: false,
          settings: clone(settings),
          menu: clone(menu),
          openOrders: [],
          firstRun: true
        });
      };
      tx.onerror = function (event) {
        if (event && event.preventDefault) event.preventDefault();
      };
      tx.onabort = function () {
        var error = tx.error || new Error('IndexedDB write failed');
        notifyWriteFailure(error);
        reject(error);
      };
    });
  }

  function routePointsAt(id) {
    if (typeof location === 'undefined' || !location.hash) return false;
    var hash = location.hash;
    var marks = ['#/order/', '#/bill/', '#/split/', '#/pay/', '#/receipt/'];
    var i;
    for (i = 0; i < marks.length; i++) {
      if (hash === marks[i] + id) return true;
    }
    return false;
  }

  function sweep(state) {
    var doomed = [];
    var i;
    for (i = 0; i < state.orders.length; i++) {
      var order = state.orders[i];
      if (!order.lines || order.lines.length === 0) doomed.push(order.id);
    }
    if (!doomed.length) {
      remember(state.settings, state.menu, state.orders);
      return Promise.resolve({
        blocked: false,
        settings: clone(state.settings),
        menu: clone(state.menu),
        openOrders: clone(memory.openOrders),
        firstRun: false
      });
    }
    var tx = db.transaction('orders', 'readwrite');
    if (consumeFail()) return writeFailed(tx);
    var store = tx.objectStore('orders');
    for (i = 0; i < doomed.length; i++) store.delete(doomed[i]);
    return new Promise(function (resolve, reject) {
      tx.oncomplete = function () {
        var kept = [];
        var redirect = false;
        for (i = 0; i < state.orders.length; i++) {
          if (doomed.indexOf(state.orders[i].id) === -1) kept.push(state.orders[i]);
          else if (routePointsAt(state.orders[i].id)) redirect = true;
        }
        remember(state.settings, state.menu, kept);
        if (redirect && typeof location !== 'undefined') location.hash = '#/tables';
        resolve({
          blocked: false,
          settings: clone(state.settings),
          menu: clone(state.menu),
          openOrders: clone(memory.openOrders),
          firstRun: false
        });
      };
      tx.onerror = function (event) {
        if (event && event.preventDefault) event.preventDefault();
      };
      tx.onabort = function () {
        var error = tx.error || new Error('IndexedDB write failed');
        notifyWriteFailure(error);
        reject(error);
      };
    });
  }

  function finishLoad(state) {
    if (schemaIsNewer(state.schemaVersion)) return Promise.resolve(blockedState());
    if (!state.settings || !state.menu) return seed();
    return sweep(state);
  }

  function init() {
    return openDatabase().then(function (opened) {
      if (opened.blocked) return blockedState();
      db = opened.db;
      return readAll().then(finishLoad);
    });
  }

  function reloadMemory() {
    return readAll().then(function (state) {
      remember(state.settings, state.menu, state.orders);
      return current();
    });
  }

  function saveSettings(settings) {
    var tx = db.transaction('settings', 'readwrite');
    if (consumeFail()) return writeFailed(tx);
    tx.objectStore('settings').put(clone(settings), 'current');
    return txDone(tx).then(function () {
      memory.settings = clone(settings);
      return clone(settings);
    });
  }

  function saveMenu(menu) {
    var tx = db.transaction('menu', 'readwrite');
    if (consumeFail()) return writeFailed(tx);
    tx.objectStore('menu').put(clone(menu), 'current');
    return txDone(tx).then(function () {
      memory.menu = clone(menu);
      return clone(menu);
    });
  }

  function saveOrder(order) {
    var tx = db.transaction('orders', 'readwrite');
    if (consumeFail()) return writeFailed(tx);
    var saved = clone(order);
    if (!saved.voidDates) saved.voidDates = [];
    tx.objectStore('orders').put(saved);
    return txDone(tx).then(function () {
      applyOrderMemory(saved);
      return clone(saved);
    });
  }

  function txDone(tx) {
    return new Promise(function (resolve, reject) {
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function (event) {
        if (event && event.preventDefault) event.preventDefault();
      };
      tx.onabort = function () {
        var error = tx.error || new Error('IndexedDB write failed');
        notifyWriteFailure(error);
        reject(error);
      };
    });
  }

  function nextTakeawayNo(date) {
    var business = date || clock.businessDate(clock.now());
    var tx = db.transaction('meta', 'readwrite');
    if (consumeFail()) return writeFailed(tx);
    var issued = 1;
    var req = tx.objectStore('meta').get('takeawaySeq');
    req.onsuccess = function () {
      var seq = req.result;
      issued = !seq || seq.date !== business ? 1 : seq.next;
      tx.objectStore('meta').put({ date: business, next: issued + 1 }, 'takeawaySeq');
    };
    return txDone(tx).then(function () { return formatTakeawayNo(issued); });
  }

  function freezeSplit(order, grandTotalSen) {
    if (!order.split) return null;
    var i;
    if (order.split.mode === 'equal') {
      var equal = calc.splitEqual(grandTotalSen, order.split.n);
      var equalBills = [];
      for (i = 0; i < equal.amounts.length; i++) {
        equalBills.push({ label: '/' + (i + 1), amountSen: equal.amounts[i] });
      }
      return { mode: 'equal', subBills: equalBills, remainderSen: equal.remainderSen };
    }
    if (order.split.mode === 'item') {
      var count = order.split.count;
      var bases = [];
      var lineIds = [];
      for (i = 0; i < count; i++) {
        bases.push(0);
        lineIds.push([]);
      }
      var assign = order.split.assign || {};
      var lines = order.lines || [];
      for (i = 0; i < lines.length; i++) {
        if (lines[i].void != null) continue;
        var sub = assign[lines[i].id];
        if (sub == null || sub < 0 || sub >= count) continue;
        bases[sub] += lines[i].qty * lines[i].unitPriceSen;
        lineIds[sub].push(lines[i].id);
      }
      var parts = calc.splitByItem(grandTotalSen, bases);
      var itemBills = [];
      for (i = 0; i < parts.amounts.length; i++) {
        itemBills.push({ label: '/' + (i + 1), amountSen: parts.amounts[i], lineIds: lineIds[i] });
      }
      return { mode: 'item', subBills: itemBills, remainderSen: parts.remainderSen };
    }
    return null;
  }

  function payOrder(orderId, payment) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(['orders', 'meta', 'settings'], 'readwrite');
      var settled = false;
      var pending = null;

      function refuse(message) {
        if (settled) return;
        settled = true;
        reject(new Error(message));
      }

      function fail(err) {
        if (settled) return;
        settled = true;
        var error = err instanceof Error ? err : new Error(err && err.message ? err.message : 'IndexedDB write failed');
        notifyWriteFailure(error);
        try { tx.abort(); } catch (abortErr) { /* already aborting */ }
        reject(error);
      }

      if (consumeFail()) {
        fail(new Error('IndexedDB write failed'));
        return;
      }

      tx.oncomplete = function () {
        if (settled || !pending) return;
        settled = true;
        applyOrderMemory(pending.order);
        resolve(clone(pending.bill));
      };
      tx.onerror = function (event) {
        if (event && event.preventDefault) event.preventDefault();
      };
      tx.onabort = function () {
        if (settled) return;
        fail(tx.error || new Error('IndexedDB write failed'));
      };

      var orders = tx.objectStore('orders');
      var meta = tx.objectStore('meta');
      var settingsStore = tx.objectStore('settings');
      var orderReq = orders.get(orderId);
      orderReq.onerror = function () { fail(orderReq.error); };
      orderReq.onsuccess = function () {
        var order = orderReq.result;
        var refusal = paymentRefusal(order);
        if (refusal) return refuse(refusal);
        var settingsReq = settingsStore.get('current');
        settingsReq.onerror = function () { fail(settingsReq.error); };
        settingsReq.onsuccess = function () {
          var settings = settingsReq.result;
          if (!settings) return refuse('Settings are missing');
          var seqReq = meta.get('billSeq');
          seqReq.onerror = function () { fail(seqReq.error); };
          seqReq.onsuccess = function () {
            try {
              var paidAt = clock.now();
              var date = clock.businessDate(paidAt);
              var seq = seqReq.result;
              var issued = !seq || seq.date !== date ? 1 : seq.next;
              var pay = clone(payment || {});
              var totals = calc.computeBill({
                lines: order.lines || [],
                billDiscount: order.billDiscount || null,
                orderType: order.type,
                settings: settings
              });
              if (pay.method === 'Cash') {
                if (typeof pay.cashReceivedSen !== 'number') return refuse('Cash received is below the amount due');
                var change = calc.cashChange(totals.grandTotalSen, pay.cashReceivedSen);
                if (!change.ok) return refuse(change.reason || 'Cash received is below the amount due');
                pay.changeSen = change.changeSen;
              }
              var saved = clone(order);
              saved.state = 'paid';
              saved.closed = saved.type === 'takeaway';
              if (saved.closed) saved.closedAt = paidAt;
              saved.bill = {
                billNo: formatBillNo(date, issued),
                paidAt: paidAt,
                businessDate: date,
                settingsUsed: {
                  serviceCharge: clone(settings.serviceCharge),
                  sst: clone(settings.sst),
                  rounding: clone(settings.rounding),
                  restaurant: clone(settings.restaurant)
                },
                totals: {
                  subtotalSen: totals.subtotalSen,
                  discountSen: totals.discountSen,
                  serviceChargeSen: totals.serviceChargeSen,
                  sstSen: totals.sstSen,
                  preRoundingSen: totals.preRoundingSen,
                  roundingSen: totals.roundingSen,
                  grandTotalSen: totals.grandTotalSen
                },
                split: freezeSplit(saved, totals.grandTotalSen),
                payment: pay,
                void: null
              };
              orders.put(saved);
              meta.put({ date: date, next: issued + 1 }, 'billSeq');
              pending = { order: saved, bill: saved.bill };
            } catch (err) {
              fail(err);
            }
          };
        };
      };
    });
  }

  function indexGetAll(indexName, date) {
    var tx = db.transaction('orders', 'readonly');
    var index = tx.objectStore('orders').index(indexName);
    return requestToPromise(index.getAll(date)).then(function (rows) { return rows || []; });
  }

  function billsByDate(date) {
    return indexGetAll('billDate', date);
  }

  function ordersWithVoidsOn(date) {
    return indexGetAll('voidDates', date);
  }

  function deleteOrder(id) {
    var tx = db.transaction('orders', 'readwrite');
    if (consumeFail()) return writeFailed(tx);
    var settled = false;
    var req = tx.objectStore('orders').get(id);
    req.onsuccess = function () {
      var order = req.result;
      if (!order) {
        settled = true;
        return;
      }
      if (order.lines && order.lines.length > 0) {
        settled = true;
        return;
      }
      tx.objectStore('orders').delete(id);
    };
    return new Promise(function (resolve, reject) {
      tx.oncomplete = function () {
        if (settled && req.result && req.result.lines && req.result.lines.length > 0) {
          reject(new Error('Only a zero-line order can be deleted'));
          return;
        }
        if (!req.result) {
          reject(new Error('Order not found'));
          return;
        }
        var next = [];
        var i;
        for (i = 0; i < memory.openOrders.length; i++) {
          if (memory.openOrders[i].id !== id) next.push(memory.openOrders[i]);
        }
        memory.openOrders = next;
        resolve();
      };
      tx.onerror = function (event) {
        if (event && event.preventDefault) event.preventDefault();
      };
      tx.onabort = function () {
        var error = tx.error || new Error('IndexedDB write failed');
        notifyWriteFailure(error);
        reject(error);
      };
    });
  }

  function resetAll() {
    var tx = db.transaction(['orders', 'meta', 'settings', 'menu'], 'readwrite');
    if (consumeFail()) return writeFailed(tx);
    tx.objectStore('orders').clear();
    tx.objectStore('meta').clear();
    tx.objectStore('settings').clear();
    tx.objectStore('menu').clear();
    return txDone(tx).then(function () { return seed(); });
  }

  function loadFixture(json) {
    var data = typeof json === 'string' ? JSON.parse(json) : json;
    var tx = db.transaction(['settings', 'menu', 'orders'], 'readwrite');
    if (consumeFail()) return writeFailed(tx);
    if (data.settings) tx.objectStore('settings').put(clone(data.settings), 'current');
    if (data.menu) tx.objectStore('menu').put(clone(data.menu), 'current');
    if (data.orders) {
      var orders = tx.objectStore('orders');
      orders.clear();
      var i;
      for (i = 0; i < data.orders.length; i++) orders.put(clone(data.orders[i]));
    }
    return txDone(tx).then(reloadMemory);
  }

  var api = {
    init: init,
    current: current,
    saveSettings: saveSettings,
    saveMenu: saveMenu,
    saveOrder: saveOrder,
    nextTakeawayNo: nextTakeawayNo,
    deleteOrder: deleteOrder,
    payOrder: payOrder,
    billsByDate: billsByDate,
    ordersWithVoidsOn: ordersWithVoidsOn,
    resetAll: resetAll,
    loadFixture: loadFixture,
    failNextWrite: failNextWrite,
    onWriteFailure: onWriteFailure,
    defaultSettings: defaultSettings,
    formatBillNo: formatBillNo,
    formatTakeawayNo: formatTakeawayNo,
    schemaIsNewer: schemaIsNewer,
    paymentRefusal: paymentRefusal
  };

  if (typeof module !== 'undefined') module.exports = api;
  else {
    window.POS = window.POS || {};
    window.POS.store = api;
  }
})();
