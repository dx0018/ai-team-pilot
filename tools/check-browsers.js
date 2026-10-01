'use strict';

/*
 * Launch each requested Playwright channel and print browser.version().
 * Exit 1 if any channel is missing or fails to launch.
 *
 *   node tools/check-browsers.js              chrome and msedge
 *   node tools/check-browsers.js chrome
 *   node tools/check-browsers.js msedge
 */

const { chromium } = require('playwright');

const ALIAS = {
  chrome: 'chrome',
  'google-chrome': 'chrome',
  edge: 'msedge',
  msedge: 'msedge'
};

function channels() {
  const args = process.argv.slice(2).filter(Boolean);
  const raw = args.length ? args : ['chrome', 'msedge'];
  const out = [];
  raw.forEach(function (id) {
    const channel = ALIAS[id.toLowerCase()];
    if (!channel) {
      console.error('Unknown browser: ' + id + ' (use chrome or msedge)');
      process.exit(2);
    }
    if (out.indexOf(channel) === -1) out.push(channel);
  });
  return out;
}

async function check(channel) {
  let browser;
  try {
    browser = await chromium.launch({ channel: channel, headless: true });
    const version = browser.version();
    if (!version) throw new Error('browser.version() was empty');
    console.log(channel + ' ' + version);
  } finally {
    if (browser) await browser.close();
  }
}

async function main() {
  const list = channels();
  let failed = 0;
  for (let i = 0; i < list.length; i++) {
    try {
      await check(list[i]);
    } catch (err) {
      failed += 1;
      console.error(list[i] + ' missing: ' + (err && err.message ? err.message : String(err)));
    }
  }
  process.exit(failed === 0 ? 0 : 1);
}

main();
