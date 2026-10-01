# User Requirements Specification (URS)
## Restaurant Mini POS — Malaysia (Phase 1 Pilot)

| Item | Value |
|---|---|
| Document | URS v1.0 |
| Date | 2026-10-01 |
| Owner | Mclink Group (human owner) |
| Audience | Product Manager, Solution Architect, Implementation Engineer, QA, Release Reviewer |
| Status | APPROVED by human owner — input to Stage 1 (PRD) |

> This URS describes **what the business needs**, not how to build it. The Product Manager turns it into the PRD. If anything here is ambiguous, follow the Charter: pick the most reasonable option, log it as an assumption, and continue.

---

## 1. Background

A small-to-medium restaurant in Malaysia (about 10–25 tables, dine-in and takeaway) needs a simple, good-looking ordering and billing tool that runs on one tablet or PC at the counter. Staff are not technical. Today orders are written by hand and bills are calculated manually, which causes calculation errors, slow checkout, and no clear end-of-day summary.

## 2. Objectives

1. Take orders by table quickly and accurately.
2. Produce a correct Malaysian bill (service charge, SST, 5-sen rounding) every time.
3. Split bills without errors.
4. Give the owner a clear end-of-day sales summary.
5. Look modern and professional — the owner should be proud to show it to customers.

## 3. Users

| User | Needs |
|---|---|
| Waiter | Open a table, add items quickly, add notes for the kitchen |
| Cashier | Show the bill, split it, record payment method, close the table |
| Owner / Manager | Configure menu, prices, tax and charges; view end-of-day summary |

## 4. Scope

### In scope (Phase 1)
- Table management, ordering, billing, split bill, payment recording, receipt printing, end-of-day summary, settings.
- Runs entirely in the browser on one device.

### Out of scope (Phase 1)
- Real payment processing (card terminal, DuitNow QR, e-wallet integration) — payment method is **recorded only**.
- Kitchen display, multi-device sync, online ordering, delivery platforms (GrabFood, foodpanda).
- LHDN MyInvois e-Invoice submission.
- Inventory, recipes, membership/loyalty, staff login.
- Backend server or database.

## 5. Functional Requirements

Priority: **M** = Must, **S** = Should, **C** = Could.

### 5.1 Tables and order types
| ID | Requirement | Priority |
|---|---|---|
| UR-01 | Show all tables in a grid with clear status: Empty, Ordering, Bill Requested, Paid. Status uses colour **and** a text label. | M |
| UR-02 | Number of tables and table names are configurable (default: 20 tables, T1–T20). | M |
| UR-03 | Support order types: **Dine-in** (linked to a table) and **Takeaway** (auto number, e.g. TA-001). | M |
| UR-04 | Show elapsed time since a table was opened. | S |
| UR-05 | Move an open order from one table to another. | S |

### 5.2 Menu
| ID | Requirement | Priority |
|---|---|---|
| UR-06 | Menu has categories (e.g. Rice, Noodles, Beverages, Desserts) and items with name, price (RM), and optional image. | M |
| UR-07 | Menu is loaded from an editable config file (JSON) and can be edited in a Settings screen. | M |
| UR-08 | Item names support English, Bahasa Malaysia, and Chinese characters (e.g. "Nasi Lemak 椰浆饭"). | M |
| UR-09 | Items can be marked **Sold Out** so they cannot be ordered. | S |
| UR-10 | Search menu items by name. | S |
| UR-11 | Simple modifiers (e.g. Less Spicy, No Ice, Add Egg +RM1.00). | C |

### 5.3 Ordering
| ID | Requirement | Priority |
|---|---|---|
| UR-12 | Add an item with one tap; change quantity with +/−. | M |
| UR-13 | Add a free-text note to any line item. | M |
| UR-14 | Void an item already ordered; a reason must be selected or typed. Voided items remain visible (struck through) and are excluded from totals. | M |
| UR-15 | Running total visible at all times while ordering. | M |
| UR-16 | Item-level and bill-level discount (percentage or fixed RM). | S |

