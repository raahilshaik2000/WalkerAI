# WalkerAI — Development Progress & Context

> Last updated: 2026-04-30
> Active branch: `april-27-branch`

---

## App Overview

React Native (iOS primary) renovation platform with 3 account types:
- **Homeowner** — creates projects, reviews quotes, pays via Stripe escrow
- **Company (Contractor)** — receives dispatched jobs, accepts slots, submits progress
- **Supplier** — fulfills material orders at AI-fixed prices

**Stack:**
- React Native + TypeScript
- Supabase (Postgres + Edge Functions + Realtime + Storage)
- Zustand for state (`project-wizard.store.ts`, `auth.store.ts`, `profile.store.ts`)
- Stripe Connect Express (contractor/supplier payouts, 10% platform commission)
- OpenAI GPT-4o for AI analysis, brief generation, trade slot generation
- Apple RoomPlan API (`RoomPlanModule`) for LiDAR on iOS
- React Navigation (stack + bottom tabs — NOT Expo Router)

---

## Navigation Architecture

All screens registered in: `src/navigation/RootNavigator.tsx`

Key navigators:
- `HomeownerNavigator` — wraps `HomeownerStack` (includes `RoomScan`, `RoomResults`)
- `ProjectCreateNavigator` — wizard steps: RoomType → Photos → Measurements → Analyzing → Questionnaire → Renders → Brief → MaterialDetail → Address → Confirm
- `ProjectDetailNavigator` — `ProjectDetailMain`, `Quote`, `Milestones`, `Messages`, `Permits`, `ChangeOrders`, `Review`, `Materials`
- `JobDetailNavigator` — `JobDetailMain`, `JobChangeOrders`, `JobMessages`, `JobMilestones`, `QuoteBuilder`
- `CompanyNavigator` — wraps `CompanyStack`
- `SupplierNavigator` — in `src/navigation/SupplierNavigator.tsx`

---

## Database Migrations (in order)

| File | Contents |
|------|----------|
| `001_initial_schema.sql` | users, companies, projects, quotes, milestones, messages, dispatch_logs, `atomic_accept_job()`, `companies_within_radius()` |
| `002_corrections.sql` | misc fixes |
| `003_reviews_and_fixes.sql` | reviews, ratings triggers |
| `004_nullable_address.sql` | address nullable |
| `005_stripe_commission.sql` | commission fields on quotes |
| `006_storage_buckets.sql` | storage bucket policies |
| `007_supplier_portal.sql` | suppliers, supplier_catalog, material_orders, material_order_bids, `suppliers_within_radius()` |
| `008_storage_policies.sql` | storage RLS |
| `009_trade_slots.sql` | ✅ NEW — see below |

### 009_trade_slots.sql — What it adds:
- `trade_type` enum: `general_contractor`, `plumber`, `electrician`, `tile_installer`, `cabinet_installer`, `painter`, `flooring_installer`, `drywall`, `demolition`
- `project_slots` table — one row per trade required for a project
- `companies.trade_types trade_type[]` — which trades a company handles
- `companies.primary_trade trade_type`
- `dispatch_logs.slot_id` — links dispatch to a specific slot
- `projects.scheduling_status` — `pending_homeowner` | `confirmed`
- `projects.scheduled_start_date`
- `projects.status` extended with `'scheduling'` value
- `materials.verified_quantity`, `verified_by`, `verified_at` — contractor verification
- `quote_line_items` table — labour/material/other line items per quote
- `atomic_accept_slot(p_slot_id, p_company_id)` — locks slot, accepts it, checks if all slots filled → sets project to `scheduling`
- `atomic_claim_material_order(p_order_id, p_supplier_id)` — locks order, sets supplier as accepted
- RLS for `project_slots` and `quote_line_items`

---

## Key Data Shapes

