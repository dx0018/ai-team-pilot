# T-01 spike: QA execution results

Run by QA on 2026-10-01 at about 20:04 MYT (UTC+8), on a Linux box. Repo `dx0018/ai-team-pilot`, branch `dev`, HEAD `3024a163d895728a17b6fb65e600f0832ce76328` (contains the T-01 spike commit `269a9512cdc836a61b2bdb29b586d7c9d3556898`; checked with `git merge-base --is-ancestor`). No repo file was changed: `git status --porcelain` was empty after the run (see `env.txt`). `npm test` was **not** run (held for an IE fix).

## Environment

| Item | Value |
|---|---|
| OS | Debian GNU/Linux 13 (trixie), `Linux 6.12.94+ x86_64` |
| Node / npm | v20.19.2 / 9.2.0 (Node 20 LTS was already installed; nvm not needed) |
| Playwright | Version 1.63.0 (from `npm ci` with the lockfile) |
| Chrome | Google Chrome 154.0.8037.57 (`/opt/google/chrome/google-chrome`, `channel: 'chrome'`) |
| Edge | Microsoft Edge 154.0.4258.48 (`/opt/microsoft/msedge/microsoft-edge`, `channel: 'msedge'`) |
| Mode | **Headless**. `headless: true` is hardcoded in `launch()` in `tests/spike/t01.spike.js`. The UA reads `HeadlessChrome/154.0.0.0`. |

**Assumption A-30:** Linux Microsoft Edge Stable 154 stands in for Windows Edge here. This run does not show that Windows Edge behaves the same way.

**Coverage gap:** IE's manual check (double-click `spikes/t01/index.html`, quit the browser, reopen with `?phase=read`, then open a second tab with `role=second`) was **NOT executed** in this run. All results below come from the automated headless Playwright runner. Opening the page by double-click from the OS file manager in a headed browser was not tested.

## Commands executed (raw logs in this folder)

| Command | Log | Exit |
|---|---|---|
| `npm ci` | `npm-ci.log` | 0 |
| `npx playwright install chrome msedge` | `playwright-install.log` | 0, but **Edge was NOT installed** (see ENV-1) |
| `npx playwright install msedge` (environment fix) | `playwright-install-msedge.log` | 0, installed `microsoft-edge-stable 154.0.4258.48-1` with apt as root (passwordless sudo) |
| `npm run spike:t01` | `t01-all.log` | 0 |
| `SPIKE_BROWSERS=chrome npm run spike:t01` | `t01-chrome.log` | 0 |
| `node tests/spike/t01.spike.js --browsers=msedge` | `t01-msedge.log` | 0 |

The runner writes no artifacts of its own. It prints to stdout only and deletes its temporary profile in `finally`. The screenshots `screenshot-chrome-write.png` and `screenshot-msedge-write.png` come from the QA probe below.

## Results

Each Actual is quoted from `t01-all.log`. The single-browser runs in `t01-chrome.log` and `t01-msedge.log` show the same values. AC mapping: Classic script → AC-65, IndexedDB → AC-55, Web Locks → AC-82, Font → AC-59 (from `docs/PRD.md`).

