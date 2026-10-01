# AC-64: code review that the calculation module is separate from the UI

- Reviewer: QA. Method: **code review**, backed by the mechanical greps below. Repo `dev` at `594172d1e28cabbc00a1a97bb88388daf1550eaf`; `js/calc.js` last changed in `ad6dec2`.
- AC-64 (NF-05) says the calculation module (SC, SST, rounding, discount, split) is separate from the UI. The unit-test half of AC-64 is executed evidence, in `docs/qa/T-02-T-03/`.

## 1. UI and browser APIs referenced in js/calc.js
```
$ grep -nE "document|window|localStorage|indexedDB|navigator|addEventListener|innerHTML|querySelector|getElementById|alert\(|console\.|fetch\(|XMLHttpRequest|require\(|import " js/calc.js
154:    window.POS = window.POS || {};
155:    window.POS.calc = api;
```
Finding: the only hits are lines in the export block, which attaches the API to `window.POS.calc` when there is no CommonJS `module`. Nothing reads or writes the DOM, storage, the network or other modules.

## 2. Export block
```
143:  var api = {
144:    halfUpDiv: halfUpDiv,
145:    roundTo5Sen: roundTo5Sen,
146:    computeBill: computeBill,
147:    splitEqual: splitEqual,
148:    splitByItem: splitByItem,
149:    cashChange: cashChange
150:  };
151:
152:  if (typeof module !== 'undefined') module.exports = api;
153:  else {
154:    window.POS = window.POS || {};
155:    window.POS.calc = api;
156:  }
157:})();
```

## 3. The module runs headless in Node with no DOM
```
$ node -e "const c=require(\"./js/calc.js\");console.log(Object.keys(c).join(\",\"), typeof globalThis.document)"
halfUpDiv,roundTo5Sen,computeBill,splitEqual,splitByItem,cashChange undefined
```
Finding: it loads and exports `computeBill`, `splitEqual`, `splitByItem` and `cashChange` with `document` undefined. This is also how both test suites run it.

## 4. Callers: the UI uses calc and calc does not use the UI
```
$ grep -rn "POS.calc\|calc\.js" js/ index.html --include=*.js --include=*.html
js/calc.js:155:    window.POS.calc = api;
index.html:16:  <script src="js/calc.js"></script>
```

## Verdict
AC-64's "separate from the UI" clause: **Pass (code review)**. Combined with the executed unit-test half, AC-64 is **Pass at function level**.
