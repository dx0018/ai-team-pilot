/*
 * T-01 spike. Classic script (not type="module") so it can run from file://.
 * Sets window.SPIKE_RESULT and window.SPIKE_DONE when every check has settled.
 */
(function () {
  var DB_NAME = 't01-spike';
  var STORE = 'kv';
  var SENTINEL_KEY = 'sentinel';
  var DEFAULT_TOKEN = 't01-idb-sentinel-v1';
  var LOCK_NAME = 't01-spike-lock';
  var FONT_FAMILY = 'T01 Noto Sans SC';
  var FONT_SPEC = '400 32px "' + FONT_FAMILY + '"';
  var SAMPLE = 'Nasi Lemak 椰浆饭 谢谢';

  window.SPIKE_CLASSIC_SCRIPT = true;

  var params = new URLSearchParams(location.search);
  var phase = params.get('phase') || 'write';
  var role = params.get('role') || 'holder';
  var token = params.get('token') || DEFAULT_TOKEN;

  function checkClassicScript() {
    return {
      pass: true,
      detail: 'spike.js ran from <script src> without type=module'
    };
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error('indexedDB is missing'));
        return;
      }
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('indexedDB open failed')); };
      req.onblocked = function () { reject(new Error('indexedDB open blocked')); };
    });
  }

  function idbPut(db, value) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, SENTINEL_KEY);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error || new Error('indexedDB write failed')); };
      tx.onabort = function () { reject(tx.error || new Error('indexedDB write aborted')); };
    });
  }

  function idbGet(db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE, 'readonly');
      var req = tx.objectStore(STORE).get(SENTINEL_KEY);
      req.onsuccess = function () { resolve(req.result === undefined ? null : req.result); };
      req.onerror = function () { reject(req.error || new Error('indexedDB read failed')); };
    });
  }

  function checkIndexedDB() {
    if (phase !== 'write' && phase !== 'read') {
      return Promise.resolve({
        pass: false,
        phase: phase,
        token: null,
        writtenAt: null,
        detail: 'unknown phase (use write or read)'
      });
    }
    var db;
    return openDb().then(function (opened) {
      db = opened;
      if (phase === 'write') {
        var value = { token: token, writtenAt: new Date().toISOString() };
        return idbPut(db, value).then(function () { return idbGet(db); });
      }
      return idbGet(db);
    }).then(function (stored) {
      var foundToken = stored && stored.token ? stored.token : null;
      var writtenAt = stored && stored.writtenAt ? stored.writtenAt : null;
      var pass = foundToken === token;
      var detail = phase === 'write'
        ? (pass ? 'sentinel written and read back' : 'write did not read back')
        : (pass ? 'sentinel matched after reopen' : (foundToken ? 'sentinel token mismatch' : 'sentinel missing'));
      return { pass: pass, phase: phase, token: foundToken, writtenAt: writtenAt, detail: detail };
    }).catch(function (err) {
      return {
        pass: false,
        phase: phase,
        token: null,
        writtenAt: null,
        detail: err && err.message ? err.message : String(err)
      };
    }).then(function (result) {
      if (db) {
        try { db.close(); } catch (e) { /* ignore */ }
      }
      return result;
    });
  }

  function checkLock() {
    var secure = window.isSecureContext === true;
    if (role !== 'holder' && role !== 'second' && role !== 'release') {
      return Promise.resolve({
        pass: false,
        role: role,
        outcome: 'error',
        lockIsNull: null,
        isSecureContext: secure,
        detail: 'unknown role (use holder, second, or release)'
      });
    }
    if (!navigator.locks || typeof navigator.locks.request !== 'function') {
      return Promise.resolve({
        pass: false,
        role: role,
        outcome: 'missing',
        lockIsNull: null,
        isSecureContext: secure,
        detail: 'navigator.locks.request is missing'
      });
    }
    return new Promise(function (resolve) {
      var settled = false;
      navigator.locks.request(LOCK_NAME, { ifAvailable: true }, function (lock) {
        var isNull = lock === null;
        var outcome = isNull ? 'null' : 'acquired';
        var pass = role === 'second' ? isNull : !isNull;
        var detail;
        if (isNull) detail = 'lock callback received null';
        else if (role === 'holder') detail = 'lock acquired and held';
        else detail = 'lock acquired and released';
        settled = true;
        resolve({
          pass: pass,
          role: role,
          outcome: outcome,
          lockIsNull: isNull,
          isSecureContext: secure,
          detail: detail
        });
        if (!isNull && role === 'holder') return new Promise(function () {});
      }).catch(function (err) {
        if (settled) return;
        resolve({
          pass: false,
          role: role,
          outcome: 'error',
          lockIsNull: null,
          isSecureContext: secure,
          detail: err && err.message ? err.message : String(err)
        });
      });
    });
  }

  function checkFont() {
    if (!document.fonts || typeof document.fonts.load !== 'function' || typeof document.fonts.check !== 'function') {
      return Promise.resolve({
        pass: false,
        family: FONT_FAMILY,
        sample: SAMPLE,
        loadedCount: 0,
        check: false,
        detail: 'document.fonts.load or document.fonts.check is missing'
      });
    }
    return document.fonts.load(FONT_SPEC, SAMPLE).then(function (faces) {
      var list = faces || [];
      var loaded = list.length > 0 && list.every(function (face) { return face.status === 'loaded'; });
      var check = document.fonts.check(FONT_SPEC, SAMPLE);
      return {
        pass: loaded && check,
        family: FONT_FAMILY,
        sample: SAMPLE,
        loadedCount: list.length,
        check: check,
        detail: loaded && check
          ? 'document.fonts.load and document.fonts.check succeeded'
          : 'font face did not load (loaded=' + list.length + ', check=' + check + ')'
      };
    }).catch(function (err) {
      return {
        pass: false,
        family: FONT_FAMILY,
        sample: SAMPLE,
        loadedCount: 0,
        check: false,
        detail: err && err.message ? err.message : String(err)
      };
    });
  }

  function row(name, check) {
    return {
      name: name,
      pass: !!check.pass,
      result: check.pass ? 'PASS' : 'FAIL',
      detail: check.detail || ''
    };
  }

  function render(result) {
    document.getElementById('phase').textContent = result.phase;
    document.getElementById('role').textContent = result.role;
    document.getElementById('ua').textContent = result.browser.userAgent;
    document.getElementById('secure').textContent = String(result.browser.isSecureContext);
    var tbody = document.querySelector('#results tbody');
    tbody.textContent = '';
    result.rows.forEach(function (item) {
      var tr = document.createElement('tr');
      ['name', 'result', 'detail'].forEach(function (key) {
        var td = document.createElement('td');
        td.textContent = item[key];
        if (key === 'result') td.className = item.pass ? 'pass' : 'fail';
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }

  Promise.all([checkIndexedDB(), checkLock(), checkFont()]).then(function (parts) {
    var indexedDBResult = parts[0];
    var locksResult = parts[1];
    var fontResult = parts[2];
    var classic = checkClassicScript();
    var result = {
      phase: phase,
      role: role,
      browser: {
        userAgent: navigator.userAgent,
        isSecureContext: window.isSecureContext === true
      },
      checks: {
        classicScript: classic,
        indexedDB: indexedDBResult,
        webLocks: locksResult,
        font: fontResult
      },
      rows: [
        row('Classic script', classic),
        row('IndexedDB', indexedDBResult),
        row('Web Locks', locksResult),
        row('Local font', fontResult)
      ]
    };
    window.SPIKE_RESULT = result;
    render(result);
    window.SPIKE_DONE = true;
  }).catch(function (err) {
    window.SPIKE_RESULT = {
      phase: phase,
      role: role,
      browser: {
        userAgent: navigator.userAgent,
        isSecureContext: window.isSecureContext === true
      },
      checks: {
        classicScript: checkClassicScript(),
        indexedDB: { pass: false, detail: 'runner failed' },
        webLocks: { pass: false, detail: 'runner failed' },
        font: { pass: false, detail: 'runner failed' }
      },
      error: err && err.message ? err.message : String(err)
    };
    window.SPIKE_DONE = true;
  });
})();