### `project_slots` row
```typescript
{
  id: string;
  project_id: string;
  trade_type: TradeType;
  description: string;
  estimated_cost_min: number;  // CAD cents
  estimated_cost_max: number;  // CAD cents
  status: 'open' | 'dispatching' | 'filled' | 'scheduled';
  assigned_company_id: string | null;
  accepted_at: string | null;
  scheduled_start_date: string | null;  // YYYY-MM-DD
  scheduled_end_date: string | null;
}
```

### LiDAR `scanData` (from `RoomPlanModule`)
```typescript
{
  walls: { id, width, height }[];
  doors: { id, width, height }[];
  windows: { id, width, height }[];
  objects: { id, category, width, height, depth }[];
  roomDimensions: { length, width, height, area };  // ALL IN METERS
  usdzFilePath: string;
  isMock: boolean;
}
```

### `RoomMeasurements` store shape (in `project-wizard.store.ts`)
```typescript
{
  lengthFt: string;
  widthFt: string;
  ceilingHeightFt: string;
  numDoors: string;
  numWindows: string;
  hasIsland?: boolean;
  // + many extended fields (cabinet dims, countertop, appliances, island)
}
```

Conversion: LiDAR meters → feet = `value * 3.28084`

---

## Edge Functions

| Function | Status | Description |
|----------|--------|-------------|
| `analyze-photos` | existing | GPT-4o vision analysis of room photos |
| `dispatch-job` | existing (legacy) | single-contractor dispatch (superseded by dispatch-slots) |
| `dispatch-slots` | ✅ NEW | dispatches each open slot to trade-matching companies within radius |
| `generate-trade-slots` | ✅ NEW | GPT-4o determines required trades, inserts `project_slots` rows |
| `accept-job` | ✅ UPDATED | now handles `slot_id` param → `atomic_accept_slot()`, plus legacy `project_id` path |
| `claim-material-order` | ✅ NEW | atomic supplier claim at AI-fixed price, notifies homeowner + contractor |
| `generate-material-orders` | existing | creates `material_orders` rows from BOM |
| `generate-project-brief` | existing | generates project brief text |
| `generate-questionnaire` | existing (unused) | AI-conditional questions — wired up in Phase 7 |
| `generate-render` | existing (stub) | needs DALL-E wiring (Phase 6) |
| `create-payment-intent` | existing | Stripe escrow payment |
| `release-milestone` | existing | releases milestone payment to contractor |
| `supplier-payout` | existing | Stripe payout to supplier |
| `stripe-webhook` | existing | handles Stripe events |
| `send-push` | existing | push notifications |
| `create-connect-account` | existing | Stripe Connect onboarding |
| `expand-dispatch` | existing | radius expansion for legacy dispatch |

---

## Screens — What Was Built / Changed

### Phase 1 — LiDAR Integration ✅

| File | Change |
|------|--------|
| `src/app/(homeowner)/project/create/measurements.tsx` | Added "Scan with Camera" cyan card at top → navigates to `RoomScan` with `{ fromWizard: true }`. Added "or enter manually" divider. New styles: `lidarCard`, `lidarIconWrap`, `lidarText`, `lidarTitle`, `lidarSub`, `orRow`, `orLine`, `orLabel` |
| `src/app/(homeowner)/room-scan.tsx` | Added `useRoute`, reads `fromWizard` from params, passes `fromWizard` through to `RoomResults` on scan complete |
| `src/app/(homeowner)/room-results.tsx` | Added `useProjectWizardStore` import. Added `M_TO_FT = 3.28084`. Added `fromWizard` from route params. Added `handleUseMeasurements()` — maps LiDAR → store shape, calls `setMeasurements()`, navigates to `Analyzing`. Bottom CTA is conditional: `fromWizard=true` → "Use These Measurements", else → "Done" |

### Phase 2 — Trade-Based Slots ✅

