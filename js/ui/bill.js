(function () {
  var POS = window.POS = window.POS || {};

  function ensureBill(order, body) {
    if (!order || order.state !== 'ordering') return false;
    if (POS.uiState.openingBill === order.id) {
      body.appendChild(POS.dom.el('p', null, 'Opening the bill…'));
      return true;
    }
    try {
      var opened = POS.domain.openBill(order);
      POS.uiState.openingBill = order.id;
      body.appendChild(POS.dom.el('p', null, 'Opening the bill…'));
      POS.dom.save(opened).then(function () {
        POS.uiState.openingBill = '';
      }, function () {
        POS.uiState.openingBill = '';
      });
    } catch (err) {
      var blocked = POS.dom.el('p', 'blocked-msg', err.message);
      blocked.setAttribute('data-testid', 'blocked-msg-r10');
      body.appendChild(blocked);
    }
    return true;
  }

  function draw(route, body) {
    var dom = POS.dom;
    var order = dom.findOrder(route.params[0]);
    body.appendChild(dom.el('h1', null, 'Bill'));
    var note = dom.consumeMessage('blocked-msg-r10');
    if (note) body.appendChild(note);
    if (!order) {
      body.appendChild(dom.el('p', null, 'This order is no longer open.'));
      return;
    }
    if (order.state === 'paid' && order.bill) {
      var receipt = dom.button('btn btn-primary', 'Receipt', 'bill-receipt');
      receipt.addEventListener('click', function () { POS.navigate('#/receipt/' + order.id); });
      body.appendChild(receipt);
      return;
    }
    if (ensureBill(order, body)) return;

    var head = dom.el('div', 'screen-head');
    head.appendChild(dom.el('h2', null, dom.tableName(order.tableId)));
    var back = dom.button('btn no-print', 'Order', 'bill-back');
    back.addEventListener('click', function () { POS.navigate('#/order/' + order.id); });
    head.appendChild(back);
    body.appendChild(head);

    order.lines.forEach(function (line) {
      var row = dom.el('div', 'line' + (line.void ? ' is-void' : ''));
      row.setAttribute('data-testid', 'bill-line-' + line.id);
      var main = dom.el('div', 'line-main');
      main.appendChild(dom.el('span', 'line-name', line.qty + ' × ' + line.name));
      main.appendChild(dom.el('span', null, POS.money.formatRM(line.qty * line.unitPriceSen)));
      row.appendChild(main);
      if (line.note) row.appendChild(dom.el('p', 'muted', line.note));
      if (line.void) row.appendChild(dom.el('p', 'muted', 'Void: ' + line.void.reason));
      body.appendChild(row);
    });

    body.appendChild(dom.totalsBlock(order, 'bill-grand-total'));
    var preview = dom.splitPreview(order);
    if (preview) body.appendChild(dom.splitAmounts(preview));

    var actions = dom.el('div', 'action-row no-print');
    var split = dom.button('btn', 'Split', 'bill-split');
    split.addEventListener('click', function () { POS.navigate('#/split/' + order.id); });
    var pay = dom.button('btn btn-primary', 'Pay', 'bill-pay');
    pay.addEventListener('click', function () {
      var gate = POS.domain.canPay(order);
      if (!gate.ok) {
        dom.showMessage(gate.reason);
        return;
      }
      POS.navigate('#/pay/' + order.id);
    });
    actions.appendChild(split);
    actions.appendChild(pay);
    body.appendChild(actions);
  }

  POS.ui.bill = draw;
})();
