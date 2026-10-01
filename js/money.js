(function () {
  function fail(error) {
    return { ok: false, error: error };
  }

  function digitsToInt(text) {
    var n = 0;
    for (var i = 0; i < text.length; i++) n = n * 10 + (text.charCodeAt(i) - 48);
    return n;
  }

  function parseMoney(text) {
    if (typeof text !== 'string') return fail('non-numeric');
    var s = text.trim();
    if (s === '') return fail('non-numeric');
    if (s.charAt(0) === '-') return fail('negative');
    var whole = '';
    var frac = '';
    var dot = s.indexOf('.');
    if (dot === -1) {
      whole = s;
    } else if (s.indexOf('.', dot + 1) !== -1) {
      return fail('non-numeric');
    } else {
      whole = s.slice(0, dot);
      frac = s.slice(dot + 1);
    }
    if (whole === '') whole = '0';
    if (!/^[0-9]+$/.test(whole) || (frac !== '' && !/^[0-9]+$/.test(frac))) return fail('non-numeric');
    if (frac.length > 2) return fail('decimals');
    while (frac.length < 2) frac += '0';
    var sen = digitsToInt(whole) * 100 + digitsToInt(frac);
    if (!Number.isSafeInteger(sen)) return fail('non-numeric');
    return { ok: true, sen: sen };
  }

  function twoDigits(abs) {
    var frac = abs % 100;
    var ringgit = (abs - frac) / 100;
    return String(ringgit) + '.' + (frac < 10 ? '0' : '') + String(frac);
  }

  function formatRM(sen) {
    var abs = sen < 0 ? -sen : sen;
    return 'RM ' + (sen < 0 ? '-' : '') + twoDigits(abs);
  }

  function formatSigned(sen) {
    if (sen === 0) return '0.00';
    return (sen > 0 ? '+' : '\u2212') + twoDigits(sen < 0 ? -sen : sen);
  }

  function parseRate(text) {
    if (typeof text !== 'string') return fail('non-numeric');
    var s = text.trim();
    if (s === '') return fail('non-numeric');
    if (s.charAt(0) === '-') return fail('negative');
    var whole = '';
    var frac = '';
    var dot = s.indexOf('.');
    if (dot === -1) {
      whole = s;
    } else if (s.indexOf('.', dot + 1) !== -1) {
      return fail('non-numeric');
    } else {
      whole = s.slice(0, dot);
      frac = s.slice(dot + 1);
    }
    if (whole === '' || !/^[0-9]+$/.test(whole) || (frac !== '' && !/^[0-9]+$/.test(frac))) {
      return fail('non-numeric');
    }
    if (frac.length > 2) return fail('decimals');
    while (frac.length < 2) frac += '0';
    var bp = digitsToInt(whole) * 100 + digitsToInt(frac);
    if (!Number.isSafeInteger(bp)) return fail('non-numeric');
    if (bp > 10000) return fail('range');
    return { ok: true, bp: bp };
  }

  var api = {
    parseMoney: parseMoney,
    formatRM: formatRM,
    formatSigned: formatSigned,
    parseRate: parseRate
  };

  if (typeof module !== 'undefined') module.exports = api;
  else {
    window.POS = window.POS || {};
    window.POS.money = api;
  }
})();
