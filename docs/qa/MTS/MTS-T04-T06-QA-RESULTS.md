# QA results: MTS-01 to MTS-12 (calc level) and T-04 / T-06, prototype sprint

Executed by QA on 2026-10-02 (MYT) at `dev` HEAD `a753490` (contains T-04 `a4696bd` and T-06 `5091131`). Environment is in `env.txt`. All runs were headless.
Expected values are hard-coded from URS §8 and PRD §3.1 in `mts-calc.run.js`; they are not derived from `js/calc.js`.
To reproduce, copy `mts-calc.run.js` to `docs/qa/MTS/` and run `node docs/qa/MTS/mts-calc.run.js` from the repo root.

## Mandatory Test Scenarios
| MTS | Method | Expected | Actual | Result |
|---|---|---|---|---|
| 01 | Executed (calc) | SC 10.00, SST 6.60, total 116.60 | same | PASS |
| 02 | Executed (calc) | SC 10.00, SST 6.00, total 116.00 | same | PASS |
| 03 | Executed (calc) | SC 0.00, SST 1.50, total 26.50 | same | PASS |
| 04 | Executed (calc) | all 8 rows of the rounding table (.01 to .09), with signed rounding | all 8 match | PASS |
| 05 | Executed (calc) | 33.34 + 33.33 + 33.33 = 100.00 | same | PASS |
| 06 | Executed (calc only) | voided line excluded from the subtotal; by-item split sums to the total | same | PASS (calc). UI assignment block NOT EXECUTED |
| 07 | Executed (calc) | 100% discount gives total 0.00 with no negative values; RM 50.00 discount capped at 40.00 | same | PASS |
| 08 | Executed (calc only) | empty and all-voided orders total 0.00 | same | Payment block NOT EXECUTED (UI not built) |
| 09 | Executed (calc only) | `cashChange` rejects cash below due, with a reason | same | PASS (calc). UI message NOT EXECUTED |
| 10 | Not tested | order survives a refresh mid-order | n/a | NOT EXECUTED (ordering UI not built) |
| 11 | Executed (calc only) | SST off gives SST 0.00 and total 110.00 | same | PASS (calc). Bill and receipt display NOT EXECUTED |
| 12 | Not tested | Chinese item names print on the receipt | n/a | NOT EXECUTED (receipt not built) |

Runner output is in `mts-calc.log`: 20 checks pass, 0 fail, exit 0.
Mutation control (`mts-mutation-control.log`): on a throwaway copy where `calc.js` always applies SST to the base only, the runner fails MTS-01 and exits 1, so it can detect a wrong SST rule.

## T-04 / T-06
| Case | Method | Result |
|---|---|---|
| T-04: store seeds, persists across restart, pays once, dates bills and voids; second tab gets the tab-lock notice | Executed, Chrome (`npm-test.log`) and Edge (`edge-e2e.log`) | PASS |
| T-04: `window.POS.test` is undefined without `?test=1` | Executed, Chrome and Edge | PASS |
| T-04: a newer IndexedDB version or a newer `schemaVersion` blocks startup and writes nothing | Executed, Chrome and Edge | PASS |
| T-06: primary token, local font, cards, buttons, greyscale status labels | Executed, Chrome and Edge | PASS |

The Edge run used a throwaway copy with `channel: 'chrome'` changed to `'msedge'` (`edge-e2e.diff`); the repo's own e2e tests target Chrome only.

## Regression
- `npm test`: 56 of 56 pass (unit and e2e).
- Oracle: 103 of 103 pass.
- T-01 spike: exit 0.

## Open defects
DEF-03 and DEF-04 are both Minor and deferred to T-13. No new defects.