| Check | AC | Browser | Method (Executed) | Expected (quoted from docs/spikes/T-01.md) | Actual (quoted log line) | Result |
|---|---|---|---|---|---|---|
| Classic script | AC-65 | Chrome 154.0.8037.57 | `npm run spike:t01`, headless `channel:'chrome'`, 4 page loads on `file://` | "Classic `<script src>` loads and runs" | `"classicScript":{"pass":true}` | **Pass** |
| Classic script | AC-65 | Edge 154.0.4258.48 (Linux) | same, `channel:'msedge'` | "Classic `<script src>` loads and runs" | `"classicScript":{"pass":true}` | **Pass** |
| IndexedDB | AC-55 | Chrome | Write the token in a persistent context, call `context.close()`, relaunch with the same `userDataDir`, read 3 times | "IndexedDB persists across a full browser close and relaunch (same profile)" | `"indexedDB":{"pass":true,"token":"t01-muphl1vb-0hoj6bpq","writtenAt":"2026-10-01T12:04:31.094Z"}` | **Pass** |
| IndexedDB | AC-55 | Edge (Linux) | same | "IndexedDB persists across a full browser close and relaunch (same profile)" | `"indexedDB":{"pass":true,"token":"t01-muphl3el-mrdcfenm","writtenAt":"2026-10-01T12:04:32.940Z"}` | **Pass** |
| Web Locks | AC-82 | Chrome | The holder page holds `t01-spike-lock` and a second page in the same context calls `ifAvailable:true` | "`navigator.locks.request(name, {ifAvailable:true})`: first page holds the lock; second page of the same profile receives `null`" | `"webLocks":{"pass":true,"holderOutcome":"acquired","secondOutcome":"null","holderLockIsNull":false,"secondLockIsNull":true,"isSecureContext":true}` | **Pass** |
| Web Locks | AC-82 | Edge (Linux) | same | (same as above) | `"webLocks":{"pass":true,"holderOutcome":"acquired","secondOutcome":"null","holderLockIsNull":false,"secondLockIsNull":true,"isSecureContext":true}` | **Pass** |
| Local font + no external request | AC-59 | Chrome | `document.fonts.load` and `document.fonts.check` on 4 pages; a request listener on each page | "Local `@font-face` woff2 (Noto Sans SC subset) loads from a relative path, verified with `document.fonts`, and no non-`file://` request is made" | `"font":{"pass":true,"family":"T01 Noto Sans SC","sample":"Nasi Lemak 椰浆饭 谢谢"}},"offendingRequests":[],"pass":true` | **Pass** |
| Local font + no external request | AC-59 | Edge (Linux) | same | (same as above) | `"font":{"pass":true,"family":"T01 Noto Sans SC","sample":"Nasi Lemak 椰浆饭 谢谢"}},"offendingRequests":[],"pass":true` | **Pass** |

`isSecureContext` was `true` on every page in both browsers: `"isSecureContextByPage":{"write":true,"read":true,"holder":true,"second":true}`.
Versions reported: `"version":"154.0.8037.57","product":"Chrome/154.0.8037.57"` and `"version":"154.0.4258.48","product":"Edg/154.0.4258.48"`.

## Was the "fail on any non-file:// request" guard active?

Yes. Three pieces of evidence:

1. **Code:** `openSpike()` adds `page.on('request', ...)`, which pushes any URL that does not start with `file://` into `offending`. Then `buildSummary()` sets `pass = ... && noNonFileRequests` (`offending.length === 0`), and `main()` exits 1 when a run does not pass.
2. **Positive probe** (`guard-probe-request-log.js` → `guard-probe-requests.log`): the probe uses the same listener pattern on the real repo page. The listener saw every resource load, including the font, so it really fires on these requests:
   `"requestsSeenByListener":["file:///workspace/qa-t01/repo/spikes/t01/index.html?phase=write&role=release","file:///workspace/qa-t01/repo/spikes/t01/spike.js","file:///workspace/qa-t01/repo/spikes/t01/fonts/NotoSansSC-subset.woff2"]` (the line is the same for chrome and msedge). The font check in that probe returned `"loadedCount":1,"check":true`.
3. **Negative control** (`guard-negative-control.diff`, `guard-negative-control.log`): in a **copy** of the repo, outside the repo checkout, I added `<img src="https://example.com/qa-negative-control.png">` to the page and ran the unmodified runner from that copy. The guard caught the request and failed the run:
   `"offendingRequests":["https://example.com/qa-negative-control.png", ...],"pass":false` for both browsers, then `exit=1`.

## Findings

- **ENV-1 (environment / tooling, Minor):** Chrome was already installed on the box. `npx playwright install chrome msedge` printed `ATTENTION: "chrome" is already installed on the system!`, did **not** install msedge, and still exited **0**. Repro: on a host where `google-chrome` is already present but Edge is not, run `npx playwright install chrome msedge`. Then `which microsoft-edge` finds nothing. Fix applied on the QA side: ran `npx playwright install msedge` on its own (log kept). Suggested doc fix for `docs/spikes/T-01.md`: install each channel separately, or use `--force` for chrome, and then check both with `google-chrome --version` and `microsoft-edge --version`.
- **OBS-1 (spike design, Minor):** `checkClassicScript()` always returns `pass: true`. The real evidence that the classic script ran is that `window.SPIKE_DONE` is set. If it is not set, the runner times out and reports `pass:false`. So the check is still effective, but the `pass` field on its own carries no information.
- **OBS-2 (coverage, Minor):** The guard listens only to page requests made after `newPage()`. Requests from the persistent context's initial page, or from service or shared workers, are not watched. The spike page creates no workers, so this does not affect this result. T-13 / AC-61 should use `context.on('request')`.
- No Blocker, Critical, or Major defects in the spike or the runner.
