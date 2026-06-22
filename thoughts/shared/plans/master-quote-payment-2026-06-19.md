# Master-Quote Payment System — Implementation Plan

**Date:** 2026-06-19 · **Branch:** `june-18-version` · **Status:** Plan (no code changes yet — awaiting approval)

## 1. Target model (Raahil's spec)

1. Homeowner creates a project → receives **one MASTER quote** for the whole project (e.g. $50k).
2. The system decides **how much each trade gets paid**, then dispatches a request to each trade.
3. Each trade accepts → when **all** trades accept, the project begins.
4. Homeowner pays **WalkerAI once** (not the trades). Funds held in escrow / WalkerAI balance.
5. Trades do the work → submit **photos** → homeowner **approves** each job was done properly.
6. WalkerAI then **pays the trades**.
7. **No commission line, no percentage breakdown shown** to the homeowner. WalkerAI's margin is the implicit gap between the master price and the sum of trade payouts.

**Decided:** trade payouts derived from the **AI per-trade cost** (already exists — see §2).

## 2. Current architecture (what exists today, with file refs)

- **`generate-trade-slots/index.ts`** — AI ("renovation project manager" prompt) determines required trades and a per-trade cost range, weighted to the project total. Each `project_slots` row already carries `estimated_cost_min` / `estimated_cost_max` (CAD cents). **← per-trade cost source already exists.**
- **`dispatch-job` / `dispatch-slots` / `expand-dispatch`** — send slot requests to companies (`dispatch_logs`, `response` pending→filled).
- **`accept-job/index.ts:415-497`** — on slot acceptance, auto-creates a **per-company quote at the WHOLE-project `avgCost`** (`total_amount: avgCost`, `commission_rate: 0.10`), plus 30/40/30 milestones and line items. **BUG vs spec:** ignores per-slot cost; N trades ⇒ N quotes each at the full project estimate.
- **`src/app/(homeowner)/project/[id]/quote.tsx`** — shows per-trade quotes, "**fund each contractor quote separately**" (`:411`), a "Cost Breakdown" with labour/material line items, and milestone percentages. Pays **one PaymentIntent per quote**.
- **`create-payment-intent/index.ts`** — one PI = a single quote's `total_amount`, immediate capture to platform balance.
- **`stripe-webhook/index.ts`** (`payment_intent.succeeded`) — marks that quote `approved`; project → `active` once **all filled slots have approved quotes**.
- **`release-milestone/index.ts`** — per-milestone Stripe transfer to the company's Connect account, **10% commission deducted**, HST computed; project completion when all milestones across all approved quotes are paid.
- **Separate, leave as-is:** `supplier-payout` (material orders), `gc-concierge-payout` / `create-gc-concierge-payment-intent` (GC concierge).

## 3. Target architecture

### 3.1 Quote / payout model
- **One master quote per project.** Homeowner-facing total = `project.master_total_cents`.
- **Per-trade payout** locked at acceptance from the slot's AI estimate (avg of `estimated_cost_min/max`).
- **WalkerAI margin is implicit:** `master_total = Σ(trade payout) + margin`. Two equivalent ways to source margin (see Open Decision D1):
  - (a) `master_total = project ai_cost` (homeowner price); `trade_payout = slot_cost × (1 − margin_pct)`. Reuses today's ~10% economics, just hidden. **(Recommended.)**
  - (b) `trade_payout = slot_cost`; `master_total = Σ(slot_cost) × (1 + margin_pct)`.
- **Nothing about commission / percentages is shown to the homeowner.**

### 3.2 Payment flow
- **Gate:** homeowner can pay only once **all required slots are filled** (all trades accepted).
- **One PaymentIntent** for `master_total_cents` → captured to WalkerAI platform balance (escrow). `create-payment-intent` becomes **per-project** (compute master from slots), not per-quote.
- `stripe-webhook` `payment_intent.succeeded` for the master PI → `project.payment_status = 'funded'`, project `active` (or `scheduling` per existing schedule gate).

### 3.3 Release flow (pay the trades)
- Per-trade: homeowner reviews that trade's completion **photos** → **approves** → release that trade's payout via Stripe transfer to its Connect account.
- Reuse the hardened release path (dispute gate, payout-readiness assertion, idempotency key, `> 0` guard). New fn **`release-trade-payout`** keyed by slot/company, replacing per-milestone-percentage releases for trade work.
- Spec implies **one completion payout per trade** (not the homeowner-visible 30/40/30). Internal milestone scheduling can be dropped or collapsed (see Open Decision D2).

### 3.4 Data model changes (new migration)
- `projects`: `master_total_cents int`, `payment_status text` (`unpaid|funded|...`), optional `platform_margin_pct numeric` (or a global config row).
- `project_slots`: `payout_cents int` (locked at acceptance), `payout_status text` (`pending|approved|paid`), `stripe_transfer_id text`, `completion_photo_*` / approval fields if not already present.
- Keep `quotes`/`milestones` tables during transition (back-compat) → migrate or fence existing in-flight projects.

