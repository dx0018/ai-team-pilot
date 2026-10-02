(function () {
  var POS = window.POS = window.POS || {};

  function formatWhen(iso) {
    var date = new Date(iso);
    if (isNaN(date.getTime())) return iso || '';
    try {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kuala_Lumpur',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(date) + ' MYT';
    } catch (err) {
      return iso;
    }
  }

  function line(parent, label, value) {
    var row = POS.dom.el('div', 'receipt-line');
    row.appendChild(POS.dom.el('span', null, label));
    row.appendChild(POS.dom.el('span', null, value));
    parent.appendChild(row);
  }

  function paint(body, order) {
    var dom = POS.dom;
    var bill = order && order.bill;
    body.appendChild(dom.el('h1', 'no-print', 'Receipt'));
    if (!bill) {
      body.appendChild(dom.el('p', null, 'This order has no receipt yet.'));
      return;
    }
    var used = bill.settingsUsed || {};
    var restaurant = used.restaurant || {};
    var sheet = dom.el('article', 'card receipt-sheet');
    sheet.setAttribute('data-testid', 'receipt-sheet');
    var header = dom.el('header', 'receipt-header');
    if (restaurant.name) header.appendChild(dom.el('p', 'receipt-name', restaurant.name));
    if (restaurant.ssmNo) header.appendChild(dom.el('p', null, 'SSM ' + restaurant.ssmNo));
    if (restaurant.address) header.appendChild(dom.el('p', null, restaurant.address));
    if (restaurant.phone) header.appendChild(dom.el('p', null, restaurant.phone));
    if (used.sst && used.sst.enabled && restaurant.sstRegNo) {
      header.appendChild(dom.el('p', null, 'SST reg. ' + restaurant.sstRegNo));
    }
    header.appendChild(dom.el('p', 'receipt-name', 'Receipt'));
    sheet.appendChild(header);

    var meta = dom.el('div', 'receipt-meta');
    var billNo = dom.el('p', null, bill.billNo);
    billNo.setAttribute('data-testid', 'receipt-bill-no');
    meta.appendChild(billNo);
    meta.appendChild(dom.el('p', null, formatWhen(bill.paidAt)));
    var place = order.type === 'takeaway'
      ? (order.takeawayNo || 'Takeaway')
      : dom.tableName(order.tableId);
    meta.appendChild(dom.el('p', null, place));
    sheet.appendChild(meta);

    (order.lines || []).forEach(function (item) {
      if (item.void) return;
      var row = dom.el('div', 'receipt-line');
      row.setAttribute('data-testid', 'receipt-line-' + item.id);
      var name = dom.el('span', null, item.qty + ' × ' + item.name);
      row.appendChild(name);
      row.appendChild(dom.el('span', null, POS.money.formatRM(item.qty * item.unitPriceSen)));
      sheet.appendChild(row);
      var unit = dom.el('p', 'muted', POS.money.formatRM(item.unitPriceSen) + ' each');
      sheet.appendChild(unit);
      if (item.note) sheet.appendChild(dom.el('p', 'muted', item.note));
    });

    var totals = bill.totals || {};
    line(sheet, 'Subtotal', POS.money.formatRM(totals.subtotalSen || 0));
    line(sheet, 'Discount', POS.money.formatRM(totals.discountSen || 0));
    line(sheet, 'Service charge', POS.money.formatRM(totals.serviceChargeSen || 0));
    if (used.sst && used.sst.enabled) line(sheet, 'SST', POS.money.formatRM(totals.sstSen || 0));
    line(sheet, 'Rounding', POS.money.formatSigned(totals.roundingSen || 0));
    var grand = dom.el('p', 'grand-total', POS.money.formatRM(totals.grandTotalSen || 0));
    grand.setAttribute('data-testid', 'receipt-grand-total');
    sheet.appendChild(grand);

    if (bill.split && bill.split.subBills) {
      bill.split.subBills.forEach(function (sub, index) {
        var row = dom.el('div', 'receipt-line');
        row.appendChild(dom.el('span', null, 'Sub-bill ' + sub.label));
        var amount = dom.el('span', null, POS.money.formatRM(sub.amountSen));
        amount.setAttribute('data-testid', 'receipt-split-' + (index + 1));
        row.appendChild(amount);
        if (index === 0) {
          var mark = dom.el('span', 'remainder');
          mark.setAttribute('data-testid', 'split-remainder-marker');
          mark.textContent = bill.split.remainderSen > 0 ? 'includes remainder ' + POS.money.formatRM(bill.split.remainderSen) : '';
          row.appendChild(mark);
        }
        sheet.appendChild(row);
      });
    }

    var payment = bill.payment || {};
    line(sheet, 'Payment', payment.method || '');
    if (payment.method === 'Cash') {
      line(sheet, 'Cash received', POS.money.formatRM(payment.cashReceivedSen || 0));
      var change = dom.el('p', null, 'Change ' + POS.money.formatRM(payment.changeSen || 0));
      change.setAttribute('data-testid', 'receipt-change');
      sheet.appendChild(change);
    }
    var footer = POS.store.current().settings.receiptFooter || '';
    if (footer) {
      var foot = dom.el('p', 'receipt-footer', footer);
      foot.setAttribute('data-testid', 'receipt-footer');
      sheet.appendChild(foot);
    }
    body.appendChild(sheet);

    var actions = dom.el('div', 'action-row no-print');
    var print = dom.button('btn btn-primary', 'Print', 'receipt-print');
    print.addEventListener('click', function () { window.print(); });
    var tables = dom.button('btn', 'Tables', 'receipt-tables');
    tables.addEventListener('click', function () { POS.navigate('#/tables'); });
    actions.appendChild(print);
    actions.appendChild(tables);
    body.appendChild(actions);
  }

  function draw(route, body) {
    var id = route.params[0];
    var cached = POS.dom.findOrder(id);
    var loaded = POS.uiState.receiptOrder;
    var order = cached && cached.bill ? cached : (loaded && loaded.id === id ? loaded : null);
    if (order) {
      paint(body, order);
      return;
    }
    body.appendChild(POS.dom.el('p', null, 'Loading receipt…'));
    POS.store.getOrder(id).then(function (found) {
      POS.uiState.receiptOrder = found || { id: id, bill: null };
      var routeNow = POS.router.match(location.hash || '#/tables');
      if (routeNow.name === 'receipt' && routeNow.params[0] === id) POS.dom.redraw();
    });
  }

  POS.ui.receipt = draw;
})();
