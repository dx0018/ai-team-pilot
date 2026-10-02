(function () {
  var POS = window.POS = window.POS || {};

  function draw(route, body) {
    var dom = POS.dom;
    body.appendChild(dom.el('h1', null, 'Tables'));
    var grid = dom.el('div', 'table-grid');
    grid.setAttribute('data-testid', 'table-grid');
    var tables = POS.store.current().settings.tables || [];
    tables.forEach(function (table) {
      var order = dom.orderForTable(table.id);
      var status = dom.statusOf(order);
      var wrap = dom.el('div', 'table-wrap');
      var card = dom.el('button', 'card table-card');
      card.type = 'button';
      card.setAttribute('data-testid', 'table-' + table.id);
      card.appendChild(dom.el('span', 'table-name', table.name));
      var badge = dom.el('span', 'status-badge status-' + status.key, status.label);
      badge.setAttribute('data-testid', 'table-status-' + table.id);
      card.appendChild(badge);
      card.addEventListener('click', function () {
        if (status.key === 'paid') return;
        if (order) {
          POS.navigate('#/order/' + order.id);
          return;
        }
        var created = POS.domain.newDineIn(table.id, POS.clock.now());
        POS.store.saveOrder(created).then(function (saved) {
          location.hash = '#/order/' + saved.id;
        });
      });
      wrap.appendChild(card);
      if (status.key === 'paid' && order) {
        var reset = dom.button('btn btn-primary', 'Reset', 'table-reset-' + table.id);
        reset.addEventListener('click', function () {
          try {
            dom.save(POS.domain.closeTable(order));
          } catch (err) {
            dom.showMessage(err.message);
          }
        });
        wrap.appendChild(reset);
      }
      grid.appendChild(wrap);
    });
    body.appendChild(grid);
  }

  POS.ui.tables = draw;
})();