### 3.5 UI changes
- **Homeowner `quote.tsx`:** replace per-quote funding + Cost Breakdown + line items + milestone %s with a single master price and "**Pay $X to WalkerAI to start**." Remove all commission/percentage UI. Add escrow/approval explainer.
- **Homeowner approval screen** (`milestones.tsx` or new): per-trade "review photos → approve → pays the trade." No percentage schedule.
- **Company side:** show the company **its own payout figure** and "paid on completion/approval"; do **not** show the master/homeowner price (Open Decision D3).

## 4. Decisions (RESOLVED 2026-06-21)
- **D1 — Margin:** ✅ **Model (a), 10%, hidden.** `master_total` = homeowner price; `trade_payout = slot_cost × (1 − 0.10)`. Same economics as today, never shown to homeowner.
- **D2 — Release granularity:** ✅ **One payout per trade on completion.** Drop the homeowner-visible 30/40/30 milestone schedule for trade work.
- **D3 — Company payout visibility:** ✅ **Yes — each trade sees its own payout only.** Never the master/homeowner price.
- **D4 — In-flight projects:** ✅ **Fence existing; new model for new projects only.** Old per-quote projects are disposable (likely to be deleted) — no migration script. Tag projects with a payment-model flag so each runs its own path.
- **D5 — Scope:** ✅ **Supplier material-orders and GC-concierge flows are OUT OF SCOPE (unchanged).** `supplier-payout`, `gc-concierge-payout`, `create-gc-concierge-payment-intent` left as-is.

## 5. Phased rollout
- **A.** ✅ Migration: master/margin fields + per-slot payout fields. `20260621000000_master_quote_payment_phase_a.sql` (+`master_payment_intent_id`). **Not yet pushed to live DB.**
- **B.** ✅ `accept-job`: master-only payout lock (`payout_cents = avg(estimate) × (1−margin)`, idempotent); legacy path skips auto-quote for master projects.
- **C.** ✅ `create-payment-intent` → per-project master PI (project_id, no quote_id), all-slots-filled gate, master_total = avg(ai_cost) floored at Σ payouts; `stripe-webhook` master branch sets `payment_status='funded'` + activates via shared `activateProjectAfterPayment` helper + notifies homeowner/companies.
- **D.** ✅ `release-trade-payout` edge fn (master-only): homeowner approves a trade → transfers locked `payout_cents` (no commission math; margin already removed at acceptance) to the company Connect account. Guards: payment_model=master, payment_status=funded, ownership, no dispute, `completion_submitted_at` set, photo evidence at `{projectId}/slots/{slotId}/…` (or `[slot:{id}]` msg fallback), Stripe payout-ready, payout>0, idempotent on `stripe_transfer_id` (key `trade-payout-{slot_id}`). Completes project when all slots paid (respects active-GC-management gate). Self-contained (no _shared dir).
- **E.** ✅ UI (all branch on `payment_model`, legacy untouched, pre-migration missing-column fallbacks):
  - E1 `quote.tsx` — master view: single project total + "Pay $X to WalkerAI", trades by name/status only (no amounts), strip breakdown/%/commission; calls create-payment-intent w/ project_id.
  - E2 homeowner `milestones.tsx` — per-trade approval (photos at `slots/{id}/`, Approve & Release → release-trade-payout, no $ shown per D3), trade-level dispute.
  - E3 company `milestones.tsx` — slot Mark Complete (sets completion_submitted_at + photo to `slots/{id}/`), shows own payout only.
  - E4 `schedule.tsx` — master projects activate on `payment_status='funded'`, not quote approval.
- **F.** ✅ Closeout:
  - Canonical math `src/lib/master-quote.ts` (computeTradePayoutCents, computeMasterTotalCents) + 12 jest tests (margin, rounding, Σ payouts ≤ master invariant). Edge fns carry inline copies (Deno can't import src/) with pointer comments; quote.tsx uses `averageCostCents`.
  - Legacy per-quote/milestone paths kept (legacy projects still run them) but fully fenced — every entry point gates on `payment_model`; master never reaches them.
  - **Cutover** lives at `supabase/manual/cutover_master_payment_model.sql` (NOT in migrations/, so `db push` won't auto-apply): flips `payment_model` default to 'master'. Run manually only after Phase A migration + functions + master-UI app build are all live.
  - Updated 3 source-guard test assertions to match refactors (extracted `activateProjectAfterPayment`, `needs_quote` master gate, `let nextProjectStatus`). Full suite 379 passing.

## 7. Rollout order (one clean rollout — NOT yet executed)
1. Ship the app build with the master-quote UI (Phase E) to TestFlight/App Store.
2. `supabase db push` the Phase A migration (inert: default 'legacy').
3. `supabase functions deploy` accept-job, create-payment-intent, stripe-webhook, release-trade-payout.
4. Verify in prod (still all-legacy behavior — nothing changed).
5. Apply `supabase/manual/cutover_master_payment_model.sql` → new projects become master.

**Pre-rollout blocker:** reconcile prod migration drift — remote has `20260619033435` with no local file. Run `supabase db pull` (or capture it) before pushing; do NOT fabricate an empty placeholder (it would hide a real schema change on a rebuild).

## 6. Risks
- Real-money logic — needs unit tests (master total math, Σ payouts ≤ master, margin, rounding).
- Live projects mid-flow during cutover (D4).
- Stripe escrow/platform-balance timing for trade transfers.
- Touches the same files just audited; re-verify guards survive the refactor.
