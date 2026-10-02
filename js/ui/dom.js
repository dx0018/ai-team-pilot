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
    return POS.store.saveOrder(order).then(function (saved) {
      redraw();
      return saved;
    });
  }

  function tableName(tableId) {
    var tables = POS.store.current().settings.tables || [];
    var i;
    for (i = 0; i < tables.length; i++) {
      if (tables[i].id === tableId) return tables[i].name;
    }
    return tableId || '';
  }

  function splitPreview(order) {
    if (!order || !order.split) return null;
    var grand = totalsFor(order).grandTotalSen;
    if (order.split.mode === 'equal') {
      var equal = POS.calc.splitEqual(grand, order.split.n);
      return { amounts: equal.amounts, remainderSen: equal.remainderSen };
    }
    if (order.split.mode === 'item') {
      var bases = POS.domain.splitItemBases(order);
      if (!bases.length) return null;
      var item = POS.calc.splitByItem(grand, bases);
      return { amounts: item.amounts, remainderSen: item.remainderSen };
    }
    return null;
  }

  function moneyRow(label, text, testId) {
    var line = el('div', 'preview-row');
    line.appendChild(el('span', null, label));
    var value = el('span', null, text);
    if (testId) value.setAttribute('data-testid', testId);
    line.appendChild(value);
    return line;
  }

  function totalsBlock(order, grandTestId) {
    var totals = totalsFor(order);
    var settings = POS.store.current().settings;
    var box = el('div', 'bill-preview');
    box.appendChild(moneyRow('Subtotal', POS.money.formatRM(totals.subtotalSen), 'bill-subtotal'));
    box.appendChild(moneyRow('Discount', POS.money.formatRM(totals.discountSen), 'bill-discount'));
    box.appendChild(moneyRow('Service charge', POS.money.formatRM(totals.serviceChargeSen), 'bill-service-charge'));
    if (settings.sst && settings.sst.enabled) {
      box.appendChild(moneyRow('SST', POS.money.formatRM(totals.sstSen), 'bill-sst'));
    }
    box.appendChild(moneyRow('Rounding', POS.money.formatSigned(totals.roundingSen), 'bill-rounding'));
    var grand = el('p', 'grand-total', POS.money.formatRM(totals.grandTotalSen));
    grand.setAttribute('data-testid', grandTestId || 'bill-grand-total');
    box.appendChild(grand);
    return box;
  }

  function splitAmounts(preview) {
    var box = el('div', 'split-amounts');
    if (!preview) return box;
    var i;
    for (i = 0; i < preview.amounts.length; i++) {
      var row = el('div', 'preview-row');
      row.appendChild(el('span', null, '/' + (i + 1)));
      var amount = el('span', null, POS.money.formatRM(preview.amounts[i]));
      amount.setAttribute('data-testid', 'split-sub-amount-' + (i + 1));
      row.appendChild(amount);
      if (i === 0) {
        var mark = el('span', 'remainder');
        mark.setAttribute('data-testid', 'split-remainder-marker');
        mark.textContent = preview.remainderSen > 0 ? 'includes remainder ' + POS.money.formatRM(preview.remainderSen) : '';
        row.appendChild(mark);
      }
      box.appendChild(row);
    }
    return box;
  }

  function showMessage(text) {
    POS.uiState.message = text;
    redraw();
  }

  function consumeMessage(testId) {
    if (!POS.uiState.message) return null;
    var msg = el('p', 'blocked-msg', POS.uiState.message);
    msg.setAttribute('data-testid', testId || 'blocked-msg-r10');
    POS.uiState.message = '';
    return msg;
  }

  function bar(active) {
    var header = el('header', 'app-bar no-print');
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
    showMessage: showMessage,
    consumeMessage: consumeMessage,
    tableName: tableName,
    splitPreview: splitPreview,
    totalsBlock: totalsBlock,
    splitAmounts: splitAmounts
  };
  POS.ui.bar = bar;
})();
