#!/usr/bin/env node
'use strict';

/*
 * T-01 spike runner. One JSON line per browser on stdout.
 * Exit 0 only when every selected browser passes every check.
 *
 * Browsers: SPIKE_BROWSERS=chrome,msedge
 *           node tests/spike/t01.spike.js chrome
 *           node tests/spike/t01.spike.js --browsers=msedge
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const HELP = [
  'Usage: node tests/spike/t01.spike.js [chrome|msedge ...] [--browsers=chrome,msedge]',
  'Env:   SPIKE_BROWSERS=chrome,msedge   (default: both)',
  'Aliases: edge = msedge, google-chrome = chrome'
].join('\n');

const ALIAS = {
  chrome: 'chrome',
  'google-chrome': 'chrome',
  edge: 'msedge',
  msedge: 'msedge'
};

function selectedBrowsers() {
  const argv = process.argv.slice(2);
  const fromCli = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      console.log(HELP);
      process.exit(0);
    }
    if (arg === '--browsers') {
      fromCli.push(argv[i + 1] || '');
      i += 1;
      continue;
    }
    if (arg.startsWith('--browsers=')) {
      fromCli.push(arg.slice('--browsers='.length));
      continue;
    }
    if (arg.startsWith('-')) {
      console.error('Unknown argument: ' + arg);
      process.exit(2);
    }
    fromCli.push(arg);
  }
  const raw = fromCli.length ? fromCli.join(',') : (process.env.SPIKE_BROWSERS || 'chrome,msedge');
  const ids = raw.split(/[,\s]+/).filter(Boolean);
  const out = [];
  ids.forEach(function (id) {
    const channel = ALIAS[id.toLowerCase()];
    if (!channel) {
      console.error('Unknown browser: ' + id + ' (use chrome or msedge)');
      process.exit(2);
    }
    if (!out.some(function (item) { return item.channel === channel; })) {
      out.push({ id: channel, channel: channel });
    }
  });
  if (!out.length) {
    console.error('No browsers selected');
    process.exit(2);
  }
  return out;
}

function spikeFileUrl() {
  const abs = path.resolve(__dirname, '../../spikes/t01/index.html');
  const parts = abs.split(path.sep).map(function (part) { return encodeURIComponent(part); });
  return 'file://' + parts.join('/');
}

const FILE_URL = spikeFileUrl();

function pageUrl(query) {
  const url = new URL(FILE_URL);
  Object.keys(query).forEach(function (key) {
    url.searchParams.set(key, query[key]);
  });
  return url.href;
}

function reportedVersion(channel, ua, product) {
  const source = ua || '';
  const productVersion = ((product || '').match(/\/([\d.]+)/) || [])[1] || '';
  const edge = ((source.match(/Edg\/([\d.]+)/) || [])[1]) || '';
  const chrome = ((source.match(/(?:HeadlessChrome|Chrome)\/([\d.]+)/) || [])[1]) || '';
  const reduced = function (version) { return !version || /\.0\.0\.0$/.test(version); };
  if (channel === 'msedge') {
    if (!reduced(edge)) return edge;
    if (productVersion) return productVersion;
    return edge || chrome;
  }
  if (!reduced(productVersion)) return productVersion;
  if (!reduced(chrome)) return chrome;
  return productVersion || chrome;
}

async function browserProduct(context, page) {
  try {
    const session = await context.newCDPSession(page);
    const info = await session.send('Browser.getVersion');
    await session.detach();
    return info && info.product ? info.product : '';
  } catch (err) {
    return '';
  }
}

async function launch(channel, userDataDir) {
  return chromium.launchPersistentContext(userDataDir, {
    channel: channel,
    headless: true
  });
}

async function openSpike(context, query, offending) {
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', function (err) {
    pageErrors.push(err && err.message ? err.message : String(err));
  });
  // Attached after newPage(), so Playwright's initial about:blank is not counted.
  // Any later request whose URL does not start with file:// fails the run.
  page.on('request', function (request) {
    const url = request.url();
    if (!url.startsWith('file://')) offending.push(url);
  });
  await page.goto(pageUrl(query), { waitUntil: 'load', timeout: 30000 });
  try {
    await page.waitForFunction(function () { return window.SPIKE_DONE === true; }, null, { timeout: 20000 });
  } catch (err) {
    const message = pageErrors.length ? pageErrors.join('; ') : (err && err.message ? err.message : String(err));
    throw new Error('spike did not finish: ' + message);
  }
  const result = await page.evaluate(function () { return window.SPIKE_RESULT; });
  return { page: page, result: result, pageErrors: pageErrors };
}

function checkPass(result, name) {
  return !!(result && result.checks && result.checks[name] && result.checks[name].pass);
}

function buildSummary(spec, pages, offending, product) {
  const write = pages.write.result;
  const read = pages.read.result;
  const holder = pages.holder.result;
  const second = pages.second.result;
  const token = pages.token;
  const ua = (read && read.browser && read.browser.userAgent) || '';
  const secureByPage = {
    write: !!(write && write.browser && write.browser.isSecureContext),
    read: !!(read && read.browser && read.browser.isSecureContext),
    holder: !!(holder && holder.browser && holder.browser.isSecureContext),
    second: !!(second && second.browser && second.browser.isSecureContext)
  };

  const classicScript = ['write', 'read', 'holder', 'second'].every(function (name) {
    return checkPass(pages[name].result, 'classicScript');
  });
  const indexedDB = checkPass(write, 'indexedDB')
    && checkPass(read, 'indexedDB')
    && checkPass(holder, 'indexedDB')
    && checkPass(second, 'indexedDB')
    && write.checks.indexedDB.token === token
    && read.checks.indexedDB.token === token
    && holder.checks.indexedDB.token === token
    && second.checks.indexedDB.token === token
    && write.phase === 'write'
    && read.phase === 'read';
  const holderLocks = holder.checks && holder.checks.webLocks;
  const secondLocks = second.checks && second.checks.webLocks;
  const webLocks = checkPass(holder, 'webLocks')
    && checkPass(second, 'webLocks')
    && holderLocks.outcome === 'acquired'
    && holderLocks.lockIsNull === false
    && holderLocks.role === 'holder'
    && secondLocks.outcome === 'null'
    && secondLocks.lockIsNull === true
    && secondLocks.role === 'second';
  const font = ['write', 'read', 'holder', 'second'].every(function (name) {
    return checkPass(pages[name].result, 'font');
  });
  const noNonFileRequests = offending.length === 0;
  const pass = classicScript && indexedDB && webLocks && font && noNonFileRequests;

  return {
    browser: spec.id,
    channel: spec.channel,
    version: reportedVersion(spec.channel, ua, product),
    product: product,
    userAgent: ua,
    isSecureContext: secureByPage.holder,
    isSecureContextByPage: secureByPage,
    checks: {
      classicScript: { pass: classicScript },
      indexedDB: {
        pass: indexedDB,
        token: read && read.checks ? read.checks.indexedDB.token : null,
        writtenAt: write && write.checks ? write.checks.indexedDB.writtenAt : null
      },
      webLocks: {
        pass: webLocks,
        holderOutcome: holderLocks ? holderLocks.outcome : null,
        secondOutcome: secondLocks ? secondLocks.outcome : null,
        holderLockIsNull: holderLocks ? holderLocks.lockIsNull : null,
        secondLockIsNull: secondLocks ? secondLocks.lockIsNull : null,
        isSecureContext: holderLocks ? holderLocks.isSecureContext : secureByPage.holder
      },
      font: {
        pass: font,
        family: holder && holder.checks && holder.checks.font ? holder.checks.font.family : null,
        sample: holder && holder.checks && holder.checks.font ? holder.checks.font.sample : null
      }
    },
    offendingRequests: offending,
    pass: pass
  };
}

async function runBrowser(spec) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 't01-' + spec.channel + '-'));
  const offending = [];
  const token = 't01-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  let context = null;
  const pages = {};
  try {
    context = await launch(spec.channel, userDataDir);
    pages.write = await openSpike(context, { phase: 'write', role: 'release', token: token }, offending);
    await pages.write.page.close();
    await context.close();
    context = null;

    context = await launch(spec.channel, userDataDir);
    pages.read = await openSpike(context, { phase: 'read', role: 'release', token: token }, offending);
    await pages.read.page.close();
    pages.holder = await openSpike(context, { phase: 'read', role: 'holder', token: token }, offending);
    pages.second = await openSpike(context, { phase: 'read', role: 'second', token: token }, offending);
    const product = await browserProduct(context, pages.holder.page);
    pages.token = token;
    const summary = buildSummary(spec, pages, offending, product);
    await pages.second.page.close();
    await pages.holder.page.close();
    await context.close();
    context = null;
    return summary;
  } catch (err) {
    return {
      browser: spec.id,
      channel: spec.channel,
      version: '',
      product: '',
      userAgent: '',
      isSecureContext: null,
      checks: {
        classicScript: { pass: false },
        indexedDB: { pass: false },
        webLocks: { pass: false },
        font: { pass: false }
      },
      offendingRequests: offending,
      pass: false,
      error: err && err.stack ? err.stack : String(err)
    };
  } finally {
    if (context) {
      try { await context.close(); } catch (err) { /* already closing */ }
    }
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (err) { /* ignore */ }
  }
}

async function main() {
  const browsers = selectedBrowsers();
  let failed = false;
  for (let i = 0; i < browsers.length; i++) {
    const summary = await runBrowser(browsers[i]);
    console.log(JSON.stringify(summary));
    if (!summary.pass) failed = true;
  }
  process.exit(failed ? 1 : 0);
}

main().catch(function (err) {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
