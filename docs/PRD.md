# PRD v0.3: Restaurant Mini POS, Malaysia (Phase 1)

| Item | Value |
|---|---|
| Document | PRD v0.3 (supersedes v0.2 at `9e65c78`, which SA and QA approved) |
| Status | **APPROVED** at v0.2 by SA and QA. v0.3 is an editorial update plus D-04, READY_FOR_REVIEW as a delta. |
| Source | `/URS.md` v1.0 on `dev`, blob `951a849` (APPROVED). Any later change to that blob is a deviation to re-review. Every requirement here traces to a URS ID. Nothing has been added beyond the URS. |
| Author | PM |
| Date | 2026-10-01 |
| Changes | Addresses SA review items 1–8 and QA review items 1–8 of v0.1. See §7 Change log and §8 Decision log. |

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

Note on UR-16: discount is a Should, but MTS-07 (100% discount) is mandatory. The **bill-level discount (% or RM) is therefore Must**, and item-level discount stays Should (D-01). This isn't silent scope growth: it's the minimum needed to run a mandatory URS scenario.

Note on UR-38 and UR-30: UR-38 (Must) lists voided bills, but voiding a paid bill (UR-30) is a Should. The voided-bills section of the EOD summary is Must. It is populated only if UR-30 is delivered, and otherwise shows "None" (D-02).

Note on the single-tab guard: AC-82 protects bill numbering (UR-35, Must) from collisions when two tabs share browser storage. It adds no user feature (D-03).

## 3. User stories and acceptance criteria

### 3.1 Calculation rules (normative, used by every AC below)

- **R1 Money:** all amounts are held and calculated as exact sen with no binary-float drift. They are displayed as `RM 0.00` (UR-22).
- **R2 Subtotal:** the sum of qty × unit price over **non-voided** lines.
- **R3 Discount:** item-level discounts (Should) apply first, then the bill-level discount (Must). A percentage discount is converted to sen with half-up rounding, as in R6. The total discount is capped at Subtotal, so Base is never below 0. Base = Subtotal − Discount.
- **R4 Service charge (SC):** SC = Base × SC rate for the order type, if SC is enabled for that order type. Otherwise SC = 0.
- **R5 SST:** the SST base is Base + **rounded** SC (from R6) if "SST includes service charge" is on (the default), or Base otherwise. SST = SST base × SST rate if SST is enabled, otherwise SST = 0 and the SST line is hidden.
- **R6 Line rounding:** SC and SST are each rounded to the nearest sen, with half-sen rounded up [ASSUMPTION A-08].
- **R7 Pre-rounding total:** Base + SC + SST.
- **R8 5-sen rounding (if enabled):** round the pre-rounding total to the nearest RM 0.05. Totals ending in .01/.02 go down to .00, .03/.04 go up to .05, .06/.07 go down to .05, and .08/.09 go up to .10. Rounding Adjustment = Grand Total − pre-rounding total, shown as its own signed line (e.g. "Rounding −0.02"). If rounding is disabled, the adjustment is 0.00 [ASSUMPTION A-04 from URS].
- **R9 Grand Total:** pre-rounding total + Rounding Adjustment. It is never negative.
- **R10 Blocked action ("clear message"):** wherever an AC says an action is "blocked with a clear message", a visible message names the reason, the action is not performed, and no stored state changes.
- **R11 Input validation:**
  - Prices are numeric, ≥ 0, with at most 2 decimals.
  - SC and SST rates are numeric, 0–100, with at most 2 decimals.
  - The table count is a whole number from 1 to 50 [ASSUMPTION A-25]. Table names are non-blank and unique, ignoring case.
  - The split count N is a whole number from 2 to 20.
  - A discount % is 0–100 with at most 2 decimals. A discount RM amount is ≥ 0 with at most 2 decimals, capped per R3.
  - Cash received is numeric, ≥ 0, with at most 2 decimals.
  - Any invalid input is blocked per R10.
- **R12 Order and line lifecycle:**
  - An order is **Ordering** while lines are being added.
  - Opening the Bill screen sets it to **Bill Requested**. This is the only way it's set, with no separate manual toggle.
  - Lines that exist when the order enters Bill Requested become **committed**.
  - A committed line can only be voided (R10 rules plus a reason, AC-18). The − button can't reduce it.
  - An uncommitted line can be reduced or removed freely with −.
  - Adding any item to a Bill Requested order returns it to Ordering. Previously committed lines stay committed, and the new lines are uncommitted.
  - Payment moves the order to **Paid**.
