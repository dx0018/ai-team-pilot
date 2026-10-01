(function () {
  var POS = window.POS = window.POS || {};
  var payCallCount = 0;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function showNotice(testId, message) {
    var root = document.getElementById('app');
    root.textContent = '';
    var p = document.createElement('p');
    p.setAttribute('data-testid', testId);
    p.textContent = message;
    root.appendChild(p);
  }

  function showErrorBanner(message) {
    var node = document.querySelector('[data-testid="error-banner"]');
    if (!node) {
      node = document.createElement('div');
      node.setAttribute('data-testid', 'error-banner');
      node.setAttribute('role', 'alert');
      document.body.insertBefore(node, document.body.firstChild);
    }
    node.textContent = message || 'Could not save.';
  }

  POS.render = function (route, root) {
    root.textContent = '';
    var screen = el('section', 'screen');
    screen.setAttribute('data-screen', route.name);
    if (route.name === 'tables') {
      screen.appendChild(el('h1', null, 'Tables'));
      var grid = el('div', 'table-grid');
      grid.setAttribute('data-testid', 'table-grid');
      screen.appendChild(grid);
    } else {
      screen.appendChild(el('h1', null, route.name));
    }
    root.appendChild(screen);
  };

  POS.pay = function (orderId, payment) {
    payCallCount += 1;
    return POS.store.payOrder(orderId, payment);
  };

  function testMode() {
    return /(?:^|[?&])test=1(?:&|$)/.test(location.search);
  }

  function installTestHooks() {
    if (!testMode()) return;
    POS.test = {
      setNow: function (iso) { POS.clock.setOverride(iso); },
      loadFixture: function (json) { return POS.store.loadFixture(json); },
      reset: function () { return POS.store.resetAll(); },
      failNextWrite: function () { POS.store.failNextWrite(); },
      payConcurrently: function (orderId, payment) {
        function settle(promise) {
          return promise.then(function (bill) {
            return { ok: true, bill: bill };
          }, function (err) {
            return { ok: false, error: err && err.message ? err.message : String(err) };
          });
        }
        return Promise.all([
          settle(POS.store.payOrder(orderId, payment)),
          settle(POS.store.payOrder(orderId, payment))
        ]);
      },
      payCallCount: function () { return payCallCount; }
    };
  }

  window.onerror = function (message) {
    showErrorBanner(message ? String(message) : 'Unexpected error');
  };
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    showErrorBanner(reason && reason.message ? reason.message : String(reason || 'Unexpected error'));
  });

  POS.store.onWriteFailure(function (err) {
    showErrorBanner(err && err.message ? err.message : 'Could not save.');
  });

  function markReady() {
    POS.ready = true;
  }

  POS.tablock.acquire().then(function (ok) {
    if (!ok) {
      showNotice('tablock-notice', 'already open in another tab');
      markReady();
      return;
    }
    return POS.store.init().then(function (state) {
      if (state.blocked) {
        showNotice('schema-block', state.message);
        markReady();
        return;
      }
      if (state.firstRun && navigator.storage && typeof navigator.storage.persist === 'function') {
        navigator.storage.persist();
      }
      POS.data = state;
      installTestHooks();
      POS.router.start();
      markReady();
    });
  }).catch(function (err) {
    showErrorBanner(err && err.message ? err.message : 'Could not open the database.');
    markReady();
  });
})();
