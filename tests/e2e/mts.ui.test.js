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

function selectedChannels() {
  const alias = { chrome: 'chrome', 'google-chrome': 'chrome', edge: 'msedge', msedge: 'msedge' };
  const raw = process.env.POS_BROWSERS || 'chrome,msedge';
  const out = [];
  raw.split(/[,\s]+/).filter(Boolean).forEach(function (id) {
    const channel = alias[id.toLowerCase()];
    if (!channel) throw new Error('Unknown POS_BROWSERS value: ' + id + ' (use chrome or msedge)');
    if (out.indexOf(channel) === -1) out.push(channel);
  });
  if (!out.length) throw new Error('POS_BROWSERS is empty');
  return out;
}

function item(id, sen, name) {
  return {
    id: id,
    itemId: id,
    name: name || id,
    unitPriceSen: sen,
    qty: 1,
    note: '',
    committed: false,
    void: null
  };
}

function dine(id, lines, type) {
  return {
    id: id,
    type: type || 'dine_in',
    tableId: type === 'takeaway' ? null : 't1',
    takeawayNo: type === 'takeaway' ? 'TA-001' : null,
    state: 'ordering',
    closed: false,
    openedDate: '2026-10-02',
    openedAt: '2026-10-02T04:00:00.000Z',
    closedAt: null,
    voidDates: [],
    lines: lines,
    billDiscount: null,
    split: null,
    bill: null
  };
}

async function go(page, hash) {
  await page.evaluate(function (next) {
    if ((location.hash || '') === next) window.POS.dom.redraw();
    else location.hash = next;
  }, hash);
}

async function load(page, orders) {
  await page.evaluate(function (payload) {
    return window.POS.test.loadFixture(payload);
  }, { orders: orders });
}

async function reset(page) {
  await page.evaluate(function () { return window.POS.test.reset(); });
  await go(page, '#/tables');
  await page.waitForSelector('[data-testid="table-grid"]');
}

async function saveSettings(page) {
  await page.evaluate(function () {
    var node = document.querySelector('[data-testid="settings-message"]');
    if (node) node.remove();
  });
  await page.locator('[data-testid="settings-save"]').click();
  await page.waitForFunction(function () {
    var node = document.querySelector('[data-testid="settings-message"]');
    return node && node.textContent === 'Saved';
  });
}

async function text(page, testId) {
  return page.locator('[data-testid="' + testId + '"]').innerText();
}