- **R13 Snapshot and live settings:**
  - A line stores the item's name and unit price at the moment it is added. Later menu edits don't change open or paid orders.
  - SC, SST and rounding settings apply live to every unpaid order. They are frozen into the bill at payment.
  - A paid bill never changes when settings change.

**Worked examples (defaults: Dine-in SC 10%, SST 6% on Base + SC, rounding on):**

| Ex | Input | SC | SST | Pre-rounding | Rounding | Grand Total |
|---|---|---|---|---|---|---|
| W1 | Base RM 12.34 | 1.234 → 1.23 | 13.57 × 6% = 0.8142 → 0.81 | 14.38 | +0.02 | **14.40** |
| W2 | Base RM 10.05 (half-up test) | 1.005 → 1.01 | 11.06 × 6% = 0.6636 → 0.66 | 11.72 | −0.02 | **11.70** |
| W3 | Takeaway Base RM 25.00 | 0.00 | 1.50 | 26.50 | 0.00 | **26.50** |
| W4 | Subtotal RM 40.00, 100% discount | 0.00 | 0.00 | 0.00 | 0.00 | **0.00** |

**Split worked example (A-16):** Dine-in, three people each ordering one RM 10.00 item, so Base is 30.00. SC is 3.00, SST is 33.00 × 6% = 1.98, the pre-rounding total is 34.98 and rounding is +0.02, giving a Grand Total of 35.00. Each person's share of Base is one third, so 35.00 / 3 = 11.666… is rounded down to 11.66 each, which leaves a remainder of 0.02. That goes to sub-bill 1, giving **11.68 / 11.66 / 11.66**, which sums to exactly 35.00. In an equal split, the same remainder rule gives RM 100.00 / 3 = **33.34 / 33.33 / 33.33**.

**W5 Unequal split by item (verified independently by QA and SA):** Dine-in lines of 10.00 (sub-bill 1), 20.00 (sub-bill 2) and 5.00 (sub-bill 3) give a Base of 35.00. SC is 3.50, SST is 38.50 × 6% = 2.31, the pre-rounding total is 40.81, rounding is −0.01 and the Grand Total is 40.80. The floors of 4080 × base_i / 3500 sen are 1165, 2331 and 582, which leaves a remainder of 2 sen for sub-bill 1. The result is **11.67 / 23.31 / 5.82**, which sums to 40.80.

**Rounding table (AC-29):** SC, SST and discount are off, so the pre-rounding total equals the Subtotal.

| Pre-rounding | Grand Total | Rounding line |
|---|---|---|
| 10.01 | 10.00 | −0.01 |
| 10.02 | 10.00 | −0.02 |
| 10.03 | 10.05 | +0.02 |
| 10.04 | 10.05 | +0.01 |
| 10.06 | 10.05 | −0.01 |
| 10.07 | 10.05 | −0.02 |
| 10.08 | 10.10 | +0.02 |
| 10.09 | 10.10 | +0.01 |

### 3.2 Tables and order types

**US-01 (UR-01, UD-06):** As a waiter, I see every table's status at a glance.
- **AC-01:** Given 20 configured tables, when I open the Table grid, then all 20 are shown, each with a status of Empty, Ordering, Bill Requested or Paid displayed as **both** a colour and a text label (or icon plus label).
- **AC-02:** Given the grid is rendered in greyscale, when I look at any table, then its status can still be identified from the label alone.

**US-02 (UR-02):** As the owner, I configure how many tables there are and what they're called.
- **AC-03:** Given fresh data, when the app first opens, then there are 20 tables named T1–T20.
- **AC-04:** Given Settings, when I change the table count to 12 and rename T3 to "Patio 1" and save, then the grid shows exactly 12 tables including "Patio 1", and this persists after a refresh. A count outside 1–50, a blank name or a duplicate name is blocked per R10 and R11.
- **AC-05:** Given a table has an open (unpaid) order, when I try to remove that table in Settings, then it's blocked per R10 [ASSUMPTION A-09].

**US-03 (UR-03):** As a waiter, I take Dine-in or Takeaway orders.
- **AC-06:** Given an Empty table, when I open it and add an item, then the order is Dine-in, it's linked to that table, and the table status becomes Ordering.
- **AC-07:** Given no takeaway orders yet today, when I create two takeaway orders, then they're numbered TA-001 and TA-002. The numbering restarts at TA-001 on the next calendar day, at midnight device time (MYT) [ASSUMPTION A-10].
- **AC-07a (takeaway flow):** Given the Table grid, then a takeaway strip shows a "New Takeaway" control and every open (unpaid) takeaway order with its TA number and R12 status. Tapping one reopens it. When a takeaway order is paid, it's removed from the strip, and its bill stays in the day's records.

