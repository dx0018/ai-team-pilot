# PRD v0.1: Restaurant Mini POS, Malaysia (Phase 1)

| Item | Value |
|---|---|
| Document | PRD v0.1 |
| Status | **READY_FOR_REVIEW** (approvers: Solution Architect, QA) |
| Source | `/URS.md` v1.0 on `dev` (APPROVED). Every requirement here traces to a URS ID. Nothing has been added beyond the URS. |
| Author | PM |
| Date | 2026-10-01 |

Conventions: requirement IDs (UR-xx, UD-xx, NF-xx) are the URS IDs and are reused here unchanged. Acceptance criteria are AC-01 onward. PRD-level assumptions are logged as [ASSUMPTION A-xx]. A-01 to A-05 are carried over from URS section 10, and A-06 onward are new. Platform constraints come from URS NF-01, NF-03 and NF-06. The PRD restates them as constraints and makes no further technology choices.

---

## 1. Problem and target user

A small-to-medium Malaysian restaurant (10–25 tables, dine-in and takeaway) takes orders by hand and works out bills manually. This causes calculation errors, slow checkout and no reliable end-of-day figures.
The target users are non-technical staff working one shared counter device: **Waiters** open tables and enter orders, **Cashiers** bill, split, record payment and close tables, and the **Owner/Manager** configures the menu, rates and receipt and reviews daily sales.
Phase 1 must produce a correct Malaysian bill every time (service charge, SST, 5-sen rounding), split bills exactly, and give a trustworthy daily summary. It must also look modern enough for the owner to be proud to show customers.

## 2. MVP scope

| Bucket | Items (URS IDs) |
|---|---|
| **Must** | **Tables:** UR-01, UR-02, UR-03. **Menu:** UR-06, UR-07, UR-08. **Ordering:** UR-12, UR-13, UR-14, UR-15. **Bill calc:** UR-17, UR-18, UR-19, UR-20, UR-21, UR-22. **Split:** UR-23, UR-24, UR-25. **Payment:** UR-27, UR-28, UR-29. **Receipt:** UR-31, UR-32, UR-33, UR-35. **EOD:** UR-36, UR-37, UR-38. **Settings/data:** UR-41, UR-42, UR-44. **Design:** UD-01, UD-02, UD-03, UD-04, UD-05, UD-06, UD-10. **Non-functional:** NF-01, NF-03, NF-04, NF-05, NF-06, NF-07. **QA:** all 12 Mandatory Test Scenarios in URS §8 (MTS-01…MTS-12). **Release:** screenshots of the 7 named screens (URS §6). |
| **Should** | UR-04 elapsed time, UR-05 move table, UR-09 sold out, UR-10 menu search, UR-16 discounts, UR-26 per-sub-bill payment method, UR-30 void paid bill, UR-34 receipt footer, UR-39 top 10 items, UR-40 CSV export, UR-43 backup/restore, UD-08 add-item feedback, UD-09 BM language switch, NF-02 offline after first load |
| **Out of scope** | From URS §4: real payment processing or integration (card, DuitNow QR, e-wallets), kitchen display, multi-device sync, online ordering, delivery platforms, LHDN MyInvois, inventory, recipes, membership/loyalty, staff login, backend server or database. **URS "Could" items, deferred from the MVP:** UR-11 modifiers, UD-07 dark mode [ASSUMPTION A-06]. |

Note on UR-16: discount is a Should, but MTS-07 (100% discount) is mandatory. Discount entry is therefore treated as required, at least far enough to run MTS-07 [ASSUMPTION A-07].

## 3. User stories and acceptance criteria

### 3.1 Calculation rules (normative, used by every AC below)

