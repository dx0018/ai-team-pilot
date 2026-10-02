(function () {
  var POS = window.POS = window.POS || {};
  var METHODS = ['Cash', 'Card', 'DuitNow QR'];

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
      }).format(date);
    } catch (err) {
      return iso || '';
    }
  }

  function figure(parent, label, text, testId) {
    var row = POS.dom.el('div', 'preview-row');
    row.appendChild(POS.dom.el('span', null, label));
    var value = POS.dom.el('span', null, text);
    value.setAttribute('data-testid', testId);
    row.appendChild(value);
    parent.appendChild(row);
  }

  function paint(slot, report) {
    var dom = POS.dom;
    figure(slot, 'Bills', String(report.billCount), 'eod-bill-count');
    figure(slot, 'Gross sales', POS.money.formatRM(report.grossSen), 'eod-gross');
    figure(slot, 'Discount', POS.money.formatRM(report.discountSen), 'eod-discount');
    figure(slot, 'Service charge', POS.money.formatRM(report.serviceChargeSen), 'eod-service-charge');
    figure(slot, 'SST', POS.money.formatRM(report.sstSen), 'eod-sst');
    figure(slot, 'Rounding', POS.money.formatSigned(report.roundingSen), 'eod-rounding');
    var net = dom.el('p', 'grand-total', POS.money.formatRM(report.netSen));
    net.setAttribute('data-testid', 'eod-net');
    slot.appendChild(net);

    slot.appendChild(dom.el('h2', null, 'By payment method'));
    var methods = METHODS.slice();
    Object.keys(report.byMethod).forEach(function (name) {
      if (methods.indexOf(name) === -1) methods.push(name);
    });
    methods.forEach(function (name) {
      var bucket = report.byMethod[name] || { billCount: 0, netSen: 0 };
      var slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      figure(slot, name + ' (' + bucket.billCount + ')', POS.money.formatRM(bucket.netSen), 'eod-method-' + slug);
    });

    slot.appendChild(dom.el('h2', null, 'By order type'));
    figure(slot, 'Dine-in (' + report.byType.dine_in.billCount + ')', POS.money.formatRM(report.byType.dine_in.netSen), 'eod-type-dine-in');
    var takeaway = report.byType.takeaway || { billCount: 0, netSen: 0 };
    figure(slot, 'Takeaway (' + takeaway.billCount + ')', POS.money.formatRM(takeaway.netSen), 'eod-type-takeaway');

    slot.appendChild(dom.el('h2', null, 'Voided items'));
    var voids = dom.el('div');
    voids.setAttribute('data-testid', 'eod-voids');
    if (!report.voidedItems.length) voids.appendChild(dom.el('p', null, 'None'));
    report.voidedItems.forEach(function (item) {
      var where = item.billNo || item.takeawayNo || item.tableId || item.orderId;
      var row = dom.el('p', null, formatWhen(item.at) + ' · ' + where + ' · ' + item.name + ' · ' + POS.money.formatRM(item.amountSen) + ' · ' + item.reason);
      voids.appendChild(row);
    });
    slot.appendChild(voids);

    slot.appendChild(dom.el('h2', null, 'Voided bills'));
    var bills = dom.el('p', null, report.voidedBills.length ? '' : 'None');
    bills.setAttribute('data-testid', 'eod-voided-bills');
    if (report.voidedBills.length) {
      bills.textContent = report.voidedBills.map(function (bill) { return bill.billNo; }).join(', ');
    }
    slot.appendChild(bills);
  }

  function draw(route, body) {
    var dom = POS.dom;
    var date = route.params[0] || POS.clock.businessDate(POS.clock.now());
    body.appendChild(dom.el('h1', null, 'End of day'));
    var field = dom.el('label', 'field no-print');
    field.appendChild(dom.el('span', null, 'Date'));
    var input = dom.el('input', 'note-input');
    input.type = 'date';
    input.value = date;
    input.setAttribute('data-testid', 'eod-date');
    input.addEventListener('change', function () {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.value)) return;
      POS.navigate('#/eod?date=' + input.value);
    });
    field.appendChild(input);
    body.appendChild(field);

    var slot = dom.el('div', 'card eod-report');
    slot.setAttribute('data-testid', 'eod-report');
    slot.appendChild(dom.el('p', null, 'Loading…'));
    body.appendChild(slot);
    var print = dom.button('btn no-print', 'Print', 'eod-print');
    print.addEventListener('click', function () { window.print(); });
    body.appendChild(print);

    Promise.all([
      POS.store.billsByDate(date),
      POS.store.ordersWithVoidsOn(date)
    ]).then(function (rows) {
      if (!slot.isConnected) return;
      var report = POS.report.summariseDay(date, rows[0] || [], rows[1] || []);
      slot.textContent = '';
      paint(slot, report);
    }, function (err) {
      if (!slot.isConnected) return;
      slot.textContent = '';
      slot.appendChild(dom.el('p', 'blocked-msg', err && err.message ? err.message : 'Could not load the day'));
    });
  }

  POS.ui.eod = draw;
})();