| File | Change |
|------|--------|
| `supabase/migrations/009_trade_slots.sql` | NEW — full schema changes (see above) |
| `supabase/functions/generate-trade-slots/index.ts` | NEW — GPT-4o determines required trades, inserts slots |
| `supabase/functions/dispatch-slots/index.ts` | NEW — slot-by-slot dispatch to trade-matching companies |
| `supabase/functions/accept-job/index.ts` | UPDATED — added `slot_id` path using `atomic_accept_slot()`, all-slots-filled triggers `all_slots_filled` notification |
| `src/app/(homeowner)/project/create/confirm.tsx` | UPDATED — now calls `generate-trade-slots` THEN `dispatch-slots` (not `dispatch-job`). Updated copy to reflect trade-based flow |
| `src/app/(homeowner)/project/[id]/schedule.tsx` | NEW — homeowner sets start/end dates per slot, confirms schedule, notifies all contractors, triggers `generate-material-orders` |

### Phase 3 — Contractor Material Verification ✅

| File | Change |
|------|--------|
| `src/app/(company)/job/[id]/materials.tsx` | NEW — contractor views AI material quantities, edits any, saves `verified_quantity` + `verified_by` + `verified_at`, syncs to open `material_orders` |

### Phase 4 — Remove Material Bidding ✅

| File | Change |
|------|--------|
| `supabase/functions/claim-material-order/index.ts` | NEW — atomic supplier claim at fixed price, notifies parties |
| `src/app/(supplier)/orders/index.tsx` | UPDATED — removed entire bid modal, `submitBid`, `bidModal/bidPrice/bidLeadTime/bidNotes` state. Replaced "Place Bid" with "Claim Order" button calling `claim-material-order`. Shows AI-fixed price. |

---

## ✅ ALL 7 PHASES COMPLETE

### What was finished in the second session (2026-04-30)

| Item | Done |
|------|------|
| Register `ProjectSchedule` + `JobMaterials` in `RootNavigator.tsx` | ✅ |
| Contractor `job/[id]/index.tsx` — reads `slot_id` from params, passes to `accept-job`, shows slot trade banner, "Materials" in action grid | ✅ |
| Phase 5 — Quote line items: `quote.tsx` collapsible Labour + Materials sections; `accept-job` populates `quote_line_items` on quote creation | ✅ |
| Phase 6 — Render generation: DALL-E 3 added as fallback when no REimagineHome key; `renders.tsx` removes "coming soon" card, shows real renders | ✅ |
| Phase 7 — Conditional questionnaire: `analyzing.tsx` calls `generate-questionnaire` edge function first, falls back to `getQuestionsForRoomType()` | ✅ |

---

## 🟡 Remaining Suggestions / Polish

### 1. Slot Progress on Homeowner Dashboard
In `src/app/(homeowner)/project/[id]/index.tsx` — the dispatch radar animation shows a generic spinner. Should show individual trade slots filling in (e.g. "Plumber found ✓ — Electrician pending..."). Subscribe to `project_slots` via Supabase realtime (`postgres_changes`).

### 2. Notification Deep Link → Schedule Screen
The `all_slots_filled` notification deep link is `/(homeowner)/project/${project_id}/schedule`. The app needs to parse this and navigate to `ProjectSchedule` (registered in `ProjectDetailNavigator`). Currently just navigates to the project detail screen.

### 3. Apply Migration to Supabase
`009_trade_slots.sql` has NOT been applied to production/staging yet. Run via Supabase CLI:
```bash
supabase db push
```
or apply manually in the Supabase SQL editor.

### 4. Set Environment Variables on Supabase
New edge functions need these in Supabase dashboard → Settings → Edge Functions:
- `OPENAI_API_KEY` — already set (used by analyze-photos)
- `REIMAGINE_API_KEY` — optional, for REimagineHome renders; falls back to DALL-E if not set

