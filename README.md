# Restaurant Mini POS

## Run

Double-click `index.html` to open the app in Chrome or Edge. That is the primary way to run it. Nothing needs to be installed for the app itself.

A static server is optional. From the repo root:

```bash
python3 -m http.server 8080
```

Then open the site that server prints.

Do not mix the two. `file://` and a static server are different browser origins, so each has its own data (RS-03). Use one method and stay with it. The intended method is double-clicking `index.html`.

Orders, the menu and settings are stored in this browser profile (IndexedDB). Clearing site data or the browser profile deletes them. This version has no backup.

On `file://`, Chrome and Edge treat local files as one origin, so another local HTML file opened in the same profile can read this data (RS-07). Use one counter device.

A second tab shows "already open in another tab" and does not open the register. Close the first tab to continue.

## Tests

Node.js 20 or newer.

```bash
npm ci
npm test
```

`npm test` runs `tests/unit/*.test.js` and `tests/e2e/*.test.js` on Node 20 and Node 22. Browser checks launch headless Chrome through Playwright (`node tests/e2e/t04.store.test.js`, `node tests/e2e/t06.theme.test.js`). Playwright is a devDependency only and is not loaded by the app.

## Font subset

The app uses the committed files `fonts/NotoSansSC-subset-400.woff2` and `fonts/NotoSansSC-subset-700.woff2` (SIL OFL, `fonts/OFL.txt`). Regenerating them needs `pyftsubset` from fonttools and the Noto Sans SC Regular and Bold source fonts. The app does not run that tool and does not download fonts.

```bash
tools/subset-font.sh NotoSansSC-Regular.otf NotoSansSC-Bold.otf
```

`tools/subset-text.txt` is Basic Latin, the minus sign U+2212, and the 3,500 Level-1 characters of the Table of General Standard Chinese Characters.
