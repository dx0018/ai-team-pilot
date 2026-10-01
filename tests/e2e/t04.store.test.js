const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..', '..');

function fileUrl(relative) {
  const abs = path.join(root, relative);
  const parts = abs.split(path.sep).map(function (part) { return encodeURIComponent(part); });
  return 'file://' + parts.join('/');
}

const APP = fileUrl('index.html');
const SCHEMA = fileUrl('tests/e2e/schema-v2.html');

function pad(n) {
  return n < 10 ? '0' + n : String(n);
}

function localDate(value) {
  const parsed = new Date(value);
  return parsed.getFullYear() + '-' + pad(parsed.getMonth() + 1) + '-' + pad(parsed.getDate());
}

function isoLocal(year, month, day, hour, minute) {
  return new Date(year, month - 1, day, hour, minute, 0).toISOString();
}

function order(id, extra) {
  return Object.assign({
    id: id,
    type: 'dine_in',
    tableId: 't1',
    state: 'ordering',
    closed: false,
    openedDate: '2026-10-01',
    openedAt: isoLocal(2026, 10, 1, 12, 0),
    closedAt: null,
    voidDates: [],
    lines: [{
      id: id + '-line',
      itemId: 'nasi-lemak',
      name: 'Nasi Lemak 椰浆饭',
      unitPriceSen: 1000,
      qty: 1,
      note: '',
      committed: false,
      void: null
    }],
    billDiscount: null,
    split: null,
    bill: null
  }, extra || {});
}

async function launch(dir) {
  return chromium.launchPersistentContext(dir, {
    channel: 'chrome',
    headless: true
  });
}

async function openApp(context, query) {
  const page = await context.newPage();
  const search = query === undefined ? '?test=1' : query;
  await page.goto(APP + search + '#/tables', { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(function () { return window.POS && window.POS.ready === true; }, null, { timeout: 20000 });
  return page;
}

async function idbGet(page, storeName, key) {
  return page.evaluate(function (args) {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open('mini-pos');
      req.onerror = function () { reject(req.error); };
      req.onsuccess = function () {
        var db = req.result;
        var tx = db.transaction(args.storeName, 'readonly');
        var getReq = tx.objectStore(args.storeName).get(args.key);
        getReq.onsuccess = function () {
          db.close();
          resolve(getReq.result === undefined ? null : getReq.result);
        };
        getReq.onerror = function () {
          db.close();
          reject(getReq.error);
        };
      };
    });
  }, { storeName: storeName, key: key });
}

