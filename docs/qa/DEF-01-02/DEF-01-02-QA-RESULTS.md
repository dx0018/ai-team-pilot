# QA results: DEF-01 and DEF-02 at 6dec2c1

Checkout: `dev` HEAD containing `6dec2c1f9dbb11114327de38ac644674e0b54ea3`. Environment in `env.txt` (Debian 13, Node v20.19.2, npm 9.2.0, Playwright 1.63.0, headless).
All runs executed by QA on 2026-10-01 (MYT).

| Case | Defect | Method | Expected | Actual | Result |
|---|---|---|---|---|---|
| Install Chrome in its own step, then check | DEF-01 | Executed | prints version, exit 0 | `chrome 154.0.8037.57`, exit 0 (`install-chrome.log`, `check-chrome.log`) | Pass |
| Install Edge in its own step, then check | DEF-01 | Executed | prints version, exit 0 | `msedge 154.0.4258.48`, exit 0 (`install-msedge.log`, `check-msedge.log`) | Pass |
| Edge missing (install dir hidden, then restored) | DEF-01 | Executed (negative control) | exit 1 with reason | `msedge missing: ... not found at /opt/microsoft/msedge/msedge`, exit 1; after restore exit 0 (`negative-check-msedge-missing.log`) | Pass |
| Unknown browser name | DEF-01 | Executed | non-zero exit | usage message, exit 2 (`check-bogus.log`) | Pass |
| Spike, both browsers, unmodified | DEF-02 / T-01 regression | Executed | classicScript pass, all 4 checks pass, exit 0 | both browsers pass, `offendingRequests: []`, exit 0 (`spike.log`) | Pass |
| Spike copy with `spike.js` inlined (classic, no `src`) | DEF-02 | Executed (negative control) | classicScript fails, run fails | classicScript `pass:false`, other 3 checks pass, overall `pass:false`, exit 1 (`negative-classic-inline.log`, `.diff`) | Pass |
| Spike copy with `type="module"` | DEF-02 | Executed (negative control) | run fails | module script blocked on file://, SPIKE_DONE timeout, all checks false, exit 1 (`negative-classic-module.log`, `.diff`) | Pass |
| `npm test` regression | T-02/T-03 | Executed | all pass | 38 of 38 (`npm-test.log`) | Pass |
| Oracle regression | T-03 | Executed | all pass | 103 of 103 (`oracle.log`) | Pass |

Negative controls ran on a throwaway copy in `/tmp/neg`; the checkout was not modified.

## New defect
| ID | Severity | Repro steps | Suggested fix |
|---|---|---|---|
| DEF-04 | Minor | Run the inline-script control above. The page computes `detail` ("document.currentScript was missing or type=module"), but `tests/spike/t01.spike.js` (line ~204) reports only `classicScript: { pass: false }`, so the specific failure reason never reaches the log. | Carry each page's `classicScript.detail` (per phase) into the runner's JSON output. |

## Verdict
DEF-01: Pass. DEF-02: Pass (the check now fails when the script is not a classic `<script src>`). DEF-04 opened, Minor, non-blocking; can ride with T-13 alongside DEF-03.
