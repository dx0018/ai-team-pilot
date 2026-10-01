(function () {
  var POS = window.POS = window.POS || {};

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  POS.render = function (route, root) {
    root.textContent = '';
    var screen = el('section', 'screen');
    screen.setAttribute('data-screen', route.name);
    if (route.name === 'tables') {
      screen.appendChild(el('h1', null, 'Tables'));
      var grid = el('div', 'table-grid');
      grid.setAttribute('data-testid', 'table-grid');
      screen.appendChild(grid);
    } else {
      screen.appendChild(el('h1', null, route.name));
    }
    root.appendChild(screen);
  };

  POS.router.start();
})();
