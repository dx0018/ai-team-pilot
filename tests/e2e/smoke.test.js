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

async function idbGet(page, id) {
  return page.evaluate(function (orderId) {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open('mini-pos');
      req.onerror = function () { reject(req.error); };
      req.onsuccess = function () {
        var db = req.result;
        var get = db.transaction('orders', 'readonly').objectStore('orders').get(orderId);
        get.onerror = function () { reject(get.error); };
        get.onsuccess = function () { resolve(get.result || null); };
      };
    });
  }, id);
}

async function runChannel(channel) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-smoke-' + channel + '-'));
  const context = await chromium.launchPersistentContext(dir, { channel: channel, headless: true, viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  try {
    await page.addInitScript(function () {
      window.print = function () { window.__printed = (window.__printed || 0) + 1; };
    });
    await page.goto(APP + '?test=1#/tables', { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(function () { return window.POS && window.POS.ready === true; }, null, { timeout: 20000 });
    await page.locator('[data-testid="table-t1"]').click();
    await page.waitForSelector('[data-testid="order-item-card-nasi-lemak"]');
    await page.locator('[data-testid="order-item-card-nasi-lemak"]').click();
    await page.locator('[data-testid="category-noodles"]').click();
    await page.locator('[data-testid="order-item-card-mee-goreng"]').click();
    await page.waitForFunction(function () {
      return document.querySelectorAll('[data-testid^="order-line-"]').length === 2;
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(function () { return window.POS && window.POS.ready === true; }, null, { timeout: 20000 });
    await page.waitForFunction(function () {
      return document.querySelectorAll('[data-testid^="order-line-"]').length === 2;
    });
    await page.locator('[data-testid="order-bill"]').click();
    await page.waitForSelector('[data-testid="bill-grand-total"]');
    await page.locator('[data-testid="bill-split"]').click();
    await page.waitForSelector('[data-testid="split-apply"]');
    await page.locator('[data-testid="split-apply"]').click();
    await page.waitForSelector('[data-testid="split-sub-amount-1"]');
    await page.waitForSelector('[data-testid="split-sub-amount-2"]');
    await page.locator('[data-testid="split-pay"]').click();
    await page.waitForSelector('[data-testid="pay-method-cash"]');
    await page.locator('[data-testid="pay-method-cash"]').click();
    await page.locator('[data-testid="pay-cash-received"]').fill('100.00');
    await page.locator('[data-testid="pay-confirm"]').click();
    await page.waitForSelector('[data-testid="receipt-sheet"]');
    const billNo = await page.locator('[data-testid="receipt-bill-no"]').innerText();
    assert.match(billNo, /^B-\d{8}-\d{4}$/);
    await page.locator('[data-testid="receipt-print"]').click();
    const printed = await page.evaluate(function () { return window.__printed || 0; });
    assert.ok(printed >= 1);
    const orderId = await page.evaluate(function () {
      var hash = location.hash;
      return hash.split('/').pop();
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(function () { return window.POS && window.POS.ready === true; }, null, { timeout: 20000 });
    await page.waitForSelector('[data-testid="receipt-bill-no"]');
    assert.equal(await page.locator('[data-testid="receipt-bill-no"]').innerText(), billNo);
    const stored = await idbGet(page, orderId);
    assert.ok(stored && stored.bill);
    assert.equal(stored.bill.billNo, billNo);
    assert.equal(stored.bill.payment.method, 'Cash');
    assert.ok(stored.bill.split && stored.bill.split.subBills.length === 2);
    await page.locator('[data-testid="receipt-tables"]').click();
    await page.waitForFunction(function () {
      var node = document.querySelector('[data-testid="table-status-t1"]');
      return node && node.textContent === 'Paid';
    });
  } finally {
    await context.close();
  }
}

test('smoke: open, order, split, pay, print, refresh persists in Chrome', { timeout: 120000 }, async function () {
  await runChannel('chrome');
});

test('smoke: open, order, split, pay, print, refresh persists in Edge', { timeout: 120000 }, async function () {
  await runChannel('msedge');
});
