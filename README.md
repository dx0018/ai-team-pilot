# Restaurant Mini POS

## What this is

Restaurant Mini POS for Malaysia. This is the Phase 1 prototype. It runs offline, in a single tab. A second tab shows "already open in another tab" and does not open the register.

## How to run

Double-click `index.html` in Chrome or Edge. There is no server and no build.

Data stays in that browser's local storage (IndexedDB).

## How to run the tests

Node.js 20 or newer. Install the dependencies, then install Chrome and Edge as two separate steps and check each one:

```bash
npm ci
npx playwright install chrome
node tools/check-browsers.js chrome
npx playwright install msedge
node tools/check-browsers.js msedge
```

`npm run check:browsers` checks both channels after those installs. Do not combine the two installs into one `npx playwright install` command.

```bash
npm test
node --test tests/e2e/smoke.test.js
node tools/mts.js
node --test tests/e2e/mts.ui.test.js
```

`npm test` runs the unit tests and the browser tests, including the smoke test and the MTS UI checks. `node tools/mts.js` prints the 12 URS calculation cases. The smoke test and `tests/e2e/mts.ui.test.js` each launch headless `chrome` and `msedge`. Set `POS_BROWSERS` to run one channel:

```bash
POS_BROWSERS=chrome node --test tests/e2e/smoke.test.js
POS_BROWSERS=msedge node --test tests/e2e/mts.ui.test.js
```

`edge` is accepted as an alias of `msedge`.