### 5. Seed `trade_types` on Existing Companies
Existing company rows have `trade_types = {}` (empty array). The `dispatch-slots` function filters by `trade_types`. Either:
- Add a trade type selection step to company onboarding
- Or seed existing companies with `general_contractor` as default

---

## Important Notes

- `material_order_bids` table still exists in DB — it's just not surfaced in UI anymore. Do not drop it.
- `dispatch-job` edge function still exists for legacy paths — do not remove.
- LiDAR `roomDimensions` values are in **meters**. The store uses **feet as strings**. Always convert: `meters * 3.28084`.
- `quote_line_items.unit_cost` and `total_cost` are in **CAD cents** (integer), same as all other money fields.
- `generate-trade-slots` is called **synchronously** in `confirm.tsx` before navigating away — this is intentional since we need slots to exist before dispatching.
- `dispatch-slots` is called **fire-and-forget** (non-blocking) — same pattern as the old `dispatch-job`.
- The `scheduling_status: 'pending_homeowner'` is set automatically by `atomic_accept_slot()` when the last open slot is filled — no manual trigger needed.
- Material orders should only be generated **after** the homeowner confirms the schedule (done in `schedule.tsx` → calls `generate-material-orders`).

---

## File Reference Quick Map

```
src/
  navigation/
    RootNavigator.tsx           ← all screen registrations here
  app/
    (homeowner)/
      room-scan.tsx             ← LiDAR capture (Phase 1 ✅)
      room-results.tsx          ← LiDAR results (Phase 1 ✅)
      project/create/
        measurements.tsx        ← LiDAR entry point (Phase 1 ✅)
        confirm.tsx             ← now calls generate-trade-slots + dispatch-slots (Phase 2 ✅)
        analyzing.tsx           ← needs Phase 7 update
        renders.tsx             ← needs Phase 6 update
      project/[id]/
        schedule.tsx            ← NEW, needs nav registration (Phase 2 ✅)
        quote.tsx               ← needs Phase 5 line items update
        index.tsx               ← needs slot progress display (suggestion)
    (company)/
      job/[id]/
        index.tsx               ← needs slot_id acceptance wiring (MUST DO)
        materials.tsx           ← NEW, needs nav registration (Phase 3 ✅)
    (supplier)/
      orders/
        index.tsx               ← claim order (Phase 4 ✅)

supabase/
  migrations/
    009_trade_slots.sql         ← NEW (Phase 2 ✅)
  functions/
    generate-trade-slots/       ← NEW (Phase 2 ✅)
    dispatch-slots/             ← NEW (Phase 2 ✅)
    accept-job/                 ← UPDATED (Phase 2 ✅)
    claim-material-order/       ← NEW (Phase 4 ✅)
    generate-render/            ← needs Phase 6 update
    generate-questionnaire/     ← needs Phase 7 activation

src/data/
  pricing-reference.ts          ← lookupMaterialPrice(), estimateProjectCost()
  fixed-questions.ts            ← fallback questions (used if Phase 7 fails)
```

---

## Verification Checklist

- [x] LiDAR scan → measurements auto-populate → cost estimate uses real dimensions
- [ ] RootNavigator registers `ProjectSchedule` and `JobMaterials` screens
- [ ] Contractor `job/[id]/index.tsx` passes `slot_id` when accepting
- [ ] Project creation → slots generated by AI (e.g. plumber + electrician + tile)
- [ ] Slot dispatched only to companies with matching `trade_types`
- [ ] All slots filled → homeowner receives `all_slots_filled` notification
- [ ] Homeowner approves dates in `schedule.tsx` → all contractors notified → material orders generated
- [ ] Contractor can adjust material quantities in `job/[id]/materials.tsx`
- [ ] Supplier sees order (no bid form) → claims at fixed price
- [ ] Quote shows separate labour + material line items (Phase 5)
- [ ] AI renders generated (Phase 6)
- [ ] Conditional questionnaire live (Phase 7)
- [ ] All milestones paid → project marked completed → rating requested