### 5.4 Bill calculation (Malaysia)
| ID | Requirement | Priority |
|---|---|---|
| UR-17 | Bill shows: Subtotal, Discount, Service Charge, SST, Rounding Adjustment, Grand Total. | M |
| UR-18 | **Service charge** rate is configurable (default **10%**), can be turned on/off, and can be set separately for Dine-in and Takeaway (default: Takeaway has no service charge). | M |
| UR-19 | **SST (service tax)** rate is configurable (default **6%**, the F&B service tax rate) and can be turned off for restaurants not registered for SST. | M |
| UR-20 | Whether SST is calculated on (Subtotal − Discount) only, or on (Subtotal − Discount + Service Charge), is a configurable setting. Default: **includes service charge**. | M |
| UR-21 | **Rounding:** Grand Total is rounded to the nearest **5 sen** (Malaysian rounding mechanism). The rounding adjustment is shown as its own line (e.g. "Rounding −0.02"). Rounding can be turned off in Settings. | M |
| UR-22 | All money shown as `RM 0.00`. Calculations must not produce floating-point errors (e.g. RM 0.1 + 0.2 must equal RM 0.30). | M |

> Tax rates and rules change. All rates and the calculation order are **settings, not hard-coded**. The owner will confirm the correct values with their accountant before real use.

### 5.5 Split bill
| ID | Requirement | Priority |
|---|---|---|
| UR-23 | Split equally by N persons (2–20). | M |
| UR-24 | Split by item (assign each line to a person/sub-bill). | M |
| UR-25 | The sum of all split amounts must **exactly** equal the Grand Total. Any remaining sen is assigned to the first sub-bill and shown clearly. | M |
| UR-26 | Each sub-bill can be paid with a different payment method. | S |

### 5.6 Payment and closing
| ID | Requirement | Priority |
|---|---|---|
| UR-27 | Record payment method: **Cash, Card, DuitNow QR, Touch 'n Go eWallet, GrabPay, Other**. (Recording only, no integration.) | M |
| UR-28 | For Cash: enter amount received, show change due. | M |
| UR-29 | After payment, table status becomes Paid; one tap resets it to Empty. | M |
| UR-30 | A paid bill cannot be edited. It can be **voided** with a reason, and appears as voided in the daily summary. | S |

### 5.7 Receipt
| ID | Requirement | Priority |
|---|---|---|
| UR-31 | Print-friendly receipt (fits 80 mm thermal paper and A4) via browser print / Save as PDF. | M |
| UR-32 | Receipt header (from Settings): restaurant name, company registration no. (SSM), address, phone, SST registration no. (shown only if SST is on). | M |
| UR-33 | Receipt body: bill no., date/time, table or takeaway no., items, quantities, prices, all totals lines from UR-17, payment method, change. | M |
| UR-34 | Footer text configurable (default: "Thank you! Terima kasih! 谢谢!"). | S |
| UR-35 | Bill numbers are sequential per day, e.g. `B-20261001-0001`. | M |

### 5.8 End-of-day summary
| ID | Requirement | Priority |
|---|---|---|
| UR-36 | Show for a selected date: number of bills, gross sales, total discount, total service charge, total SST, total rounding, net sales. | M |
| UR-37 | Breakdown by payment method and by order type (Dine-in / Takeaway). | M |
| UR-38 | List of voided items and voided bills with reasons. | M |
| UR-39 | Top 10 best-selling items by quantity. | S |
| UR-40 | Export the day's bills to CSV (opens correctly in Excel). | S |

### 5.9 Settings and data
| ID | Requirement | Priority |
|---|---|---|
| UR-41 | Settings screen for: restaurant details, tables, menu, service charge, SST, rounding, receipt footer. | M |
| UR-42 | All data stays after a page refresh or browser restart (stored in the browser). | M |
| UR-43 | Backup: export all data to one file; restore from that file. | S |
| UR-44 | "Reset all data" requires a confirmation step. | M |

## 6. Look and Feel (Design Requirements)

The owner's priority is that the system **looks beautiful and modern**, while staying fast to use during a busy lunch.

