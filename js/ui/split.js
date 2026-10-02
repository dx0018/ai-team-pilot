(function () {
  var POS = window.POS = window.POS || {};

  function whole(text) {
    if (!/^[0-9]+$/.test(String(text || '').trim())) return null;
    var n = Number(String(text).trim());
    if (!Number.isInteger(n)) return null;
    return n;
  }

  function draw(route, body) {
    var dom = POS.dom;
    var order = dom.findOrder(route.params[0]);
    body.appendChild(dom.el('h1', null, 'Split bill'));
    var note = dom.consumeMessage('blocked-msg-r10');
    if (note) body.appendChild(note);
    if (!order || order.state === 'paid') {
      body.appendChild(dom.el('p', null, 'This bill is not open for a split.'));
      var backMissing = dom.button('btn', 'Bill', 'split-back');
      backMissing.addEventListener('click', function () {
        POS.navigate(order ? '#/bill/' + order.id : '#/tables');
      });
      body.appendChild(backMissing);
      return;
    }

    var back = dom.button('btn no-print', 'Bill', 'split-back');
    back.addEventListener('click', function () { POS.navigate('#/bill/' + order.id); });
    body.appendChild(back);

    var mode = order.split && order.split.mode ? order.split.mode : 'equal';
    var modes = dom.el('div', 'action-row');
    var equalBtn = dom.button('btn' + (mode === 'equal' ? ' is-active' : ''), 'Split equally', 'split-mode-equal');
    var itemBtn = dom.button('btn' + (mode === 'item' ? ' is-active' : ''), 'Split by item', 'split-mode-item');
    equalBtn.addEventListener('click', function () {
      if (order.split && order.split.mode === 'equal') return;
      applyCount(order, 'equal', currentCount(order, 'equal'));
    });
    itemBtn.addEventListener('click', function () {
      if (order.split && order.split.mode === 'item') return;
      applyCount(order, 'item', currentCount(order, 'item'));
    });
    modes.appendChild(equalBtn);
    modes.appendChild(itemBtn);
    body.appendChild(modes);

    var count = currentCount(order, mode);
    var field = dom.el('label', 'field');
    field.appendChild(dom.el('span', null, 'Sub-bills (2–20)'));
    var input = dom.el('input', 'note-input');
    input.type = 'number';
    input.min = '2';
    input.max = '20';
    input.value = String(count);
    input.setAttribute('data-testid', 'split-count');
    field.appendChild(input);
    body.appendChild(field);
    var apply = dom.button('btn', 'Apply count', 'split-apply');
    apply.addEventListener('click', function () {
      var n = whole(input.value);
      var check = POS.validate.validateSplitN(n);
      if (!check.ok) {
        dom.showMessage(check.message);
        return;
      }
      if (order.split && order.split.mode === mode) {
        var same = mode === 'equal' ? order.split.n === n : order.split.count === n;
        if (same) return;
      }
      applyCount(order, mode, n);
    });
    body.appendChild(apply);

    if (mode === 'item' && order.split && order.split.mode === 'item') body.appendChild(assignments(order));
    var preview = dom.splitPreview(order);
    if (preview) body.appendChild(dom.splitAmounts(preview));

    var pay = dom.button('btn btn-primary', 'Pay', 'split-pay');
    pay.addEventListener('click', function () {
      var gate = POS.domain.canPay(order);
      if (!gate.ok) {
        dom.showMessage(gate.reason);
        return;
      }
      POS.navigate('#/pay/' + order.id);
    });
    body.appendChild(pay);
  }

  function currentCount(order, mode) {
    if (order.split && order.split.mode === mode) {
      return mode === 'equal' ? order.split.n : order.split.count;
    }
    return 2;
  }

  function applyCount(order, mode, n) {
    var check = POS.validate.validateSplitN(n);
    if (!check.ok) {
      POS.dom.showMessage(check.message);
      return;
    }
    var next = mode === 'equal'
      ? POS.domain.setSplit(order, { mode: 'equal', n: n })
      : POS.domain.setSplit(order, { mode: 'item', count: n });
    POS.dom.save(next);
  }

  function assignments(order) {
    var dom = POS.dom;
    var box = dom.el('div', 'assign-list');
    var count = order.split.count;
    order.lines.forEach(function (line) {
      var row = dom.el('div', 'line' + (line.void ? ' is-void' : ''));
      row.appendChild(dom.el('span', 'line-name', line.name));
      if (line.void) {
        row.appendChild(dom.el('span', 'muted', 'Voided'));
        box.appendChild(row);
        return;
      }
      var choices = dom.el('div', 'qty-row');
      var assigned = order.split.assign ? order.split.assign[line.id] : null;
      var i;
      for (i = 0; i < count; i++) {
        (function (index) {
          var choice = dom.button(
            'btn' + (assigned === index ? ' is-active' : ''),
            '/' + (index + 1),
            'split-assign-' + line.id + '-' + index
          );
          choice.addEventListener('click', function () {
            try {
              dom.save(POS.domain.assignLine(order, line.id, index));
            } catch (err) {
              dom.showMessage(err.message);
            }
          });
          choices.appendChild(choice);
        })(i);
      }
      row.appendChild(choices);
      box.appendChild(row);
    });
    return box;
  }

  POS.ui.split = draw;
})();