test('T-04 store seeds, persists, pays once, and dates bills and voids', { timeout: 180000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-t04-'));
  const context = await launch(dir);
  try {
    await context.addInitScript(function () {
      if (!navigator.storage || typeof navigator.storage.persist !== 'function') return;
      var persist = navigator.storage.persist.bind(navigator.storage);
      navigator.storage.persist = function () {
        window.__persistCalled = true;
        return persist();
      };
    });
    const page = await openApp(context, '?test=1');
    const seeded = await page.evaluate(function () {
      var state = window.POS.store.current();
      return {
        names: state.settings.tables.map(function (table) { return table.name; }),
        nasi: state.menu.items.filter(function (item) { return item.name === 'Nasi Lemak 椰浆饭'; }).length,
        test: typeof window.POS.test,
        persist: window.__persistCalled === true,
        marks: performance.getEntriesByType('mark').map(function (entry) { return entry.name; })
      };
    });
    assert.deepEqual(seeded.names, Array.from({ length: 20 }, function (_, i) { return 'T' + (i + 1); }));
    assert.equal(seeded.nasi, 1);
    assert.equal(seeded.test, 'object');
    assert.equal(seeded.persist, true);
    assert.ok(seeded.marks.indexOf('route:start:tables') !== -1);
    assert.ok(seeded.marks.indexOf('route:rendered:tables') !== -1);

    const kept = order('keep-1');
    await page.evaluate(function (value) { return window.POS.store.saveOrder(value); }, kept);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(function () { return window.POS && window.POS.ready === true; });
    const afterRefresh = await idbGet(page, 'orders', 'keep-1');
    assert.equal(afterRefresh && afterRefresh.id, 'keep-1');
    assert.equal(afterRefresh.bill, null);

    await context.close();
    const restarted = await launch(dir);
    try {
      const page2 = await openApp(restarted, '?test=1');
      const afterRestart = await idbGet(page2, 'orders', 'keep-1');
      assert.equal(afterRestart && afterRestart.lines.length, 1);

      const day1 = isoLocal(2026, 10, 1, 23, 50);
      const voidAt = isoLocal(2026, 10, 1, 23, 55);
      const day2 = isoLocal(2026, 10, 2, 0, 10);
      const voidDate = localDate(voidAt);
      const payDate = localDate(day2);
      assert.notEqual(voidDate, payDate);
      await page2.evaluate(function (iso) { window.POS.test.setNow(iso); }, day1);

      const payTarget = order('pay-1');
      await page2.evaluate(function (value) { return window.POS.store.saveOrder(value); }, payTarget);
      const concurrent = await page2.evaluate(function () {
        return window.POS.test.payConcurrently('pay-1', { method: 'Cash', cashReceivedSen: 5000 });
      });
      const paid = concurrent.filter(function (result) { return result.ok; });
      const refused = concurrent.filter(function (result) { return !result.ok; });
      assert.equal(paid.length, 1);
      assert.equal(refused.length, 1);
      assert.match(refused[0].error, /already paid/);
      assert.equal(await page2.evaluate(function () { return window.POS.test.payCallCount(); }), 0);
      const storedPay = await idbGet(page2, 'orders', 'pay-1');
      assert.equal(storedPay.state, 'paid');
      assert.equal(storedPay.bill.billNo, paid[0].bill.billNo);
      const sameDay = await page2.evaluate(function (date) {
        return window.POS.store.billsByDate(date);
      }, storedPay.bill.businessDate);
      assert.equal(sameDay.length, 1);

      const ta = await page2.evaluate(function () {
        return Promise.all([
          window.POS.store.nextTakeawayNo(),
          window.POS.store.nextTakeawayNo()
        ]);
      });
      assert.deepEqual(ta, ['TA-001', 'TA-002']);

      const midnight = order('midnight', {
        openedAt: day1,
        openedDate: localDate(day1),
        voidDates: [voidDate],
        lines: [
          {
            id: 'voided',
            itemId: 'cendol',
            name: 'Cendol',
            unitPriceSen: 450,
            qty: 1,
            note: '',
            committed: true,
            void: { reason: 'Out', at: voidAt, businessDate: voidDate }
          },
          {
            id: 'kept',
            itemId: 'nasi-lemak',
            name: 'Nasi Lemak 椰浆饭',
            unitPriceSen: 1000,
            qty: 1,
            note: '',
            committed: false,
            void: null
          }
        ]
      });
      await page2.evaluate(function (value) { return window.POS.store.saveOrder(value); }, midnight);
      await page2.evaluate(function (iso) { window.POS.test.setNow(iso); }, day2);
      const taNextDay = await page2.evaluate(function () { return window.POS.store.nextTakeawayNo(); });
      assert.equal(taNextDay, 'TA-001');
      const midnightBill = await page2.evaluate(function () {
        return window.POS.store.payOrder('midnight', { method: 'Card' });
      });
      assert.equal(midnightBill.businessDate, payDate);
      assert.equal(midnightBill.billNo, 'B-' + payDate.replace(/-/g, '') + '-0001');
      const onPayDate = await page2.evaluate(function (date) { return window.POS.store.billsByDate(date); }, payDate);
      const onOpenDate = await page2.evaluate(function (date) { return window.POS.store.billsByDate(date); }, voidDate);
      const voids = await page2.evaluate(function (date) { return window.POS.store.ordersWithVoidsOn(date); }, voidDate);
      assert.ok(onPayDate.some(function (row) { return row.id === 'midnight'; }));
      assert.equal(onOpenDate.some(function (row) { return row.id === 'midnight'; }), false);
      assert.ok(voids.some(function (row) { return row.id === 'midnight'; }));

      const other = order('fail-1');
      await page2.evaluate(function (value) { return window.POS.store.saveOrder(value); }, other);
      const failed = await page2.evaluate(async function () {
        window.POS.test.failNextWrite();
        try {
          await window.POS.store.payOrder('fail-1', { method: 'Other' });
          return { ok: true };
        } catch (err) {
          return { ok: false, error: err.message };
        }
      });
      assert.equal(failed.ok, false);
      const banner = await page2.locator('[data-testid="error-banner"]').textContent();
      assert.match(banner, /IndexedDB write failed/);
      const unpaid = await idbGet(page2, 'orders', 'fail-1');
      assert.equal(unpaid.state, 'ordering');
      assert.equal(unpaid.bill, null);

      const clicks = await page2.evaluate(function () {
        return window.POS.pay('fail-1', { method: 'Other' }).then(function () {
          return window.POS.test.payCallCount();
        });
      });
      assert.equal(clicks, 1);

      const removed = await page2.evaluate(function () {
        return window.POS.store.deleteOrder('keep-1').then(function () {
          return 'deleted';
        }, function (err) {
          return err.message;
        });
      });
      assert.match(removed, /zero-line/);
      const ghost = order('ghost', { lines: [] });
      await page2.evaluate(function (value) { return window.POS.store.saveOrder(value); }, ghost);
      await page2.evaluate(function () { window.location.hash = '#/order/ghost'; });
      await page2.reload({ waitUntil: 'load' });
      await page2.waitForFunction(function () { return window.POS && window.POS.ready === true; });
      assert.equal(await page2.evaluate(function () { return location.hash; }), '#/tables');
      assert.equal(await idbGet(page2, 'orders', 'ghost'), null);
      const stillThere = await idbGet(page2, 'orders', 'keep-1');
      assert.equal(stillThere.lines.length, 1);

      const renamed = await page2.evaluate(function () {
        var settings = window.POS.store.current().settings;
        settings.tables[0].name = 'Patio';
        return window.POS.store.saveSettings(settings).then(function () {
          return window.POS.test.reset();
        });
      });
      assert.equal(renamed.settings.tables[0].name, 'T1');
      assert.equal(renamed.settings.tables.length, 20);
      assert.ok(renamed.menu.items.some(function (item) { return item.name === 'Nasi Lemak 椰浆饭'; }));

      const second = await restarted.newPage();
      await second.goto(APP + '?test=1#/tables', { waitUntil: 'load' });
      await second.waitForSelector('[data-testid="tablock-notice"]');
      const notice = await second.locator('[data-testid="tablock-notice"]').textContent();
      assert.match(notice, /already open in another tab/);
      assert.equal(await second.locator('[data-testid="table-grid"]').count(), 0);
      assert.equal(await second.evaluate(function () { return window.POS.test; }), undefined);
    } finally {
      await restarted.close();
    }
  } finally {
    await context.close().catch(function () {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('window.POS.test is undefined without ?test=1', { timeout: 60000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-t04-notest-'));
  const context = await launch(dir);
  try {
    const page = await openApp(context, '');
    const hook = await page.evaluate(function () { return window.POS.test === undefined; });
    assert.equal(hook, true);
    const names = await page.evaluate(function () {
      return window.POS.store.current().settings.tables.map(function (table) { return table.name; });
    });
    assert.equal(names[0], 'T1');
    assert.equal(names.length, 20);
  } finally {
    await context.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a newer IndexedDB version blocks startup and writes nothing', { timeout: 60000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-t04-schema-'));
  const context = await launch(dir);
  try {
    const prep = await context.newPage();
    await prep.goto(SCHEMA, { waitUntil: 'load' });
    await prep.waitForFunction(function () { return window.SCHEMA_READY === true; });
    const prepError = await prep.evaluate(function () { return window.SCHEMA_ERROR || ''; });
    assert.equal(prepError, '');
    await prep.close();

    const page = await openApp(context, '?test=1');
    const message = await page.locator('[data-testid="schema-block"]').textContent();
    assert.match(message, /newer version/);
    assert.match(message, /Nothing was changed/);
    assert.equal(await page.locator('[data-testid="table-grid"]').count(), 0);
    assert.equal(await page.evaluate(function () { return window.POS.test; }), undefined);
    const ghost = await idbGet(page, 'orders', 'ghost');
    const settings = await idbGet(page, 'settings', 'current');
    assert.equal(ghost && ghost.id, 'ghost');
    assert.equal(ghost.lines.length, 0);
    assert.equal(settings, null);
  } finally {
    await context.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a newer schemaVersion inside v1 blocks startup and does not sweep', { timeout: 60000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-t04-meta-'));
  const context = await launch(dir);
  try {
    const page = await openApp(context, '?test=1');
    await page.evaluate(function () {
      return new Promise(function (resolve, reject) {
        var req = indexedDB.open('mini-pos');
        req.onerror = function () { reject(req.error); };
        req.onsuccess = function () {
          var db = req.result;
          var tx = db.transaction(['meta', 'orders'], 'readwrite');
          tx.objectStore('meta').put(2, 'schemaVersion');
          tx.objectStore('orders').put({
            id: 'ghost-meta',
            type: 'dine_in',
            tableId: 't2',
            state: 'ordering',
            closed: false,
            lines: [],
            voidDates: [],
            bill: null
          });
          tx.oncomplete = function () { db.close(); resolve(); };
          tx.onerror = function () { db.close(); reject(tx.error); };
        };
      });
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(function () { return window.POS && window.POS.ready === true; });
    const message = await page.locator('[data-testid="schema-block"]').textContent();
    assert.match(message, /Nothing was changed/);
    const ghost = await idbGet(page, 'orders', 'ghost-meta');
    const settings = await idbGet(page, 'settings', 'current');
    assert.equal(ghost.lines.length, 0);
    assert.equal(settings.tables.length, 20);
  } finally {
    await context.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
