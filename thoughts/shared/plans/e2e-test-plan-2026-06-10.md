---
date: 2026-06-10
status: ready
target: production (wgbloslndalmocckrejw)
---

# Full 3-Account E2E Test Plan

## Goal

Drive Homeowner → Company → Supplier through a complete project lifecycle
against the live deployed backend to surface any bugs that integration of
the audit work, this session's fixes, and the migration push didn't catch.

## Setup before testing

| Item | Status |
|---|---|
| All 18 edge functions deployed | ✅ Done in Stream A this session |
| All 47 schema migrations applied | ✅ Done in Stream B this session |
| Bundle ID changed to `com.walkerai.app` | ✅ Done |
| Push notifications native code | ✅ Done |
| APNs key uploaded to Supabase secrets | ⚠️ Manual — see Item #3 instructions in deploy plan |
| TestFlight build with latest `main` | ⚠️ User must re-archive in Xcode |
| 3 QA accounts created | ⚠️ Pending — created in next step of this session |
| Stripe Connect test account for Company role | ⚠️ Need test mode keys; can be skipped if not testing payouts |

## Account inventory

These accounts will be created on live Supabase:

| Role | Email | Password | Notes |
|---|---|---|---|
| Homeowner | `qa-homeowner@walkerai.app` | _TBD_ | Drives project creation, payment, reviews |
| Company | `qa-company@walkerai.app` | _TBD_ | Receives dispatch, builds quote, submits milestones |
| Supplier | `qa-supplier@walkerai.app` | _TBD_ | Receives material orders, fulfills |

## Critical-path test sequence

Execute in order. Each section is independent enough that a single bug in
one section shouldn't block testing the others, but later sections depend
on earlier ones for project state.

### Phase 1 — Homeowner: project creation (15 min)

1. Sign in as `qa-homeowner@walkerai.app`
2. Tap **Get Estimate** → pick **Bathroom** (or Kitchen)
3. Photos → pick 4+ images
4. Tap **Analyze with AI**
   - ✅ Verify: no "Brief generation failed" or "Could not find ai_confidence_score" errors
   - ✅ Verify: brief generation completes, returns reasonable cost estimate (CAD)
5. Measurements step → tap **Scan with Camera** for mock scan, OR enter manual measurements
6. Room Results → verify 2D floor plan looks right (post-fix from earlier session)
7. **Use These Measurements**
8. Questionnaire → answer all questions
   - ✅ Verify: room type is bathroom-specific (not kitchen questions)
   - ✅ Try voice answer on one question → confirm voice confirmation step appears
9. Visual Preview Step 5 → 3D customizer
   - ✅ Verify: customizer shows bathroom surfaces (vanity, vanity counter, shower tile, floor tile, fixtures)
   - ✅ Tap a wall → bottom sheet → pick a color → verify ALL walls change (not just one)
   - ✅ Pick a granite countertop → verify it has speckled texture (not flat grey)
   - ✅ Pick a wood floor → verify it has grain pattern
   - ✅ Pick a marble surface → verify smooth veining (not jagged lines)
10. Address → fill in
11. Brief generation
    - ✅ Verify: uses correct province for pricing (BC ≠ Ontario)
12. Confirm → triggers slot generation + dispatch
13. Back to dashboard → verify project appears with `dispatching` status

### Phase 2 — Company: receive dispatch + quote (10 min)

Switch to second device or sign out → sign in as `qa-company@walkerai.app`.

1. Company onboarding (first time only): business info, license, insurance, service radius
2. Dashboard → see the dispatched project as an incoming invite
   - ✅ Verify: trade matching is correct (general_contractor for backfill case)
   - ✅ Verify: shows slot-level estimated value, not whole-project budget
3. Tap the invite → Job Detail
4. **Accept** the job (within 2-hour dispatch window)
   - ✅ Verify: accept succeeds (no `atomic_accept_slot does not exist` errors)
5. Material verification screen
   - ✅ Verify: shows homeowner's brand/finish/model preferences (if entered)
   - ✅ Update at least one quantity → save
