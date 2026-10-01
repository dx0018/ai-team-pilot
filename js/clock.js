(function () {
  var override = null;

  function now() {
    if (override) return override;
    return new Date().toISOString();
  }

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function businessDate(date) {
    var value = date == null ? now() : date;
    var parsed = new Date(value);
    if (isNaN(parsed.getTime())) throw new RangeError('Invalid date');
    return parsed.getFullYear() + '-' + pad(parsed.getMonth() + 1) + '-' + pad(parsed.getDate());
  }

  function setOverride(isoOrNull) {
    override = isoOrNull || null;
  }

  var api = {
    now: now,
    businessDate: businessDate,
    setOverride: setOverride
  };

  if (typeof module !== 'undefined') module.exports = api;
  else {
    window.POS = window.POS || {};
    window.POS.clock = api;
  }
})();