async function runChannel(channel) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-mts-' + channel + '-'));
  const context = await chromium.launchPersistentContext(dir, {
    channel: channel,
    headless: true,
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', function (err) { errors.push(String(err)); });
  try {
    await page.goto(APP + '?test=1#/tables', { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(function () { return window.POS && window.POS.ready === true; }, null, { timeout: 20000 });

    await page.locator('[data-testid="table-t1"]').click();
    await page.waitForSelector('[data-testid="order-bill"]');
    await page.locator('[data-testid="order-bill"]').click();
    await page.waitForSelector('[data-testid="order-message"]');
    assert.match(await text(page, 'order-message'), /Add an item/);
    await page.locator('[data-testid="order-back"]').click();
    await page.waitForSelector('[data-testid="table-grid"]');

    await page.locator('[data-testid="table-t1"]').click();
    await page.waitForSelector('[data-testid="order-item-card-nasi-lemak"]');
    await page.locator('[data-testid="order-item-card-nasi-lemak"]').click();
    await page.waitForSelector('[data-testid^="order-line-"]');
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(function () { return window.POS && window.POS.ready === true; }, null, { timeout: 20000 });
    await page.waitForSelector('[data-testid^="order-line-"]');
    assert.match(await page.locator('.line-name').first().innerText(), /椰浆饭/);

    await page.locator('[data-testid="order-bill"]').click();
    await page.waitForSelector('[data-testid="bill-pay"]');
    await page.locator('[data-testid="bill-pay"]').click();
    await page.waitForSelector('[data-testid="pay-method-cash"]');
    await page.locator('[data-testid="pay-method-cash"]').click();
    await page.locator('[data-testid="pay-cash-received"]').fill('1.00');
    await page.locator('[data-testid="pay-confirm"]').click();
    await page.waitForSelector('[data-testid="blocked-msg-r10"]');
    assert.match(await text(page, 'blocked-msg-r10'), /below the amount due/);

    await reset(page);
    await load(page, [dine('mts-01', [item('nasi', 10000, 'Nasi Lemak 椰浆饭')])]);
    await go(page, '#/bill/mts-01');
    await page.waitForSelector('[data-testid="bill-grand-total"]');
    assert.equal(await text(page, 'bill-service-charge'), 'RM 10.00');
    assert.equal(await text(page, 'bill-sst'), 'RM 6.60');
    assert.equal(await text(page, 'bill-grand-total'), 'RM 116.60');
    assert.equal(await text(page, 'bill-discount'), 'RM 0.00');
    const discountIds = await page.locator('[data-testid*="discount"]').evaluateAll(function (nodes) {
      return nodes.map(function (node) { return node.getAttribute('data-testid'); });
    });
    assert.deepEqual(discountIds, ['bill-discount']);

    await page.locator('[data-testid="nav-settings"]').click();
    await page.waitForSelector('[data-testid="settings-sst-includes"]');
    await page.locator('[data-testid="settings-sst-includes"]').uncheck();
    await saveSettings(page);
    await go(page, '#/bill/mts-01');
    await page.waitForSelector('[data-testid="bill-sst"]');
    assert.equal(await text(page, 'bill-service-charge'), 'RM 10.00');
    assert.equal(await text(page, 'bill-sst'), 'RM 6.00');
    assert.equal(await text(page, 'bill-grand-total'), 'RM 116.00');

    await page.locator('[data-testid="nav-settings"]').click();
    await page.waitForSelector('[data-testid="settings-sst"]');
    await page.locator('[data-testid="settings-sst"]').uncheck();
    await saveSettings(page);
    await go(page, '#/bill/mts-01');
    await page.waitForSelector('[data-testid="bill-grand-total"]');
    assert.equal(await page.locator('[data-testid="bill-sst"]').count(), 0);
    assert.equal(await text(page, 'bill-grand-total'), 'RM 110.00');
    await page.locator('[data-testid="bill-pay"]').click();
    await page.waitForSelector('[data-testid="pay-method-card"]');
    await page.locator('[data-testid="pay-method-card"]').click();
    await page.locator('[data-testid="pay-confirm"]').click();
    await page.waitForSelector('[data-testid="receipt-sheet"]');
    const receipt = await page.locator('[data-testid="receipt-sheet"]').innerText();
    assert.equal(/\bSST\b/.test(receipt), false);
    assert.match(receipt, /椰浆饭/);

    await reset(page);
    await page.locator('[data-testid="nav-settings"]').click();
    await page.waitForSelector('[data-testid="settings-sc-dine-in"]');
    await page.locator('[data-testid="settings-sc-dine-in"]').uncheck();
    await page.locator('[data-testid="settings-sst"]').uncheck();
    await saveSettings(page);
    const roundingRows = [
      [1001, -1, 'RM 10.00'],
      [1002, -2, 'RM 10.00'],
      [1003, 2, 'RM 10.05'],
      [1004, 1, 'RM 10.05'],
      [1006, -1, 'RM 10.05'],
      [1007, -2, 'RM 10.05'],
      [1008, 2, 'RM 10.10'],
      [1009, 1, 'RM 10.10']
    ];
    for (let i = 0; i < roundingRows.length; i++) {
      const sen = roundingRows[i][0];
      const roundingSen = roundingRows[i][1];
      const grand = roundingRows[i][2];
      const id = 'round-' + sen;
      await load(page, [dine(id, [item('p', sen, 'Price')])]);
      await go(page, '#/bill/' + id);
      await page.waitForSelector('[data-testid="bill-grand-total"]');
      const signed = await page.evaluate(function (value) {
        return window.POS.money.formatSigned(value);
      }, roundingSen);
      assert.equal(await text(page, 'bill-rounding'), signed, 'rounding ' + sen);
      assert.equal(await text(page, 'bill-grand-total'), grand, 'grand ' + sen);
      assert.equal(await page.locator('[data-testid="bill-sst"]').count(), 0);
    }

    await load(page, [dine('mts-05', [item('hundred', 10000, 'Hundred')])]);
    await go(page, '#/split/mts-05');
    await page.waitForSelector('[data-testid="split-count"]');
    await page.locator('[data-testid="split-count"]').fill('3');
    await page.locator('[data-testid="split-apply"]').click();
    await page.waitForSelector('[data-testid="split-sub-amount-3"]');
    assert.equal(await text(page, 'split-sub-amount-1'), 'RM 33.34');
    assert.equal(await text(page, 'split-sub-amount-2'), 'RM 33.33');
    assert.equal(await text(page, 'split-sub-amount-3'), 'RM 33.33');
    assert.match(await text(page, 'split-remainder-marker'), /0\.01/);

    await load(page, [dine('mts-06', [
      item('keep', 1000, 'Kept'),
      item('drop', 500, 'Dropped')
    ])]);
    await go(page, '#/order/mts-06');
    await page.waitForSelector('[data-testid="order-void-drop"]');
    await page.locator('[data-testid="order-void-drop"]').click();
    await page.locator('[data-testid="void-confirm"]').click();
    await page.waitForSelector('.line-void-reason');
    await page.locator('[data-testid="order-bill"]').click();
    await page.waitForSelector('[data-testid="bill-split"]');
    await page.locator('[data-testid="bill-split"]').click();
    await page.waitForSelector('[data-testid="split-mode-item"]');
    await page.locator('[data-testid="split-mode-item"]').click();
    await page.waitForSelector('[data-testid="split-assign-keep-0"]');
    assert.equal(await page.locator('[data-testid^="split-assign-drop-"]').count(), 0);
    await page.locator('[data-testid="split-assign-keep-0"]').click();
    await page.waitForFunction(function () {
      var one = document.querySelector('[data-testid="split-sub-amount-1"]');
      var two = document.querySelector('[data-testid="split-sub-amount-2"]');
      return one && two && one.textContent === 'RM 10.00' && two.textContent === 'RM 0.00';
    });

    await reset(page);
    await load(page, [dine('mts-03', [item('away', 2500, 'Takeaway')], 'takeaway')]);
    await go(page, '#/bill/mts-03');
    await page.waitForSelector('[data-testid="bill-grand-total"]');
    assert.equal(await text(page, 'bill-service-charge'), 'RM 0.00');
    assert.equal(await text(page, 'bill-sst'), 'RM 1.50');
    assert.equal(await text(page, 'bill-grand-total'), 'RM 26.50');

    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

selectedChannels().forEach(function (channel) {
  test('MTS UI checks in ' + channel, { timeout: 180000 }, async function () {
    await runChannel(channel);
  });
});