- **R1 Money:** all amounts are held and calculated as exact sen with no binary-float drift. They are displayed as `RM 0.00` (UR-22).
- **R2 Subtotal:** the sum of qty × unit price over **non-voided** lines.
- **R3 Discount:** item-level discounts apply first, then the bill-level discount. The total discount is capped at Subtotal, so the base is never below 0. Base = Subtotal − Discount.
- **R4 Service charge (SC):** SC = Base × SC rate for the order type, if SC is enabled for that order type. Otherwise SC = 0.
- **R5 SST:** the SST base is Base + SC if "SST includes service charge" is on (the default), or Base otherwise. SST = SST base × SST rate if SST is enabled, otherwise SST = 0 and the SST line is hidden.
- **R6 Line rounding:** SC and SST are each rounded to the nearest sen, with half-sen rounded up [ASSUMPTION A-08].
- **R7 Pre-rounding total:** Base + SC + SST.
- **R8 5-sen rounding (if enabled):** round the pre-rounding total to the nearest RM 0.05. Totals ending in .01/.02 go down to .00, .03/.04 go up to .05, .06/.07 go down to .05, and .08/.09 go up to .10. Rounding Adjustment = Grand Total − pre-rounding total, shown as its own signed line (e.g. "Rounding −0.02"). If rounding is disabled, the adjustment is 0.00 [ASSUMPTION A-04 from URS].
- **R9 Grand Total:** pre-rounding total + Rounding Adjustment. It is never negative.

### 3.2 Tables and order types

**US-01 (UR-01, UD-06):** As a waiter, I see every table's status at a glance.
- **AC-01:** Given 20 configured tables, when I open the Table grid, then all 20 are shown, each with a status of Empty, Ordering, Bill Requested or Paid displayed as **both** a colour and a text label (or icon plus label).
- **AC-02:** Given the grid is rendered in greyscale, when I look at any table, then its status can still be identified from the label alone.

**US-02 (UR-02):** As the owner, I configure how many tables there are and what they're called.
- **AC-03:** Given fresh data, when the app first opens, then there are 20 tables named T1–T20.
- **AC-04:** Given Settings, when I change the table count to 12 and rename T3 to "Patio 1" and save, then the grid shows exactly 12 tables including "Patio 1", and this persists after a refresh.
- **AC-05:** Given a table has an open (unpaid) order, when I try to remove that table in Settings, then the change is blocked with a clear message [ASSUMPTION A-09].

**US-03 (UR-03):** As a waiter, I take Dine-in or Takeaway orders.
- **AC-06:** Given an Empty table, when I open it and add an item, then the order is Dine-in, it's linked to that table, and the table status becomes Ordering.
- **AC-07:** Given no takeaway orders yet today, when I create two takeaway orders, then they're numbered TA-001 and TA-002. The numbering restarts at TA-001 on the next calendar day [ASSUMPTION A-10].

### 3.3 Menu