### 3.3 Menu

**US-04 (UR-06, UD-05):** As a waiter, I browse the menu by category.
- **AC-08:** Given a menu with categories (e.g. Rice, Noodles, Beverages, Desserts), when I open the Ordering screen, then items are grouped by category as cards showing image (or a placeholder icon if there's none), name and price as `RM 0.00`.

**US-05 (UR-07):** As the owner, I maintain the menu.
- **AC-09 (D-04):** Given the shipped default menu file, when the app is first loaded from disk, then its categories and items appear. The file wraps the menu in a single line of code so that it loads when the app is opened from disk. QA checks this by removing the wrapper: what's left must parse as strict JSON. Settings can export the menu as a plain `.json` file and import it back, and the re-imported menu must match the original exactly.
- **AC-10:** Given Settings > Menu, when I add an item, edit an item's price, or delete an item and save, then the Ordering screen reflects the change immediately and after a refresh.
- **AC-11:** Given I enter a price that breaks R11 (negative, non-numeric or more than 2 decimals) or a blank name, when I save, then it's blocked per R10.
- **AC-12:** Given an item is already on an open or paid order, when I edit its name or price, or delete it from the menu, then that order keeps the name and price captured when the line was added (R13).

**US-06 (UR-08):** Item names support English, Bahasa Malaysia and Chinese.
- **AC-13:** Given an item named "Nasi Lemak 椰浆饭", when it's shown on the menu, order, bill, receipt and EOD summary, then every character renders correctly with no missing-glyph boxes (MTS-12). Characters outside the bundled font subset may render in the device's system CJK font, but must not show as boxes.

### 3.4 Ordering

**US-07 (UR-12, UR-15):** As a waiter, I add items quickly and always see the total.
- **AC-14:** Given an open order, when I tap an item card once, then one line with qty 1 is added. Tapping the same item again increments that line's qty.
- **AC-15:** Given an **uncommitted** line (R12) with qty 2, when I tap −, then qty becomes 1. Tapping − at qty 1 removes the line, and tapping + increments qty. Given a **committed** line, − is unavailable and only void (AC-18) can remove it.
- **AC-16:** Given any change to the order, when it happens, then the running total updates immediately and stays visible on the Ordering screen without scrolling at 1280×800 landscape.

**US-08 (UR-13):** As a waiter, I add a note for the kitchen.
- **AC-17:** Given a line item, when I add the note "less spicy", then the note shows under that line and on the receipt [ASSUMPTION A-14].

**US-09 (UR-14):** As a cashier or waiter, I void an item with a reason.
- **AC-18:** Given an ordered line, when I void it, then I must pick a preset reason or type one. Without a reason, the void cannot be confirmed.
- **AC-19:** Given a voided line, then it stays visible struck through, is excluded from every total, and appears with its reason in the EOD voided-items list (UR-38).

### 3.5 Bill calculation

**US-10 (UR-17, UR-22):** As a cashier, I see a complete, correct Malaysian bill.
- **AC-20:** Given any order with at least one non-voided line, when I open the Bill screen, then the order becomes Bill Requested (R12) and the screen shows the lines Subtotal, Discount, Service Charge, SST and Rounding Adjustment, then Grand Total, all as `RM 0.00`, calculated per R1–R9. The SST line is hidden when SST is off (AC-26).
- **AC-21:** Given items priced RM 0.10 and RM 0.20, when both are ordered with SC, SST and rounding off, then the subtotal is exactly RM 0.30.

**US-11 (UR-18):** Service charge is configurable per order type.
- **AC-22:** Given defaults, when a Dine-in RM 100.00 order is billed, then SC = RM 10.00. When a Takeaway order is billed, SC = RM 0.00.
- **AC-23:** Given Settings, when I set the Dine-in SC to 5%, or switch it off, or turn on a Takeaway SC of 10%, then every unpaid order is recalculated with the new values and paid bills are unchanged (R13). A rate outside R11 is blocked per R10.

**US-12 (UR-19, UR-20):** SST is configurable and its base is configurable.
- **AC-24 (MTS-01):** Given Dine-in RM 100.00, SC 10%, SST 6% on Base + SC, then SC 10.00, SST 6.60, Grand Total 116.60.
- **AC-25 (MTS-02):** Given the same order with SST on Base only, then SC 10.00, SST 6.00, Grand Total 116.00.
- **AC-26 (MTS-11):** Given SST is switched off, then there is no SST line on the bill or receipt and no SST registration number on the receipt.
- **AC-27 (MTS-03):** Given Takeaway RM 25.00, no SC, SST 6%, then SST 1.50, Grand Total 26.50.
- **AC-28:** Given Settings, when I change the SST rate to 8% and save, then every unpaid order uses 8%, and bills already paid keep the rate frozen at payment (R13).

**US-13 (UR-21):** 5-sen rounding.
- **AC-29 (MTS-04):** Given each of the 8 rows of the Rounding table in §3.1, with SC, SST and discount off, then the Grand Total and signed Rounding line match that row exactly.
- **AC-30:** Given a pre-rounding total ending in .00 or .05, then the Rounding line shows 0.00.
- **AC-31:** Given rounding is switched off in Settings, then the Grand Total equals the pre-rounding total and the adjustment is 0.00 [ASSUMPTION A-15].

**US-14 (MTS-07, MTS-08):** Edge totals.
- **AC-32 (MTS-07):** Given a Dine-in order with a Subtotal of RM 40.00 and a **bill-level** discount of 100%, then the Discount is 40.00, SC and SST are 0.00, the Grand Total is RM 0.00, and no line is negative (W4). The same holds for a fixed RM discount of 50.00, which is capped at 40.00.
- **AC-32a (bill-level discount):** Given a bill, when I apply a bill-level discount of 10% to a Subtotal of RM 12.35, then the Discount is 1.24 (half-up from 1.235) and Base is 11.11. A fixed RM 5.00 discount gives a Discount of 5.00. Invalid values are blocked per R11.
- **AC-33 (MTS-08):** Given an order with no lines, or only voided lines, when I try to go to payment, then it's blocked per R10.

### 3.6 Split bill

**US-15 (UR-23, UR-25):** Split equally.
- **AC-34:** Given a bill, when I choose split equally, then N can be set as a whole number from 2 to 20, and anything else is blocked per R10. Equal-split amounts are allocations of the Grand Total and are **not** 5-sen rounded.
- **AC-35 (MTS-05):** Given a Grand Total of RM 100.00 split by 3, then the sub-bills are RM 33.34, RM 33.33 and RM 33.33. The extra sen goes to sub-bill 1 and is clearly marked, and the sub-bills sum to exactly RM 100.00.

**US-16 (UR-24, UR-25):** Split by item.
- **AC-36:** Given a bill, when I split by item, then each non-voided line goes **whole** to exactly one sub-bill, and a line with qty > 1 can't be divided. Each sub-bill shows its lines and amount. Payment can't proceed until every line is assigned and every sub-bill has at least one line, and both conditions are enforced per R10.
- **AC-37 (MTS-06):** Given an order where one line is voided, when I split by item, then the voided line can't be assigned and is excluded from every sub-bill.
- **AC-38:** Given any split by item, then each sub-bill's base_i is the sum of its lines after item-level discount. Sub-bill i = floor(GrandTotal_sen × base_i / Σbase), and the remaining sen go to sub-bill 1, clearly marked. The sum equals the Grand Total exactly, and sub-bill amounts aren't 5-sen rounded [ASSUMPTION A-16]. If Σbase = 0, every sub-bill is 0.00. Verified by W5 (11.67 / 23.31 / 5.82) and the A-16 example (11.68 / 11.66 / 11.66).
- **AC-39:** Given a split, then the bill keeps a single bill number, and sub-bills are labelled /1, /2 and so on. **One receipt** is printed per bill. It lists each sub-bill's label and amount after the totals block [ASSUMPTION A-17].

### 3.7 Payment and closing

**US-17 (UR-27):** Record the payment method.
- **AC-40:** Given payment, when I choose a method, then exactly these options are offered: Cash, Card, DuitNow QR, Touch 'n Go eWallet, GrabPay, Other. No external service is contacted.
- **AC-41 (Must):** Given a split or unsplit bill, when I pay, then **one** payment method is recorded for the whole bill. If it's Cash, one cash received and change figure applies to the Grand Total. Per-sub-bill methods, each with its own cash received and change, are the Should item UR-26 (AC-72) [ASSUMPTION A-18].

**US-18 (UR-28):** Cash and change.
- **AC-42:** Given Cash and a Grand Total of RM 26.50, when I enter RM 50.00 received, then the change due shown is RM 23.50. Entering exactly RM 26.50 is accepted with change of RM 0.00, and non-numeric input is blocked per R11.
- **AC-43 (MTS-09):** Given Cash received below the amount due, when I confirm, then it's blocked per R10.

**US-19 (UR-29):** Close the table.
- **AC-44:** Given payment is completed, then the table shows Paid. One tap resets it to Empty, and the paid bill stays in the day's records.
- **AC-45:** Given a Dine-in order in Ordering, when the Bill screen is opened, then the table shows Bill Requested. When an item is then added, the table returns to Ordering (R12).
- **AC-81 (duplicate submit):** Given a bill on the payment step, when Confirm payment is triggered twice in quick succession (a double tap), then exactly one paid bill is created and exactly one bill number is used.

### 3.8 Receipt

**US-20 (UR-31, UD-10):** Print the receipt.
- **AC-46:** Given a paid bill, when I print, then a receipt prints through the browser print or Save as PDF dialog, in a layout that fits 80 mm thermal paper and also prints legibly on A4, with no clipped text. The header is centred and the price column aligned.

**US-21 (UR-32, UR-33, UR-35):** Receipt content.
- **AC-47:** Given Settings details, then the header shows restaurant name, SSM no., address and phone, plus the SST registration no. only when SST is on.
- **AC-48:** Given a paid bill, then the body shows the split breakdown (per AC-39) if the bill was split, and also bill no., date/time (MYT), table or takeaway no., each non-voided line with qty, unit price and line amount, every totals line from AC-20, the payment method(s), and cash received and change for Cash payments.
- **AC-49:** Given the first three bills on 2026-10-01, then they're numbered B-20261001-0001, -0002 and -0003, and numbering restarts at -0001 on the next day. Numbers are never reused. If UR-30 is delivered, a voided bill keeps its number. If it isn't, that clause is N/A.

### 3.9 End-of-day summary

**US-22 (UR-36, UR-37, UR-38):** As the owner, I review a day's sales.
- **AC-50:** Given a selected date, then the summary shows: number of bills, gross sales (sum of Subtotal), total discount, total SC, total SST, total rounding and net sales. Each figure equals the sum over that day's non-voided paid bills [ASSUMPTION A-20].
- **AC-51:** Given the same date, then bill count and net sales are broken down by each payment method and by Dine-in vs Takeaway. Each breakdown's net sales add up exactly to the overall net sales (the sum of Grand Totals), and its bill counts add up to the overall bill count.
- **AC-52:** Given voided items that day, then each is listed with time, bill or table reference, amount and reason. The summary always has a **Voided bills** section. It lists each voided paid bill with the same fields if UR-30 (AC-73) is delivered, and otherwise shows "None" (D-02).
- **AC-53:** Given a date with no bills, then the summary shows zero values and no error.

### 3.10 Settings and data

**US-23 (UR-41):** One Settings screen.
- **AC-54:** Given Settings, then I can edit restaurant details (name, SSM no., address, phone, SST reg. no.), tables, menu, SC (rate and on/off per order type), SST (rate, on/off, and whether it includes SC), rounding on/off, and the receipt footer. Saved changes apply to every unpaid order, and paid bills are unchanged (R13).

**US-24 (UR-42):** Data survives refresh.
- **AC-55 (MTS-10):** Given an open order mid-entry, when I refresh or restart the browser, then the order, table status, settings, menu and all bills are unchanged.

**US-25 (UR-44):** Safe reset.
- **AC-56:** Given "Reset all data", when I trigger it, then a confirmation step is required. If I cancel, nothing changes. If I confirm, all data returns to the defaults.

### 3.11 Look and feel (Must)

- **AC-57 (UD-01, UD-05, UD-10):** Given the build, then screenshots of all 7 screens (Table grid, Ordering, Bill, Split bill, Receipt, EOD summary, Settings) are committed. On each screen, card elements have a corner radius > 0 and a non-none shadow. The owner's visual approval is a separate sign-off (SM-09), not a QA gate.
- **AC-58 (UD-02):** Given the theme's design tokens, when the primary colour token alone is changed, then every primary-coloured element updates. This is the QA-tested part. Whether the default palette is warm (e.g. deep green or terracotta on a cream background, with one accent colour) is judged by the owner under SM-09, not by QA.
- **AC-59 (UD-03):** Given the bundled web font (which must support Chinese, per UD-03), when any screen renders, then the text uses it with no external font request. The bundled font covers Latin plus a common-Chinese subset, and rarer characters fall back to the system CJK font with no boxes (AC-13) [ASSUMPTION A-26]. The Grand Total (Bill screen) and the running total (Ordering screen) use the largest font size on their screens.
- **AC-60 (UD-04):** Given a 1280×800 landscape viewport (representing a 10–11 inch tablet) and a 1366×768 laptop viewport, then every Must screen works without horizontal scrolling, and every tappable control is at least 44×44 px [ASSUMPTION A-21].

### 3.12 Non-functional (Must)

- **AC-61 (NF-01):** Given the app is running, when network traffic is observed, then there are no runtime calls to external hosts, no login, no backend and no paid service.
- **AC-62 (NF-03):** Given the latest stable Chrome and Edge, then all Must ACs pass in both.
- **AC-63 (NF-04):** Given 200 menu items and 500 bills seeded from a committed fixture, in Chrome at 1280×800 with 4× CPU throttling, then for each screen open and Must action, the 95th-percentile time from input event to next paint over 10 runs is ≤ 300 ms [ASSUMPTION A-22].
- **AC-64 (NF-05):** Given the calculation module (SC, SST, rounding, discount, split), then it's separate from the UI and has automated unit tests covering MTS-01 to MTS-07, W1 to W5, AC-21, AC-29 to AC-32a and AC-35 to AC-38, and all of them pass.
- **AC-65 (NF-06):** Given a fresh copy, when the README steps are followed, then the app opens with no installation (opening `index.html` or using a static server, per URS NF-06).
- **AC-66a (NF-07):** Given a dependency check is executed, then no declared library is unused.
- **AC-66b (NF-07, review only):** Given a code review, then the file structure is clear and readable. This is a code-review verdict, labelled as such, not an executed test.
- **AC-82 (single tab, D-03):** Given the app is open in one tab, when it's opened in a second tab of the same browser, then the second tab shows a blocking "already open in another tab" notice and can't create or change any order or bill.

### 3.13 Should items (lighter ACs, for completeness)

- **AC-67 (UR-04):** An open table shows the minutes elapsed since it was opened, updated at least every minute.
- **AC-68 (UR-05):** Moving an open order to an Empty table moves all lines and frees the source table. Moving to an occupied table is blocked.
- **AC-69 (UR-09):** A Sold Out item can't be added and is visibly marked.
- **AC-70 (UR-10):** Typing "nasi" filters items whose name contains it, case-insensitive, including Chinese characters.
- **AC-71 (UR-16, item-level):** Item-level discounts accept a percentage (0–100) or a fixed RM amount, apply before the bill-level discount, and the total is capped per R3. The bill-level discount is Must (AC-32a).
- **AC-72 (UR-26):** Each sub-bill can record a different payment method, with its own cash received and change for Cash. The EOD breakdown attributes each sub-bill amount to its method.
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
| UR-03 | 06, 07, 07a | | UR-29 | 44, 45, 81 |
| UR-06 | 08 | | UR-31 | 46 |
| UR-07 | 09, 10, 11, 12 | | UR-32 | 47 |
| UR-08 | 13 | | UR-33 | 48 |
| UR-12 | 14, 15 | | UR-35 | 49, 81, 82 |
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
| UR-25 | 35, 38, 39 | | NF-01/03/04/05/06/07 | 61/62/63/64/65/66a, 66b |
| UR-16 (bill-level part, D-01) | 32, 32a | | UR-24 (whole lines) | 36, 38 |

Mandatory Test Scenarios: MTS-01 maps to AC-24, MTS-02 to AC-25, MTS-03 to AC-27, MTS-04 to AC-29, MTS-05 to AC-35, MTS-06 to AC-37, MTS-07 to AC-32, MTS-08 to AC-33, MTS-09 to AC-43, MTS-10 to AC-55, MTS-11 to AC-26 and MTS-12 to AC-13.

## 4. Success metrics

| ID | Metric | Target | How measured |
|---|---|---|---|
| SM-01 | Mandatory Test Scenarios passing with executed evidence | 12 of 12 | QA run log committed on `dev` |
| SM-02 | Must ACs passing | 100% of Must ACs (AC-01 to AC-66b, plus AC-07a, AC-32a, AC-81 and AC-82) | QA AC checklist with evidence |
| SM-03 | Calculation unit tests | 100% pass, 0 floating-point mismatches across all fixed cases plus ≥1,000 generated cases checked against an independent reference | Automated test output |
| SM-04 | Split integrity | 0 cases where the sum of sub-bills differs from the Grand Total, across N = 2–20 and every split-by-item test | Unit tests |
| SM-05 | Screen responsiveness | Every screen and Must action ≤ 300 ms at 200 items and 500 bills | QA timing measurement (AC-63) |
| SM-06 | Order entry speed | A tester opens an Empty table and enters a 5-item order in ≤ 30 s, using ≤ 8 taps excluding quantity changes [ASSUMPTION A-24] | Timed QA walkthrough |
| SM-07 | Checkout speed | From Bill screen to Paid with Cash and change in ≤ 20 s [ASSUMPTION A-24] | Timed QA walkthrough |
| SM-08 | EOD accuracy | EOD figures match a hand-calculated total over a ≥ 20-bill test day exactly, to the sen | QA reconciliation |
| SM-09 | Design acceptance | All 7 required screens provided, and owner approval of look and feel on a tablet. This is the only subjective gate, and it belongs to the owner, not QA. | Release package plus owner sign-off |

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
| [ASSUMPTION A-07] | Superseded by D-01: bill-level discount is Must, and item-level discount is Should. | n/a |
| [ASSUMPTION A-08] | SC and SST are each rounded to the sen with half-up rounding before summing. | 1-sen differences against the accountant's method. Low impact, but it needs confirming. |
| [ASSUMPTION A-09] | Tables with open orders can't be removed in Settings. | Without this block, open orders could be orphaned. |
| [ASSUMPTION A-10] | Takeaway numbers (TA-xxx) restart daily, like bill numbers. | If they should run continuously, it's a minor rule change. |
| [ASSUMPTION A-11] | Superseded by R11 for prices and AC-11 for blank names. | n/a |
| [ASSUMPTION A-12] | Replaced by R13: name and price are snapshotted when a line is added, and rates apply live until payment, then freeze. | If the owner wants rate changes to skip already-open orders, R13 changes from live to opened-at. |
| [ASSUMPTION A-13] | There's no kitchen send step in Phase 1. The commit point is entering Bill Requested (R12). | If the owner wants lines committed earlier, e.g. once the kitchen has them, uncommitted removals would go unaudited. |
| [ASSUMPTION A-14] | Line notes print on the customer receipt. There's no kitchen ticket because the kitchen display is out of scope. | If notes shouldn't appear on the customer receipt, hiding them is a minor change. |
| [ASSUMPTION A-15] | With rounding off, the Rounding line shows 0.00 rather than being hidden. | Cosmetic. |
| [ASSUMPTION A-16] | In a split, by item or equal, SC, SST and rounding are calculated on the whole bill. The Grand Total is allocated to sub-bills in proportion to base_i (or equally), with remainder sen going to sub-bill 1. Sub-bill amounts aren't 5-sen rounded, so cash for a sub-bill may not be a 5-sen multiple. | If each sub-bill must be a 5-sen-rounded bill of its own, the split total could differ from the Grand Total, which conflicts with UR-25. It needs an owner decision. |
| [ASSUMPTION A-17] | A split bill keeps one bill number and prints one receipt, with sub-bills labelled /1, /2 and so on. | If each guest needs a separate receipt, a per-sub-bill receipt format is needed (scope change). |
| [ASSUMPTION A-18] | One payment method per bill is Must, and per-sub-bill methods are Should (UR-26). | Without UR-26, mixed-method tables are recorded under one method, so the EOD method breakdown is less precise. |
| [ASSUMPTION A-19] | Superseded by R12: Bill Requested is set only by opening the Bill screen. | n/a |
| [ASSUMPTION A-20] | Gross sales = sum of Subtotals, and net sales = sum of Grand Totals, over non-voided paid bills. | The owner's accountant may define net differently (e.g. excluding SST). It should be confirmed. |
| [ASSUMPTION A-21] | 1280×800 is the reference tablet viewport and 1366×768 the reference laptop viewport. | Layout issues on other tablet sizes. |
| [ASSUMPTION A-22] | The 300 ms target is measured per AC-63, with Chrome 4× CPU throttling standing in for a mid-range tablet (QA's method). | Real low-end tablets may be slower than the throttled baseline. |
| [ASSUMPTION A-23] | CSV opens in Excel with Chinese text intact (UTF-8 readable by Excel). | Garbled names in Excel. |
| [ASSUMPTION A-24] | SM-06 and SM-07 time targets are PM-set benchmarks, not URS requirements. | The targets may need recalibrating after the pilot. They aren't release gates. |
| [ASSUMPTION A-25] | The table count limit is 1–50. The URS says about 10–25 tables. | A restaurant with more than 50 tables would need the limit raised, which is a minor change. |
| [ASSUMPTION A-26] | The bundled font is a common-Chinese subset (SA estimate 1–2 MB), and rare characters fall back to the system CJK font. | Those rare characters may look slightly different from the rest of the text. That's cosmetic, and there are no missing glyphs. |
| [ASSUMPTION A-27] | There's no data-retention target in the URS. SA designs storage for at least 5,000 bills. This is a design target, not a new requirement. | Heavy-volume restaurants may need backup and reset sooner (RK-06). |
| [ASSUMPTION A-28] | Daily rollover for bill numbers, takeaway numbers and EOD dates happens at midnight device time (MYT). | If the restaurant trades past midnight, late bills fall on the next date. |

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

- **SA:** Please confirm that R1–R13 and A-16 can be designed against without guessing, or raise an issue. I'll answer it or escalate it to the owner. Approved at v0.2.
- **QA:** Please confirm that every Must AC can be tested (AC-01 to AC-66b plus AC-07a, AC-32a, AC-81 and AC-82, 71 in total) and that the mapping from MTS to ACs is complete. Approved at v0.2.

## 7. Change log

| Version | Commit | Changes |
|---|---|---|
| v0.1 | `15607e3` | First draft. |
| v0.2 | `9e65c78` | **SA review items:**<br>1. Added R12 for the order and line lifecycle, and rewrote AC-15 and AC-45.<br>2. Added AC-07a for the takeaway flow.<br>3. Added R13 for snapshots and live settings, and rewrote AC-12, AC-23 and AC-28.<br>4. Made bill-level discount Must (D-01) and added AC-32a.<br>5. Rewrote AC-34, AC-36, AC-38, AC-39 and AC-41 for the split rules.<br>6. Rewrote AC-52 (D-02).<br>7. Added the font subset to AC-59 (A-26).<br>8. Clarified that R5 uses the rounded SC.<br>**QA review items:**<br>1. Added W5 and the no-empty-sub-bill rule.<br>2. Added the 8-row rounding table to AC-29.<br>3. Defined R10 for blocked actions.<br>4. Added R11 for input validation.<br>5. Added AC-81 for duplicate submit.<br>6. Added AC-82 for the single-tab guard (D-03).<br>7. Rewrote AC-57 and AC-59, and split AC-66 into AC-66a and AC-66b.<br>8. Defined the AC-51 breakdowns to add up to net sales.<br>Also used QA's AC-63 method, and logged A-25 to A-28. |
| v0.3 | this commit | Editorial fixes from the SA and QA v0.2 approvals:<br>- AC-54 now matches R13.<br>- A-11 is marked superseded.<br>- §6 has the correct AC range.<br>- AC-58's palette clause moves to SM-09.<br>- AC-49 marks the voided-bill clause N/A when UR-30 isn't delivered.<br>- AC-09 is reworded for D-04.<br>No other requirement changed. |

## 8. Decision log (scope-affecting, not silent)

| ID | Decision | Reason | Escalate to July? |
|---|---|---|---|
| D-01 | Bill-level discount (part of UR-16) moves from Should to Must. Item-level discount stays Should. | MTS-07 is mandatory (URS §8) and can't be run without a discount. | Listed in the Final Delivery Package for confirmation. |
| D-02 | The UR-38 voided-bills list is Must, but stays empty ("None") unless UR-30 is delivered. | UR-38 (Must) depends on UR-30 (Should). This keeps both priorities as the URS set them. | Listed in the Final Delivery Package. |
| D-03 | Add a single-tab guard (AC-82). | It protects UR-35 bill numbering and adds no user feature. Requested by QA, with SA confirming it's cheap. | Listed in the Final Delivery Package. |
| D-04 | The default menu ships as strict JSON inside a single line of code, rather than a bare `.json` file. Plain `.json` import and export happen in Settings (AC-09). | Browsers block reading a local `.json` file when the app is opened from disk, and the URS requires opening `index.html` with no installation (NF-06). Raised by SA as AD-04, and QA accepts it because it's testable. | Yes, because it deviates from the UR-07 wording "config file (JSON)". Listed in the Final Delivery Package. |
