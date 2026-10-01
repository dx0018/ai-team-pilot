const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { chromium } = require('playwright');

function fileUrl(relative) {
  const abs = path.join(__dirname, '..', '..', relative);
  const parts = abs.split(path.sep).map(function (part) { return encodeURIComponent(part); });
  return 'file://' + parts.join('/');
}

test('primary token, local font, cards, buttons and greyscale status labels', { timeout: 60000 }, async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  const foreign = [];
  page.on('request', function (request) {
    const url = request.url();
    if (!url.startsWith('file://')) foreign.push(url);
  });
  try {
    await page.goto(fileUrl('index.html') + '#/tables', { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(function () { return window.POS && window.POS.ready === true; }, null, { timeout: 20000 });
    await page.evaluate(function () {
      var root = document.getElementById('app');
      var card = document.createElement('article');
      card.className = 'card';
      card.setAttribute('data-testid', 'theme-card');
      var button = document.createElement('button');
      button.className = 'btn btn-primary';
      button.type = 'button';
      button.textContent = 'Save';
      button.setAttribute('data-testid', 'theme-primary');
      var label = document.createElement('span');
      label.className = 'text-primary';
      label.textContent = 'Primary';
      label.setAttribute('data-testid', 'theme-text');
      var total = document.createElement('p');
      total.className = 'grand-total';
      total.textContent = 'RM 14.40';
      total.setAttribute('data-testid', 'theme-total');
      var running = document.createElement('p');
      running.className = 'running-total';
      running.textContent = 'RM 10.00';
      var labels = ['Empty', 'Ordering', 'Bill Requested', 'Paid'];
      var classes = ['status-empty', 'status-ordering', 'status-bill', 'status-paid'];
      card.appendChild(button);
      card.appendChild(label);
      card.appendChild(total);
      card.appendChild(running);
      labels.forEach(function (text, index) {
        var badge = document.createElement('span');
        badge.className = 'status-badge ' + classes[index];
        badge.textContent = text;
        badge.setAttribute('data-testid', 'status-' + classes[index]);
        card.appendChild(badge);
      });
      var sample = document.createElement('p');
      sample.className = 'theme-sample';
      sample.textContent = 'Nasi Lemak 椰浆饭 谢谢';
      sample.setAttribute('data-testid', 'theme-sample');
      card.appendChild(sample);
      root.appendChild(card);
    });

    const metrics = await page.evaluate(function () {
      function box(selector) {
        var node = document.querySelector(selector);
        var style = getComputedStyle(node);
        var rect = node.getBoundingClientRect();
        return {
          text: node.textContent,
          background: style.backgroundColor,
          color: style.color,
          radius: style.borderRadius,
          shadow: style.boxShadow,
          fontSize: style.fontSize,
          width: rect.width,
          height: rect.height
        };
      }
      return {
        card: box('[data-testid="theme-card"]'),
        button: box('[data-testid="theme-primary"]'),
        text: box('[data-testid="theme-text"]'),
        total: box('[data-testid="theme-total"]'),
        title: box('h1'),
        empty: box('[data-testid="status-status-empty"]'),
        ordering: box('[data-testid="status-status-ordering"]'),
        bill: box('[data-testid="status-status-bill"]'),
        paid: box('[data-testid="status-status-paid"]')
      };
    });

    assert.notEqual(metrics.card.radius, '0px');
    assert.notEqual(metrics.card.shadow, 'none');
    assert.ok(metrics.button.width >= 44);
    assert.ok(metrics.button.height >= 44);
    assert.ok(metrics.empty.width >= 44 && metrics.empty.height >= 44);
    assert.equal(metrics.empty.text, 'Empty');
    assert.equal(metrics.ordering.text, 'Ordering');
    assert.equal(metrics.bill.text, 'Bill Requested');
    assert.equal(metrics.paid.text, 'Paid');
    assert.equal(metrics.button.background, metrics.bill.background);
    assert.notEqual(metrics.button.background, metrics.ordering.background);
    assert.ok(parseFloat(metrics.total.fontSize) > parseFloat(metrics.title.fontSize));

    const recolored = await page.evaluate(function () {
      var beforeButton = getComputedStyle(document.querySelector('[data-testid="theme-primary"]')).backgroundColor;
      var beforeText = getComputedStyle(document.querySelector('[data-testid="theme-text"]')).color;
      var beforeBill = getComputedStyle(document.querySelector('[data-testid="status-status-bill"]')).backgroundColor;
      document.documentElement.style.setProperty('--color-primary', 'rgb(18, 52, 86)');
      return {
        beforeButton: beforeButton,
        afterButton: getComputedStyle(document.querySelector('[data-testid="theme-primary"]')).backgroundColor,
        afterText: getComputedStyle(document.querySelector('[data-testid="theme-text"]')).color,
        afterBill: getComputedStyle(document.querySelector('[data-testid="status-status-bill"]')).backgroundColor,
        accent: getComputedStyle(document.querySelector('[data-testid="status-status-ordering"]')).backgroundColor,
        beforeText: beforeText,
        beforeBill: beforeBill
      };
    });
    assert.equal(recolored.afterButton, 'rgb(18, 52, 86)');
    assert.equal(recolored.afterText, 'rgb(18, 52, 86)');
    assert.equal(recolored.afterBill, 'rgb(18, 52, 86)');
    assert.notEqual(recolored.afterButton, recolored.beforeButton);
    assert.notEqual(recolored.accent, 'rgb(18, 52, 86)');

    const grey = await page.evaluate(function () {
      document.body.style.filter = 'grayscale(1)';
      return ['empty', 'ordering', 'bill', 'paid'].map(function (name) {
        var node = document.querySelector('[data-testid="status-status-' + name + '"]');
        return { text: node.textContent, color: getComputedStyle(node).color };
      });
    });
    assert.deepEqual(grey.map(function (item) { return item.text; }), ['Empty', 'Ordering', 'Bill Requested', 'Paid']);
    grey.forEach(function (item) {
      assert.notEqual(item.color, 'rgba(0, 0, 0, 0)');
    });

    const fonts = await page.evaluate(async function () {
      var sample = 'Nasi Lemak 椰浆饭 谢谢';
      var regular = await document.fonts.load('400 32px "Noto Sans SC"', sample);
      var bold = await document.fonts.load('700 32px "Noto Sans SC"', sample);
      return {
        regular: regular.length > 0 && regular.every(function (face) { return face.status === 'loaded'; }),
        bold: bold.length > 0 && bold.every(function (face) { return face.status === 'loaded'; }),
        check: document.fonts.check('400 32px "Noto Sans SC"', sample) && document.fonts.check('700 32px "Noto Sans SC"', sample)
      };
    });
    assert.equal(fonts.regular, true);
    assert.equal(fonts.bold, true);
    assert.equal(fonts.check, true);
    assert.deepEqual(foreign, []);
  } finally {
    await browser.close();
  }
});
