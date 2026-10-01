# Restaurant Mini POS

## Run

Double-click `index.html` to open the app in Chrome or Edge. That is the primary way to run it. Nothing needs to be installed for the app itself.

A static server is optional. From the repo root:

```bash
python3 -m http.server 8080
```

Then open the site that server prints.

Do not mix the two. `file://` and a static server are different browser origins, so each has its own data (RS-03). Use one method and stay with it. The intended method is double-clicking `index.html`.

## Tests

Node.js 20 or newer.

```bash
npm ci
npm test
```

`npm test` runs `node --test tests/unit/`. Playwright is a devDependency only (`npm run spike:t01`) and is not loaded by the app.