**US-04 (UR-06, UD-05):** As a waiter, I browse the menu by category.
- **AC-08:** Given a menu with categories (e.g. Rice, Noodles, Beverages, Desserts), when I open the Ordering screen, then items are grouped by category as cards showing image (or a placeholder icon if there's none), name and price as `RM 0.00`.

**US-05 (UR-07):** As the owner, I maintain the menu.
- **AC-09:** Given the shipped editable menu config file (JSON per URS UR-07), when the app is first loaded, then its categories and items appear.
- **AC-10:** Given Settings > Menu, when I add an item, edit an item's price, or delete an item and save, then the Ordering screen reflects the change immediately and after a refresh.
- **AC-11:** Given I enter a negative price or a blank name, when I save, then the change is rejected with a clear message [ASSUMPTION A-11].
- **AC-12:** Given an item has been edited or deleted, when I view an existing or paid bill that contains it, then that bill keeps the original name and price [ASSUMPTION A-12].

**US-06 (UR-08):** Item names support English, Bahasa Malaysia and Chinese.
- **AC-13:** Given an item named "Nasi Lemak 椰浆饭", when it's shown on the menu, order, bill, receipt and EOD summary, then every character renders correctly with no missing-glyph boxes (MTS-12).

### 3.4 Ordering

**US-07 (UR-12, UR-15):** As a waiter, I add items quickly and always see the total.
- **AC-14:** Given an open order, when I tap an item card once, then one line with qty 1 is added. Tapping the same item again increments that line's qty.
- **AC-15:** Given a line with qty 2, when I tap − then qty becomes 1. Tapping − at qty 1 removes the line before it has been sent or finalised [ASSUMPTION A-13]. Tapping + increments qty.
- **AC-16:** Given any change to the order, when it happens, then the running total updates immediately and stays visible on the Ordering screen without scrolling at 1280×800 landscape.

**US-08 (UR-13):** As a waiter, I add a note for the kitchen.
- **AC-17:** Given a line item, when I add the note "less spicy", then the note shows under that line and on the receipt [ASSUMPTION A-14].

**US-09 (UR-14):** As a cashier or waiter, I void an item with a reason.
- **AC-18:** Given an ordered line, when I void it, then I must pick a preset reason or type one. Without a reason, the void cannot be confirmed.
- **AC-19:** Given a voided line, then it stays visible struck through, is excluded from every total, and appears with its reason in the EOD voided-items list (UR-38).

### 3.5 Bill calculation

**US-10 (UR-17, UR-22):** As a cashier, I see a complete, correct Malaysian bill.
- **AC-20:** Given any order with at least one non-voided line, when I open the Bill screen, then it shows the lines Subtotal, Discount, Service Charge, SST and Rounding Adjustment, then Grand Total, all as `RM 0.00`, calculated per R1–R9. The SST line is hidden when SST is off (AC-26).
- **AC-21:** Given items priced RM 0.10 and RM 0.20, when both are ordered with SC, SST and rounding off, then the subtotal is exactly RM 0.30.

**US-11 (UR-18):** Service charge is configurable per order type.
- **AC-22:** Given defaults, when a Dine-in RM 100.00 order is billed, then SC = RM 10.00. When a Takeaway order is billed, SC = RM 0.00.
- **AC-23:** Given Settings, when I set the Dine-in SC to 5%, or switch it off, or turn on a Takeaway SC of 10%, then new bills use the new values.

**US-12 (UR-19, UR-20):** SST is configurable and its base is configurable.
- **AC-24 (MTS-01):** Given Dine-in RM 100.00, SC 10%, SST 6% on Base + SC, then SC 10.00, SST 6.60, Grand Total 116.60.
- **AC-25 (MTS-02):** Given the same order with SST on Base only, then SC 10.00, SST 6.00, Grand Total 116.00.
- **AC-26 (MTS-11):** Given SST is switched off, then there is no SST line on the bill or receipt and no SST registration number on the receipt.
- **AC-27 (MTS-03):** Given Takeaway RM 25.00, no SC, SST 6%, then SST 1.50, Grand Total 26.50.
- **AC-28:** Given Settings, when I change the SST rate to 8% and save, then new bills use 8%. Bills already paid keep the rate they were calculated with [ASSUMPTION A-12].

**US-13 (UR-21):** 5-sen rounding.
- **AC-29 (MTS-04):** Given pre-rounding totals ending in .01, .02, .03, .04, .06, .07, .08 and .09, then each Grand Total rounds per R8, and a Rounding line shows the signed adjustment (e.g. x.01 gives "Rounding −0.01", x.03 gives "Rounding +0.02").
- **AC-30:** Given a pre-rounding total ending in .00 or .05, then the Rounding line shows 0.00.
- **AC-31:** Given rounding is switched off in Settings, then the Grand Total equals the pre-rounding total and the adjustment is 0.00 [ASSUMPTION A-15].

**US-14 (MTS-07, MTS-08):** Edge totals.
- **AC-32 (MTS-07):** Given a 100% discount, then the Grand Total is RM 0.00, SC and SST are 0.00, and no line is negative.
- **AC-33 (MTS-08):** Given an order with no lines, or only voided lines, when I try to go to payment, then it's blocked with a clear message.

### 3.6 Split bill

**US-15 (UR-23, UR-25):** Split equally.
- **AC-34:** Given a bill, when I choose split equally, then N can be set from 2 to 20, and values outside that range are rejected.
- **AC-35 (MTS-05):** Given a Grand Total of RM 100.00 split by 3, then the sub-bills are RM 33.34, RM 33.33 and RM 33.33. The extra sen goes to sub-bill 1 and is clearly marked, and the sub-bills sum to exactly RM 100.00.

**US-16 (UR-24, UR-25):** Split by item.
- **AC-36:** Given a bill, when I assign every non-voided line to a sub-bill, then each sub-bill shows its lines and amount, and payment cannot proceed until every line is assigned.
- **AC-37 (MTS-06):** Given an order where one line is voided, when I split by item, then the voided line can't be assigned and is excluded from every sub-bill.
- **AC-38:** Given any split by item, then the sub-bill amounts are the Grand Total allocated in proportion to each sub-bill's share of Base. Each share is rounded down to the sen, any remaining sen goes to sub-bill 1 and is clearly marked, and the sum equals the Grand Total exactly [ASSUMPTION A-16].
- **AC-39:** Given a split, when it's shown, then each sub-bill is a share of one bill, and the bill itself keeps a single bill number [ASSUMPTION A-17].

### 3.7 Payment and closing

**US-17 (UR-27):** Record the payment method.
- **AC-40:** Given payment, when I choose a method, then exactly these options are offered: Cash, Card, DuitNow QR, Touch 'n Go eWallet, GrabPay, Other. No external service is contacted.
- **AC-41:** Given a split bill, when I pay, then each sub-bill records its own method. The Should item UR-26 allows them to differ. Until UR-26 ships, one method applies to all sub-bills [ASSUMPTION A-18].

**US-18 (UR-28):** Cash and change.
- **AC-42:** Given Cash and a Grand Total of RM 26.50, when I enter RM 50.00 received, then the change due shown is RM 23.50.
- **AC-43 (MTS-09):** Given Cash received below the amount due, when I confirm, then it's blocked with a clear message.

**US-19 (UR-29):** Close the table.
- **AC-44:** Given payment is completed, then the table shows Paid. One tap resets it to Empty, and the paid bill stays in the day's records.
- **AC-45:** Given a table's bill is shown to the guest, when the cashier marks it as bill requested, then the table status shows Bill Requested [ASSUMPTION A-19].

### 3.8 Receipt

**US-20 (UR-31, UD-10):** Print the receipt.
- **AC-46:** Given a paid bill, when I print, then a receipt prints through the browser print or Save as PDF dialog, in a layout that fits 80 mm thermal paper and also prints legibly on A4, with no clipped text. The header is centred and the price column aligned.

**US-21 (UR-32, UR-33, UR-35):** Receipt content.
- **AC-47:** Given Settings details, then the header shows restaurant name, SSM no., address and phone, plus the SST registration no. only when SST is on.
- **AC-48:** Given a paid bill, then the body shows bill no., date/time (MYT), table or takeaway no., each non-voided line with qty, unit price and line amount, every totals line from AC-20, the payment method(s), and cash received and change for Cash payments.
- **AC-49:** Given the first three bills on 2026-10-01, then they're numbered B-20261001-0001, -0002 and -0003, and numbering restarts at -0001 on the next day. A voided bill keeps its number, and numbers are never reused.

### 3.9 End-of-day summary

**US-22 (UR-36, UR-37, UR-38):** As the owner, I review a day's sales.
- **AC-50:** Given a selected date, then the summary shows: number of bills, gross sales (sum of Subtotal), total discount, total SC, total SST, total rounding and net sales. Each figure equals the sum over that day's non-voided paid bills [ASSUMPTION A-20].
- **AC-51:** Given the same date, then totals are broken down by each payment method and by Dine-in vs Takeaway, and each breakdown sums to the overall total.
- **AC-52:** Given voided items and voided bills that day, then each is listed with time, bill or table reference, amount and reason.
- **AC-53:** Given a date with no bills, then the summary shows zero values and no error.

### 3.10 Settings and data

**US-23 (UR-41):** One Settings screen.
- **AC-54:** Given Settings, then I can edit restaurant details (name, SSM no., address, phone, SST reg. no.), tables, menu, SC (rate and on/off per order type), SST (rate, on/off, and whether it includes SC), rounding on/off, and the receipt footer. Saved changes apply to new bills.

**US-24 (UR-42):** Data survives refresh.
- **AC-55 (MTS-10):** Given an open order mid-entry, when I refresh or restart the browser, then the order, table status, settings, menu and all bills are unchanged.

**US-25 (UR-44):** Safe reset.
- **AC-56:** Given "Reset all data", when I trigger it, then a confirmation step is required. If I cancel, nothing changes. If I confirm, all data returns to the defaults.

### 3.11 Look and feel (Must)

- **AC-57 (UD-01, UD-05, UD-10):** Given the Release Reviewer's screenshots of the Table grid, Ordering, Bill, Split bill, Receipt, EOD summary and Settings screens, then each shows rounded cards, soft shadows and generous spacing, and the owner can judge them against URS §6.
- **AC-58 (UD-02):** Given the theme's design tokens, when the primary colour token alone is changed, then every primary-coloured element updates. The default palette is warm (e.g. deep green or terracotta on a cream background) with one accent colour for primary actions.
- **AC-59 (UD-03):** Given the bundled web font (which must support Chinese, per UD-03), when any screen renders, then the text uses it with no external font request. The Grand Total and running total are the most prominent figures on their screens.
- **AC-60 (UD-04):** Given a 1280×800 landscape viewport (representing a 10–11 inch tablet) and a 1366×768 laptop viewport, then every Must screen works without horizontal scrolling, and every tappable control is at least 44×44 px [ASSUMPTION A-21].

### 3.12 Non-functional (Must)

- **AC-61 (NF-01):** Given the app is running, when network traffic is observed, then there are no runtime calls to external hosts, no login, no backend and no paid service.
- **AC-62 (NF-03):** Given the latest stable Chrome and Edge, then all Must ACs pass in both.
- **AC-63 (NF-04):** Given 200 menu items and 500 stored bills, when I open any screen or perform any Must action, then it responds within 300 ms on the test device (measurement method to be set by QA) [ASSUMPTION A-22].
- **AC-64 (NF-05):** Given the calculation module (SC, SST, rounding, discount, split), then it is separate from the UI and has automated unit tests covering MTS-01 to MTS-07 plus AC-21, AC-29 to AC-32 and AC-35 to AC-38, and they all pass.
- **AC-65 (NF-06):** Given a fresh copy, when the README steps are followed, then the app opens with no installation (opening `index.html` or using a static server, per URS NF-06).
- **AC-66 (NF-07):** Given a code review, then the file structure is clear and there are no unused libraries.

### 3.13 Should items (lighter ACs, for completeness)

- **AC-67 (UR-04):** An open table shows the minutes elapsed since it was opened, updated at least every minute.
- **AC-68 (UR-05):** Moving an open order to an Empty table moves all lines and frees the source table. Moving to an occupied table is blocked.
- **AC-69 (UR-09):** A Sold Out item can't be added and is visibly marked.
- **AC-70 (UR-10):** Typing "nasi" filters items whose name contains it, case-insensitive, including Chinese characters.
- **AC-71 (UR-16):** Item-level and bill-level discounts accept a percentage (0–100) or a fixed RM amount, and the total discount is capped per R3.
- **AC-72 (UR-26):** Each sub-bill can record a different payment method, and the EOD breakdown reflects each one.
- **AC-73 (UR-30):** A paid bill has no edit controls. Voiding it requires a reason, and it appears in the EOD voided bills list excluded from net sales.
- **AC-74 (UR-34):** The footer defaults to "Thank you! Terima kasih! 谢谢!" and can be edited.
- **AC-75 (UR-39):** The EOD summary lists the top 10 items by quantity over non-voided lines.
- **AC-76 (UR-40):** The CSV export of the day's bills opens in Excel with correct columns, RM amounts and Chinese characters intact [ASSUMPTION A-23].
- **AC-77 (UR-43):** Export creates one backup file. Restoring it on a fresh browser reproduces all data, and restore asks for confirmation before overwriting.
- **AC-78 (UD-08):** Adding an item gives visible feedback within 100 ms with no input lag.
- **AC-79 (UD-09):** The language switch changes UI labels between English and Bahasa Malaysia. Menu item names are left unchanged.
- **AC-80 (NF-02):** After the first load, the app works with the network disconnected.

### 3.14 Traceability (Must items to ACs)

| URS ID | ACs | | URS ID | ACs |
|---|---|---|---|---|
| UR-01 | 01, 02 | | UR-27 | 40, 41 |
| UR-02 | 03, 04, 05 | | UR-28 | 42, 43 |
| UR-03 | 06, 07 | | UR-29 | 44, 45 |
| UR-06 | 08 | | UR-31 | 46 |
| UR-07 | 09, 10, 11, 12 | | UR-32 | 47 |
| UR-08 | 13 | | UR-33 | 48 |
| UR-12 | 14, 15 | | UR-35 | 49 |
| UR-13 | 17 | | UR-36 | 50, 53 |
| UR-14 | 18, 19 | | UR-37 | 51 |
| UR-15 | 16 | | UR-38 | 19, 52 |
| UR-17 | 20 | | UR-41 | 54 |
| UR-18 | 22, 23 | | UR-42 | 55 |
| UR-19 | 24, 26, 27, 28 | | UR-44 | 56 |
| UR-20 | 24, 25 | | UD-01/05/10 | 57, 46, 08 |
| UR-21 | 29, 30, 31 | | UD-02 | 58 |
| UR-22 | 20, 21 | | UD-03 | 59 |
| UR-23 | 34, 35 | | UD-04 | 60 |
| UR-24 | 36, 37 | | UD-06 | 01, 02 |
| UR-25 | 35, 38, 39 | | NF-01/03/04/05/06/07 | 61/62/63/64/65/66 |

Mandatory Test Scenarios: MTS-01 maps to AC-24, MTS-02 to AC-25, MTS-03 to AC-27, MTS-04 to AC-29, MTS-05 to AC-35, MTS-06 to AC-37, MTS-07 to AC-32, MTS-08 to AC-33, MTS-09 to AC-43, MTS-10 to AC-55, MTS-11 to AC-26 and MTS-12 to AC-13.

## 4. Success metrics

| ID | Metric | Target | How measured |
|---|---|---|---|
| SM-01 | Mandatory Test Scenarios passing with executed evidence | 12 of 12 | QA run log committed on `dev` |
| SM-02 | Must ACs passing | 100% of Must ACs (AC-01 to AC-66) | QA AC checklist with evidence |
| SM-03 | Calculation unit tests | 100% pass, 0 floating-point mismatches across all fixed cases plus ≥1,000 generated cases checked against an independent reference | Automated test output |
| SM-04 | Split integrity | 0 cases where the sum of sub-bills differs from the Grand Total, across N = 2–20 and every split-by-item test | Unit tests |
| SM-05 | Screen responsiveness | Every screen and Must action ≤ 300 ms at 200 items and 500 bills | QA timing measurement (AC-63) |
| SM-06 | Order entry speed | A tester opens an Empty table and enters a 5-item order in ≤ 30 s, using ≤ 8 taps excluding quantity changes [ASSUMPTION A-24] | Timed QA walkthrough |
| SM-07 | Checkout speed | From Bill screen to Paid with Cash and change in ≤ 20 s [ASSUMPTION A-24] | Timed QA walkthrough |
| SM-08 | EOD accuracy | EOD figures match a hand-calculated total over a ≥ 20-bill test day exactly, to the sen | QA reconciliation |
| SM-09 | Design acceptance | All 7 required screens provided, and owner approval of look and feel on a tablet | Release package plus owner sign-off |

## 5. Assumptions and risks

### Assumptions (owner to confirm; A-01 to A-05 come from the URS)

| ID | Assumption | Impact if wrong |
|---|---|---|
| [ASSUMPTION A-01] | F&B SST default 6%. Owner confirms with accountant. | Wrong tax on every bill. It's a setting, so it can be changed without code. |
| [ASSUMPTION A-02] | SC default 10% on Dine-in only. | Wrong totals. Settings change only. |
| [ASSUMPTION A-03] | SST is calculated on Base + SC by default. | SST over-charged by about 0.6% of Base. Settings change only. |
| [ASSUMPTION A-04] | 5-sen rounding applies to the final total for all payment methods by default (configurable). | Card or e-wallet totals may differ by up to RM 0.02 from the expected amount. If rounding should apply to cash only, a per-method rule is needed (scope change). |
| [ASSUMPTION A-05] | MyInvois e-invoicing is not needed in Phase 1. | A compliance gap if the restaurant is in scope for e-invoicing. That would be a Phase 2 item. |
| [ASSUMPTION A-06] | URS "Could" items (UR-11 modifiers, UD-07 dark mode) are left out of the MVP. | If the owner expects them, they're added as a scope change with a logged decision. |
| [ASSUMPTION A-07] | Discount (UR-16, Should) is built at least far enough to run MTS-07. | If discount isn't built, MTS-07 can't pass and acceptance fails. |
| [ASSUMPTION A-08] | SC and SST are each rounded to the sen with half-up rounding before summing. | 1-sen differences against the accountant's method. Low impact, but it needs confirming. |
| [ASSUMPTION A-09] | Tables with open orders can't be removed in Settings. | Without this block, open orders could be orphaned. |
| [ASSUMPTION A-10] | Takeaway numbers (TA-xxx) restart daily, like bill numbers. | If they should run continuously, it's a minor rule change. |
| [ASSUMPTION A-11] | Menu validation: price ≥ 0 and name required. | Minor. |
| [ASSUMPTION A-12] | Bills store a snapshot of item names, prices and rates at the time. Later Settings changes don't alter past bills. | Without snapshots, history and EOD figures would change retroactively, which is a data-integrity risk. |
| [ASSUMPTION A-13] | There's no kitchen send step in Phase 1. − at qty 1 removes a line, while removing after billing starts requires a void. | If the owner wants every removal audited, − at qty 1 would also need a void reason. |
| [ASSUMPTION A-14] | Line notes print on the customer receipt. There's no kitchen ticket because the kitchen display is out of scope. | If notes shouldn't appear on the customer receipt, hiding them is a minor change. |
| [ASSUMPTION A-15] | With rounding off, the Rounding line shows 0.00 rather than being hidden. | Cosmetic. |
| [ASSUMPTION A-16] | In a split by item, SC, SST and rounding are calculated on the whole bill and allocated to sub-bills in proportion to Base, with remainder sen going to sub-bill 1. Sub-bill amounts aren't 5-sen rounded. | If each sub-bill must be a 5-sen-rounded bill of its own, the split total could differ from the Grand Total, which conflicts with UR-25. It needs an owner decision. |
| [ASSUMPTION A-17] | A split bill keeps one bill number, and sub-bills are labelled /1, /2 and so on. | If each sub-bill needs its own receipt number, bill numbering changes. |
| [ASSUMPTION A-18] | If UR-26 isn't delivered, one payment method applies to the whole split bill. | EOD payment breakdown would be less precise. |
| [ASSUMPTION A-19] | Bill Requested is set when the cashier opens or prints the bill before payment. | Minor workflow difference. |
| [ASSUMPTION A-20] | Gross sales = sum of Subtotals, and net sales = sum of Grand Totals, over non-voided paid bills. | The owner's accountant may define net differently (e.g. excluding SST). It should be confirmed. |
| [ASSUMPTION A-21] | 1280×800 is the reference tablet viewport and 1366×768 the reference laptop viewport. | Layout issues on other tablet sizes. |
| [ASSUMPTION A-22] | The 300 ms target is measured on a mid-range tablet or laptop in the target browsers. QA defines the device. | Results could pass or fail depending on hardware. |
| [ASSUMPTION A-23] | CSV opens in Excel with Chinese text intact (UTF-8 readable by Excel). | Garbled names in Excel. |
| [ASSUMPTION A-24] | SM-06 and SM-07 time targets are PM-set benchmarks, not URS requirements. | The targets may need recalibrating after the pilot. They aren't release gates. |

### Risks

| ID | Risk | Likelihood / Impact | Mitigation |
|---|---|---|---|
| RK-01 | Tax rates or rules change, or the owner's SST registration status differs. | Medium / High | Every rate and the calculation order are settings (UR-18 to UR-21). The owner confirms A-01 to A-04 before live use. |
| RK-02 | Browser-stored data is lost (cleared cache, device swap). | Medium / High | UR-43 backup and restore (Should). Recommend the owner backs up daily, and the README warns about clearing browser data. |
| RK-03 | Receipt printing differs across thermal printers and drivers. | Medium / Medium | Test on 80 mm and A4 through the browser print dialog. Printer setup steps go in the README. |
| RK-04 | Split allocation rule (A-16) doesn't match the owner's expectation. | Medium / Medium | Clearly marked remainder sen. Flag A-16 for owner confirmation. |
| RK-05 | "Looks beautiful" is subjective, so it could be rejected late. | Medium / Medium | Provide the 7 screenshots early for owner review (AC-57). |
| RK-06 | Performance drops as bills accumulate past 500. | Low / Medium | Measure at 500 bills (AC-63). Backup/export plus reset gives a way to archive. |
| RK-07 | The URS lives at `/URS.md` rather than the `docs/URS.md` named in the brief. | Low / Low | Treated as the same document (the PO's project-log assumption). |

## 6. Open items for review

- **SA:** Please confirm that R1–R9 and A-16 can be designed against without guessing, or raise an issue. I'll answer it or escalate it to the owner.
- **QA:** Please confirm that every AC from AC-01 to AC-66 can be tested, and that the mapping from MTS to ACs is complete.
