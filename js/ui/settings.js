(function () {
  var POS = window.POS = window.POS || {};

  function formatRate(bp) {
    var frac = bp % 100;
    var whole = (bp - frac) / 100;
    return String(whole) + '.' + (frac < 10 ? '0' : '') + String(frac);
  }

  function checkbox(testId, label, checked) {
    var field = POS.dom.el('label', 'check-field');
    var input = POS.dom.el('input');
    input.type = 'checkbox';
    input.checked = !!checked;
    input.setAttribute('data-testid', testId);
    field.appendChild(input);
    field.appendChild(POS.dom.el('span', null, label));
    return { field: field, input: input };
  }

  function rateField(testId, label, bp) {
    var field = POS.dom.el('label', 'field');
    field.appendChild(POS.dom.el('span', null, label));
    var input = POS.dom.el('input', 'note-input');
    input.type = 'text';
    input.value = formatRate(bp);
    input.setAttribute('data-testid', testId);
    field.appendChild(input);
    return { field: field, input: input };
  }

  function whole(text) {
    if (!/^[0-9]+$/.test(String(text || '').trim())) return null;
    var n = Number(String(text).trim());
    return Number.isInteger(n) ? n : null;
  }

  function draw(route, body) {
    var dom = POS.dom;
    var settings = POS.store.current().settings;
    body.appendChild(dom.el('h1', null, 'Settings'));
    var note = dom.consumeMessage('settings-message');
    if (note) body.appendChild(note);
    var form = dom.el('form', 'card settings-form');
    form.setAttribute('data-testid', 'settings-form');
    form.addEventListener('submit', function (event) { event.preventDefault(); });

    var countField = dom.el('label', 'field');
    countField.appendChild(dom.el('span', null, 'Number of tables (1–50)'));
    var count = dom.el('input', 'note-input');
    count.type = 'number';
    count.min = '1';
    count.max = '50';
    count.value = String(settings.tables.length);
    count.setAttribute('data-testid', 'settings-table-count');
    countField.appendChild(count);
    form.appendChild(countField);

    form.appendChild(dom.el('h2', null, 'Service charge'));
    var dineIn = checkbox('settings-sc-dine-in', 'Dine-in service charge', settings.serviceCharge.dineIn.enabled);
    var dineRate = rateField('settings-sc-dine-in-rate', 'Dine-in rate %', settings.serviceCharge.dineIn.rateBp);
    var takeaway = checkbox('settings-sc-takeaway', 'Takeaway service charge', settings.serviceCharge.takeaway.enabled);
    var takeRate = rateField('settings-sc-takeaway-rate', 'Takeaway rate %', settings.serviceCharge.takeaway.rateBp);
    form.appendChild(dineIn.field);
    form.appendChild(dineRate.field);
    form.appendChild(takeaway.field);
    form.appendChild(takeRate.field);

    form.appendChild(dom.el('h2', null, 'SST'));
    var sst = checkbox('settings-sst', 'SST', settings.sst.enabled);
    var sstRate = rateField('settings-sst-rate', 'SST rate %', settings.sst.rateBp);
    var includes = checkbox('settings-sst-includes', 'SST includes service charge', settings.sst.includesServiceCharge);
    form.appendChild(sst.field);
    form.appendChild(sstRate.field);
    form.appendChild(includes.field);

    form.appendChild(dom.el('h2', null, 'Rounding'));
    var rounding = checkbox('settings-rounding', 'Round to the nearest 5 sen', settings.rounding.enabled);
    form.appendChild(rounding.field);

    var saveBtn = dom.button('btn btn-primary', 'Save', 'settings-save');
    saveBtn.addEventListener('click', function () { save(settings); });
    form.appendChild(saveBtn);
    body.appendChild(form);

    function save(current) {
      var n = whole(count.value);
      var tables = [];
      var i;
      if (n != null) {
        for (i = 0; i < n; i++) {
          if (current.tables[i]) tables.push({ id: current.tables[i].id, name: current.tables[i].name });
          else tables.push({ id: 't' + (i + 1), name: 'T' + (i + 1) });
        }
      }
      var tableCheck = POS.validate.validateTables(n == null ? [] : tables);
      if (!tableCheck.ok) {
        dom.showMessage(tableCheck.message);
        return;
      }
      var kept = Object.create(null);
      for (i = 0; i < tables.length; i++) kept[tables[i].id] = true;
      for (i = 0; i < current.tables.length; i++) {
        if (kept[current.tables[i].id]) continue;
        if (dom.orderForTable(current.tables[i].id)) {
          dom.showMessage(current.tables[i].name + ' still has an open order');
          return;
        }
      }
      var candidate = {
        serviceCharge: {
          dineIn: { enabled: dineIn.input.checked, rate: dineRate.input.value },
          takeaway: { enabled: takeaway.input.checked, rate: takeRate.input.value }
        },
        sst: { enabled: sst.input.checked, rate: sstRate.input.value, includesServiceCharge: includes.input.checked }
      };
      var rateCheck = POS.validate.validateRates(candidate);
      if (!rateCheck.ok) {
        dom.showMessage(rateCheck.message);
        return;
      }
      var next = JSON.parse(JSON.stringify(current));
      next.tables = tables;
      next.serviceCharge = {
        dineIn: { enabled: dineIn.input.checked, rateBp: POS.money.parseRate(dineRate.input.value).bp },
        takeaway: { enabled: takeaway.input.checked, rateBp: POS.money.parseRate(takeRate.input.value).bp }
      };
      next.sst = {
        enabled: sst.input.checked,
        rateBp: POS.money.parseRate(sstRate.input.value).bp,
        includesServiceCharge: includes.input.checked
      };
      next.rounding = { enabled: rounding.input.checked };
      POS.store.saveSettings(next).then(function () {
        dom.showMessage('Saved');
      });
    }
  }

  POS.ui.settings = draw;
})();
