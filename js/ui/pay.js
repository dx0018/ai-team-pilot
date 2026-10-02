(function () {
  var POS = window.POS = window.POS || {};
  var METHODS = [
    ['Cash', 'pay-method-cash'],
    ['Card', 'pay-method-card'],
    ['DuitNow QR', 'pay-method-qr']
  ];

  function draw(route, body) {
    var dom = POS.dom;
    var order = dom.findOrder(route.params[0]);
    body.appendChild(dom.el('h1', null, 'Payment'));
    var note = dom.consumeMessage('blocked-msg-r10');
    if (note) body.appendChild(note);
    if (!order || order.state === 'paid') {
      body.appendChild(dom.el('p', null, 'This bill is not waiting for payment.'));
      if (order && order.bill) {
        var receipt = dom.button('btn btn-primary', 'Receipt', 'pay-receipt');
        receipt.addEventListener('click', function () { POS.navigate('#/receipt/' + order.id); });
        body.appendChild(receipt);
      }
      return;
    }
    var gate = POS.domain.canPay(order);
    if (!gate.ok) {
      var blocked = dom.el('p', 'blocked-msg', gate.reason);
      blocked.setAttribute('data-testid', 'blocked-msg-r10');
      body.appendChild(blocked);
      var backBlocked = dom.button('btn', 'Split', 'pay-back');
      backBlocked.addEventListener('click', function () { POS.navigate('#/split/' + order.id); });
      body.appendChild(backBlocked);
      return;
    }

    body.appendChild(dom.totalsBlock(order, 'bill-grand-total'));
    var due = dom.totalsFor(order).grandTotalSen;
    var back = dom.button('btn no-print', 'Bill', 'pay-back');
    back.addEventListener('click', function () { POS.navigate('#/bill/' + order.id); });
    body.appendChild(back);

    var methods = dom.el('div', 'action-row');
    METHODS.forEach(function (item) {
      var button = dom.button('btn' + (POS.uiState.payMethod === item[0] ? ' is-active' : ''), item[0], item[1]);
      button.addEventListener('click', function () {
        POS.uiState.payMethod = item[0];
        dom.redraw();
      });
      methods.appendChild(button);
    });
    body.appendChild(methods);

    var change = dom.el('p', null, '');
    change.setAttribute('data-testid', 'pay-change');
    if (POS.uiState.payMethod === 'Cash') {
      var field = dom.el('label', 'field');
      field.appendChild(dom.el('span', null, 'Cash received'));
      var input = dom.el('input', 'note-input');
      input.type = 'text';
      input.inputMode = 'decimal';
      input.value = POS.uiState.cashDraft || '';
      input.setAttribute('data-testid', 'pay-cash-received');
      input.placeholder = '0.00';
      field.appendChild(input);
      body.appendChild(field);
      body.appendChild(change);
      function showChange() {
        POS.uiState.cashDraft = input.value;
        var parsed = POS.money.parseMoney(input.value);
        if (!parsed.ok) {
          change.textContent = '';
          return;
        }
        var result = POS.calc.cashChange(due, parsed.sen);
        change.textContent = result.ok ? 'Change ' + POS.money.formatRM(result.changeSen) : result.reason;
      }
      input.addEventListener('input', showChange);
      showChange();
    }

    var confirm = dom.button('btn btn-primary', 'Confirm payment', 'pay-confirm');
    confirm.addEventListener('click', function () {
      if (confirm.disabled) return;
      var method = POS.uiState.payMethod;
      if (!method) {
        dom.showMessage('Choose a payment method');
        return;
      }
      var payment = { method: method };
      if (method === 'Cash') {
        var parsed = POS.money.parseMoney(POS.uiState.cashDraft || '');
        if (!parsed.ok) {
          dom.showMessage('Enter the cash received');
          return;
        }
        var result = POS.calc.cashChange(due, parsed.sen);
        if (!result.ok) {
          dom.showMessage(result.reason);
          return;
        }
        payment.cashReceivedSen = parsed.sen;
      }
      confirm.disabled = true;
      POS.pay(order.id, payment).then(function () {
        POS.uiState.payMethod = '';
        POS.uiState.cashDraft = '';
        location.hash = '#/receipt/' + order.id;
      }, function (err) {
        confirm.disabled = false;
        dom.showMessage(err && err.message ? err.message : 'Payment failed');
      });
    });
    body.appendChild(confirm);
  }

  POS.ui.pay = draw;
})();
