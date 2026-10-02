(function () {
  var POS = window.POS = window.POS || {};
  var REASONS = ['Wrong item', 'Customer changed mind', 'Out of stock'];

  function draw(route, body) {
    var dom = POS.dom;
    var order = dom.findOrder(route.params[0]);
    if (!order) {
      body.appendChild(dom.el('h1', null, 'Order'));
      body.appendChild(dom.el('p', null, 'This order is no longer open.'));
      var backMissing = dom.button('btn', 'Back to tables', 'order-back');
      backMissing.addEventListener('click', function () { POS.navigate('#/tables'); });
      body.appendChild(backMissing);
      return;
    }
    var settings = POS.store.current().settings;
    var tableName = order.tableId;
    var i;
    for (i = 0; i < settings.tables.length; i++) {
      if (settings.tables[i].id === order.tableId) tableName = settings.tables[i].name;
    }
    var head = dom.el('div', 'screen-head');
    head.appendChild(dom.el('h1', null, tableName));
    var back = dom.button('btn', 'Tables', 'order-back');
    back.addEventListener('click', function () { POS.navigate('#/tables'); });
    head.appendChild(back);
    body.appendChild(head);
    if (POS.uiState.message) {
      var msg = dom.el('p', 'blocked-msg', POS.uiState.message);
      msg.setAttribute('data-testid', 'order-message');
      body.appendChild(msg);
      POS.uiState.message = '';
    }

    var layout = dom.el('div', 'order-layout');
    layout.appendChild(menuPane(order));
    layout.appendChild(ticketPane(order));
    body.appendChild(layout);
  }

  function menuPane(order) {
    var dom = POS.dom;
    var menu = POS.store.current().menu;
    var pane = dom.el('div', 'menu-pane');
    var tabs = dom.el('div', 'category-tabs');
    var active = POS.uiState.categoryId;
    if (!active && menu.categories.length) active = menu.categories[0].id;
    menu.categories.slice().sort(function (a, b) { return a.sort - b.sort; }).forEach(function (category) {
      var tab = dom.button('btn category-tab' + (category.id === active ? ' is-active' : ''), category.name, 'category-' + category.id);
      tab.addEventListener('click', function () {
        POS.uiState.categoryId = category.id;
        dom.redraw();
      });
      tabs.appendChild(tab);
    });
    pane.appendChild(tabs);
    var grid = dom.el('div', 'menu-grid');
    menu.items.forEach(function (item) {
      if (item.categoryId !== active) return;
      var card = dom.el('button', 'card item-card');
      card.type = 'button';
      card.setAttribute('data-testid', 'order-item-card-' + item.id);
      var icon = dom.el('span', 'item-placeholder', (item.name || '?').charAt(0));
      card.appendChild(icon);
      card.appendChild(dom.el('span', 'item-name', item.name));
      card.appendChild(dom.el('span', 'item-price', POS.money.formatRM(item.priceSen)));
      card.addEventListener('click', function () {
        try {
          dom.save(POS.domain.addItem(order, item));
        } catch (err) {
          dom.showMessage(err.message);
        }
      });
      grid.appendChild(card);
    });
    pane.appendChild(grid);
    return pane;
  }

  function ticketPane(order) {
    var dom = POS.dom;
    var pane = dom.el('aside', 'card ticket');
    pane.appendChild(dom.el('h2', null, 'Order'));
    if (!order.lines.length) pane.appendChild(dom.el('p', 'muted', 'Tap an item to add it.'));
    order.lines.forEach(function (line) {
      pane.appendChild(lineRow(order, line));
    });
    if (POS.uiState.voidLineId) pane.appendChild(voidDialog(order));
    pane.appendChild(preview(order));
    var bill = dom.button('btn btn-primary', 'Bill', 'order-bill');
    bill.addEventListener('click', function () {
      try {
        var opened = POS.domain.openBill(order);
        dom.save(opened).then(function (saved) {
          POS.navigate('#/bill/' + saved.id);
        });
      } catch (err) {
        dom.showMessage(err.message);
      }
    });
    pane.appendChild(bill);
    return pane;
  }

  function lineRow(order, line) {
    var dom = POS.dom;
    var row = dom.el('div', 'line' + (line.void ? ' is-void' : ''));
    row.setAttribute('data-testid', 'order-line-' + line.id);
    var main = dom.el('div', 'line-main');
    main.appendChild(dom.el('span', 'line-name', line.name));
    main.appendChild(dom.el('span', 'line-price', POS.money.formatRM(line.qty * line.unitPriceSen)));
    if (line.void) main.appendChild(dom.el('span', 'line-void-reason', 'Void: ' + line.void.reason));
    row.appendChild(main);
    if (!line.void) {
      var qty = dom.el('div', 'qty-row');
      var minus = dom.button('btn qty-btn', '−', 'order-dec-' + line.id);
      var plus = dom.button('btn qty-btn', '+', 'order-inc-' + line.id);
      minus.addEventListener('click', function () { tryChange(order, function () { return POS.domain.decQty(order, line.id); }); });
      plus.addEventListener('click', function () { tryChange(order, function () { return POS.domain.incQty(order, line.id); }); });
      qty.appendChild(minus);
      qty.appendChild(dom.el('span', 'qty', String(line.qty)));
      qty.appendChild(plus);
      row.appendChild(qty);
      var note = dom.el('input', 'note-input');
      note.type = 'text';
      note.value = line.note || '';
      note.placeholder = 'Note';
      note.setAttribute('data-testid', 'order-note-' + line.id);
      note.addEventListener('change', function () {
        tryChange(order, function () { return POS.domain.setNote(order, line.id, note.value); });
      });
      row.appendChild(note);
      var voidBtn = dom.button('btn', 'Void', 'order-void-' + line.id);
      voidBtn.addEventListener('click', function () {
        POS.uiState.voidLineId = line.id;
        POS.uiState.voidReason = REASONS[0];
        dom.redraw();
      });
      row.appendChild(voidBtn);
    }
    return row;
  }

  function voidDialog(order) {
    var dom = POS.dom;
    var box = dom.el('div', 'card void-dialog');
    box.setAttribute('data-testid', 'void-dialog');
    box.appendChild(dom.el('h3', null, 'Void reason'));
    REASONS.forEach(function (reason) {
      var choice = dom.button('btn' + (POS.uiState.voidReason === reason ? ' is-active' : ''), reason, 'void-reason-' + reason.toLowerCase().replace(/\s+/g, '-'));
      choice.addEventListener('click', function () {
        POS.uiState.voidReason = reason;
        dom.redraw();
      });
      box.appendChild(choice);
    });
    var custom = dom.el('input', 'note-input');
    custom.type = 'text';
    custom.placeholder = 'Or type a reason';
    custom.setAttribute('data-testid', 'void-custom');
    box.appendChild(custom);
    var confirm = dom.button('btn btn-primary', 'Void item', 'void-confirm');
    confirm.addEventListener('click', function () {
      var reason = custom.value.trim() || POS.uiState.voidReason || '';
      var lineId = POS.uiState.voidLineId;
      POS.uiState.voidLineId = '';
      tryChange(order, function () { return POS.domain.voidLine(order, lineId, reason, POS.clock.now()); });
    });
    var cancel = dom.button('btn', 'Cancel', 'void-cancel');
    cancel.addEventListener('click', function () {
      POS.uiState.voidLineId = '';
      dom.redraw();
    });
    box.appendChild(confirm);
    box.appendChild(cancel);
    return box;
  }

  function preview(order) {
    var dom = POS.dom;
    var totals = dom.totalsFor(order);
    var box = dom.el('div', 'bill-preview');
    box.appendChild(row('Subtotal', totals.subtotalSen));
    box.appendChild(row('Service charge', totals.serviceChargeSen));
    if (POS.store.current().settings.sst.enabled) box.appendChild(row('SST', totals.sstSen));
    box.appendChild(row('Rounding', totals.roundingSen, true));
    var grand = dom.el('p', 'running-total');
    grand.setAttribute('data-testid', 'order-running-total');
    grand.textContent = POS.money.formatRM(totals.grandTotalSen);
    box.appendChild(grand);
    return box;
  }

  function row(label, sen, signed) {
    var line = POS.dom.el('div', 'preview-row');
    line.appendChild(POS.dom.el('span', null, label));
    line.appendChild(POS.dom.el('span', null, signed ? POS.money.formatSigned(sen) : POS.money.formatRM(sen)));
    return line;
  }

  function tryChange(order, fn) {
    try {
      POS.dom.save(fn());
    } catch (err) {
      POS.dom.showMessage(err.message);
    }
  }

  POS.ui.order = draw;
})();