| ID | Requirement | Priority |
|---|---|---|
| UD-01 | Clean, modern design with generous spacing, rounded cards, and soft shadows — similar in feel to modern café POS apps. | M |
| UD-02 | Warm, appetising colour palette (e.g. deep green or terracotta as primary, cream/off-white background). One accent colour for primary actions. Defined as design tokens so the theme can change in one place. | M |
| UD-03 | Clear typography using a free web font that supports Chinese characters (e.g. Noto Sans / Noto Sans SC). Prices and totals large and easy to read. | M |
| UD-04 | Optimised for a **10–11 inch tablet in landscape**; also usable on a laptop. Touch targets at least 44×44 px. | M |
| UD-05 | Menu items shown as cards with image (or a tasteful placeholder icon if no image), name, and price. | M |
| UD-06 | Table status colours are distinguishable for colour-blind users (colour + label/icon). | M |
| UD-07 | Light mode required; dark mode optional. | C |
| UD-08 | Smooth, subtle feedback when adding items (brief highlight or animation, no lag). | S |
| UD-09 | UI language: English labels by default; Bahasa Malaysia as a switchable option. | S |
| UD-10 | Receipt layout is neat and professional, centred header, aligned price column. | M |

**Design acceptance:** The Release Reviewer must include screenshots (or exact instructions to view each screen) of: Table grid, Ordering screen, Bill screen, Split bill, Receipt, End-of-day summary, Settings.

## 7. Non-Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| NF-01 | Plain HTML, CSS, JavaScript. No backend, no login, no paid services, no external API calls at runtime (web fonts may be bundled locally). | M |
| NF-02 | Works offline after first load. | S |
| NF-03 | Runs in the latest Chrome and Edge; Safari on iPad nice-to-have. | M |
| NF-04 | Any screen responds within 300 ms with 200 menu items and 500 bills stored. | M |
| NF-05 | All calculation logic (service charge, SST, rounding, discount, split) in a separate module with automated unit tests. | M |
| NF-06 | Opening the app requires no installation: open `index.html` or a static web server. A README explains how. | M |
| NF-07 | Code is readable with clear file structure; no unused libraries. | M |

## 8. Mandatory Test Scenarios (minimum for QA)

QA must include at least these cases, each with expected values calculated independently:

1. Dine-in RM 100.00, service charge 10%, SST 6% on (subtotal + service charge) → SC 10.00, SST 6.60, total 116.60.
2. Same order with SST calculated on subtotal only → SC 10.00, SST 6.00, total 116.00.
3. Takeaway RM 25.00, no service charge, SST 6% → SST 1.50, total 26.50.
4. Rounding: totals ending in .01, .02, .03, .04, .06, .07, .08, .09 round to the nearest 0.05 correctly; rounding line shown.
5. Split RM 100.00 equally among 3 → amounts sum exactly to RM 100.00.
6. Split by item where one item is voided → voided item excluded.
7. 100% discount → total RM 0.00, no negative tax.
8. Empty order → cannot proceed to payment.
9. Cash received less than total → blocked with clear message.
10. Refresh the browser mid-order → order is still there.
11. SST turned off → no SST line, no SST number on receipt.
12. Item names with Chinese characters print correctly on the receipt.

## 9. Acceptance by the Human Owner

The owner will APPROVE the final delivery only if:
- All **Must** requirements are met, with evidence.
- All Mandatory Test Scenarios pass with **executed** results (not code review only).
- The UI matches Section 6 and looks professional on a tablet.
- The Assumptions Log is short and clearly lists any rate or rule the owner must confirm.

## 10. Known Assumptions to Confirm Later

| ID | Assumption |
|---|---|
| A-01 | F&B service tax default 6%; owner to confirm with accountant before live use. |
| A-02 | Service charge default 10% on dine-in only. |
| A-03 | SST is calculated on subtotal + service charge by default. |
| A-04 | 5-sen rounding applies to the final total for all payment methods by default (configurable). |
| A-05 | e-Invoicing (MyInvois) is not required for Phase 1. |
