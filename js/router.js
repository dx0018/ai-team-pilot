(function () {
  var POS = window.POS = window.POS || {};
  var rules = [
    ['tables', /^#\/tables$/],
    ['order', /^#\/order\/([^/]+)$/],
    ['bill', /^#\/bill\/([^/]+)$/],
    ['split', /^#\/split\/([^/]+)$/],
    ['pay', /^#\/pay\/([^/]+)$/],
    ['receipt', /^#\/receipt\/([^/]+)$/],
    ['eod', /^#\/eod(?:\?date=(\d{4}-\d{2}-\d{2}))?$/],
    ['settings', /^#\/settings$/]
  ];

  function match(hash) {
    for (var i = 0; i < rules.length; i++) {
      var found = hash.match(rules[i][1]);
      if (found) return { name: rules[i][0], params: found.slice(1).filter(Boolean) };
    }
    return { name: 'tables', params: [] };
  }

  function show() {
    var route = match(location.hash || '#/tables');
    var name = route.name;
    performance.mark('route:start:' + name);
    POS.render(route, document.getElementById('app'));
    performance.mark('route:rendered:' + name);
    performance.measure('route:' + name, 'route:start:' + name, 'route:rendered:' + name);
  }

  function start() {
    window.addEventListener('hashchange', show);
    if (!location.hash) location.hash = '#/tables';
    else show();
  }

  POS.router = { start: start, match: match };
})();