6. Tap **Build Quote** → add line items + milestones
   - ✅ Verify: line item validation rejects negative amounts
   - ✅ Verify: line items + milestone totals must match within 1 cent
7. Submit quote
   - ✅ Verify: quote_line_items table populated (not just quotes row)

### Phase 3 — Homeowner: quote approval + payment (10 min)

Switch back to homeowner.

1. Dashboard → see project moved to `quoting` status
2. Open project → Quote tab
3. Review quote details
4. **Pay** → Stripe payment sheet (use Stripe test card 4242 4242 4242 4242)
   - ✅ Verify: payment intent creation succeeds
   - ✅ Verify: webhook fires, project moves to `scheduling` or `active` per multi-trade rules
5. Schedule confirmation → pick dates
6. ✅ Verify: all dates set → project activates

### Phase 4 — Supplier: receive + fulfill material orders (15 min)

Sign in as `qa-supplier@walkerai.app`.

1. Supplier onboarding (first time): business info, license, categories, service radius, **Stripe Connect** payout setup (test mode)
2. Supplier catalog → add 2-3 items in relevant categories
3. Orders feed → see the material order from the homeowner's project
   - ✅ Verify: shows fixed price (no bid form)
4. **Claim** the order
5. Active orders → mark **Processing** → **Shipped** → **Delivered**
   - ✅ Verify: each transition succeeds
   - ✅ Verify: homeowner gets `order_shipped` and `order_delivered` push notifications (if APNs configured)
6. Upload delivery proof photo

### Phase 5 — Homeowner: confirm delivery + supplier payout (5 min)

1. Homeowner: Materials tab on project
2. ✅ Verify: delivery proof photo is visible
3. **Confirm Delivery** → triggers supplier payout
4. ✅ Verify: supplier gets `supplier_paid` notification

### Phase 6 — Company: milestone progression (15 min)

Sign in as company.

1. Job Detail → Milestones tab
2. Mark a milestone in-progress, upload a progress photo
3. Mark **Complete**
   - ✅ Verify: cannot mark complete without uploaded progress photo (server-side guard)

### Phase 7 — Homeowner: milestone approval + release (5 min)

Sign in as homeowner.

1. Project → Milestones tab
2. ✅ Verify: progress photo is visible (image renders, not just placeholder)
3. **Approve & Release Payment**
4. ✅ Verify: company gets `milestone_paid` notification

### Phase 8 — Project completion + reviews (10 min)

Repeat Phase 6 + 7 for all milestones until project completes.

1. Homeowner: Review screen appears
2. Submit homeowner → contractor review
3. Sign in as company → review prompt for homeowner → submit
4. ✅ Verify: both reviews persist; ratings update correctly

### Edge cases worth poking

- **Dispute flow:** Open milestone dispute as homeowner. Verify it surfaces in company view and blocks release.
- **Change order:** Create from company side. Verify cost delta shows signed, doesn't auto-adjust escrow.
- **Warranty upload:** Company uploads warranty doc at project end. Verify homeowner can view.
- **Notification deep links:** Tap a push notification → verify it routes to the right screen.
- **Voice flow:** Run questionnaire by voice on a real device with the audio session fix.

## What to do if something breaks

For each failure:
1. **Screenshot** the error.
2. **Note** which phase + step.
3. **Check Supabase logs:** `supabase functions logs <fn-name> --project-ref wgbloslndalmocckrejw --since 5m`
4. Share with me (or future Claude session) — provide phase number, step, screenshot, log excerpt.

## Sign-off criteria

E2E test passes when:
- ✅ All 8 phases complete without unrecoverable errors
- ✅ All 3 roles see appropriate notifications + state
- ✅ Payment flow completes (test mode Stripe)
- ✅ Reviews persist for all parties
- ✅ At least 2 push notifications observed end-to-end (if APNs is configured)

## Estimated total time

~80 minutes if everything works, 2-3 hours if multiple bugs surface.
