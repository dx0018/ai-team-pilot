(function () {
  var POS = window.POS = window.POS || {};
  POS.ui = POS.ui || {};
  POS.uiState = POS.uiState || {};

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function button(className, text, testId) {
    var node = el('button', className, text);
    node.type = 'button';
    if (testId) node.setAttribute('data-testid', testId);
    return node;
  }

  function findOrder(id) {
    var orders = POS.store.current().openOrders || [];
    var i;
    for (i = 0; i < orders.length; i++) {
      if (orders[i].id === id) return orders[i];
    }
    return null;
  }

  function orderForTable(tableId) {
    var orders = POS.store.current().openOrders || [];
    var i;
    for (i = 0; i < orders.length; i++) {
      if (orders[i].type === 'dine_in' && orders[i].tableId === tableId && orders[i].closed !== true) {
        return orders[i];
      }
    }
    return null;
  }

  function statusOf(order) {
    if (!order) return { key: 'empty', label: 'Empty' };
    if (order.state === 'bill_requested') return { key: 'bill', label: 'Bill Requested' };
    if (order.state === 'paid') return { key: 'paid', label: 'Paid' };
    return { key: 'ordering', label: 'Ordering' };
  }

  function totalsFor(order) {
    return POS.calc.computeBill({
      lines: order.lines || [],
      billDiscount: null,
      orderType: order.type || 'dine_in',
      settings: POS.store.current().settings
    });
  }

  function redraw() {
    var route = POS.router.match(location.hash || '#/tables');
    POS.render(route, document.getElementById('app'));
  }

  function save(order) {
    return POS.store.saveOrder(order).then(function () { redraw(); });
  }

  function showMessage(text) {
    POS.uiState.message = text;
    redraw();
  }

  function bar(active) {
    var header = el('header', 'app-bar');
    var brand = el('div', 'brand', 'Restaurant Mini POS');
    header.appendChild(brand);
    var nav = el('nav', 'app-nav');
    [
      ['tables', '#/tables', 'Tables'],
      ['eod', '#/eod', 'End of day'],
      ['settings', '#/settings', 'Settings']
    ].forEach(function (item) {
      var link = el('a', 'nav-link' + (item[0] === active ? ' is-active' : ''), item[2]);
      link.href = item[1];
      link.setAttribute('data-testid', 'nav-' + item[0]);
      link.addEventListener('click', function (event) {
        event.preventDefault();
        POS.navigate(item[1]);
      });
      nav.appendChild(link);
    });
    header.appendChild(nav);
    return header;
  }

  POS.dom = {
    el: el,
    button: button,
    findOrder: findOrder,
    orderForTable: orderForTable,
    statusOf: statusOf,
    totalsFor: totalsFor,
    redraw: redraw,
    save: save,
    showMessage: showMessage
  };
  POS.ui.bar = bar;
})();
