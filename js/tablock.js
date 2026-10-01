(function () {
  var LOCK_NAME = 'mini-pos-tab';

  function acquire() {
    return new Promise(function (resolve) {
      if (typeof navigator === 'undefined' || !navigator.locks || typeof navigator.locks.request !== 'function') {
        resolve(false);
        return;
      }
      var settled = false;
      navigator.locks.request(LOCK_NAME, { ifAvailable: true }, function (lock) {
        settled = true;
        if (lock === null) {
          resolve(false);
          return;
        }
        resolve(true);
        return new Promise(function () {});
      }).catch(function () {
        if (!settled) resolve(false);
      });
    });
  }

  var api = { acquire: acquire };

  if (typeof module !== 'undefined') module.exports = api;
  else {
    window.POS = window.POS || {};
    window.POS.tablock = api;
  }
})();
