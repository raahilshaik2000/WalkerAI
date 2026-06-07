# WalkerAI App Audit and Change Log

This document records three things:

1. What the app looked like before the audit/fix pass began.
2. What was changed during the audit/fix pass.
3. What still remains before the app can be considered fully production-ready.

This is based on the current repo state, the local audit ledger, and the code that was inspected while working. It is not a live deployment report. The local test suite has been used heavily, but the deployed Supabase project and native devices still need separate end-to-end verification before anyone should call the app fully complete.

## 1. What Existed Before The Fix Pass

### Product shape

The app already had the core structure of a renovation marketplace and workflow engine:

- A homeowner flow for creating projects from photos, measurements, questionnaire answers, and AI-generated brief data.
- A company/trade flow for receiving dispatched jobs, accepting jobs, preparing quotes, reviewing milestones, and uploading progress evidence.
- A supplier flow for material orders, claims, fulfillment, delivery proof, payout tracking, and supplier earnings.
- A Supabase-backed backend with migrations, policies, edge functions, and a fairly strict workflow model around project status, slots, quotes, milestones, and payment release.

That said, a lot of the app was already “present” but not yet fully coherent end to end. Several workflows existed in the UI, but the backend status transitions or compatibility guards were not always aligned with the screens that depended on them.

### Homeowner workflow before changes

The homeowner side already contained the main creation flow:

- Photo upload and photo analysis.
- Measurement capture and room scan flow.
- Questionnaire flow.
- AI brief generation.
- Final dispatch / send-to-contractors step.
- Project detail, quote, schedule, milestones, materials, permits, warranties, reviews, messages, and change orders.

But there were important gaps and inaccuracies:

- Some screens exposed actions that were not always reachable in the correct state.
- Several status labels were accurate only from a narrow UI perspective, not from the actual workflow state.
- Some “visual generation” behavior was still using an AI render fallback instead of a dependable productized customization experience.
- The schedule and quote/payment transitions were not always in sync, especially for multi-trade projects.
- There were historical compatibility issues with old schema variants and older rows.

### Company/trade workflow before changes

The company workflow already included:

- A dashboard and job detail page.
- Job acceptance.
- Quote building.
- Milestones and release flow.
- Progress photos and attachment handling.
- Material verification.
- Change orders.
- Reviews and closeout behavior.

Before the fixes, this area had several real issues:

- Quote submission could succeed without the state model being fully synchronized back to the homeowner-facing project state.
- Some company-facing data was correct, but the homeowner UI did not always reflect it at the right time.
- Acceptance-to-quote and quote-to-payment transitions were easy to get out of sync if you looked at only one screen.

### Supplier workflow before changes

The supplier side already had:

- Catalog management.
- Orders and active orders.
- Claim, processing, shipped, delivered, confirmed, and paid states.
- Payout / earnings views.
- Onboarding for business and license details.

But the system depended on a lot of backend invariants:

- Material orders only make sense once the project is truly ready.
- Status transitions must be strict because supplier payout depends on delivery proof and approval.
- Older schemas and missing optional columns had to be handled carefully.

### AI and workflow logic before changes

There was already a strong automation backbone:

- `generate-project-brief`
- `generate-trade-slots`
- `dispatch-slots`
- `accept-job`
- `generate-material-orders`
- `create-payment-intent`
- `stripe-webhook`
- `release-milestone`
- `supplier-payout`

The issue was not lack of features. The issue was workflow coherence:

- A status could be set in one place without the next screen knowing what it meant.
- Some screens assumed a later step had already happened.
- Some backend functions were permissive in ways that made older or partial data look “complete”.

### Voice and customizer before changes

Before this pass, the app did not have a dependable voice-assisted questionnaire flow and did not have a real 3D kitchen/bath customization product path.

The state of those features was roughly:

- Voice: not implemented as a real usable product path.
- Visual customization: an AI render path existed, but it was not reliable enough to be the last step in a project creation flow.

### Main inaccuracies and broken edges before changes

The audit uncovered a consistent pattern:

- Many screens were directionally right but not fully synchronized with the backend status model.
- Several compatibility fallbacks were missing, so older schema variants could fail or look successful when they were not.
- Some important “done” states were declared in UI before the workflow was actually safe to proceed.
- Payment, schedule, quote approval, and material order generation were not fully aligned across all screens and functions.

## 2. What Was Changed

### Quote and project status synchronization

The most important workflow fixes were around quote submission and project status.

Changes made:

- Added a local migration to sync project status to `quoting` when a pending quote is created or updated.
- Limited that automatic update to eligible states so terminal states are not overwritten.
- Updated the homeowner project detail view so the schedule action remains reachable when the project is in `quoting` but still waiting for homeowner schedule confirmation.
- Updated homeowner schedule confirmation so it does not blindly rewrite the project back to `scheduling` when a quote is still pending.

Why this mattered:

- Quote submission was real, but the homeowner-facing project status could remain stale.
- Scheduling could accidentally hide the fact that payment still had to happen.
- The UI needed to reflect “quote pending” and “schedule pending” without losing either action.

### Payment-first activation fix

The next issue was the inverse path: payment could happen before schedule confirmation.

Changes made:

- Added a shared activation helper to check whether all schedulable trade slots have approved quotes.
- Patched homeowner schedule confirmation so:
  - if there are pending quotes, the project stays in `quoting`;
  - if all required quotes are already approved and the schedule is confirmed, the project can move to `active`;
  - material order generation is triggered when activation is actually complete.
- Patched the Stripe webhook so slot-based projects do not become `active` just because quotes are paid; they also require schedule confirmation first.
- Added a legacy-schema fallback in the Stripe webhook so older project rows without `scheduling_status` do not block activation.
- Preserved legacy no-slot behavior so old direct-quote projects can still activate after payment without being blocked by the new slot-based scheduling rule.

Why this mattered:

- Before this fix, the workflow could “skip” the schedule gate.
- After the earlier fix, there was a risk of getting stuck in `scheduling` or `quoting` even when the correct next step had already happened.
- The app now has a more truthful transition model:
  - pending quote -> `quoting`
  - schedule confirmed + payment complete -> `active`

### Voice assistant V1

The app now has a usable voice-assisted project questionnaire path.

What was added:

- iOS-native voice capability using native speech / speech synthesis plumbing.
- A voice questionnaire flow that asks project questions aloud and fills answers from spoken responses.
- Address voice capture/search support.
- Safer prompting and listening behavior so it does not listen too early or mis-handle numeric transcripts.
- A fallback state that disables visible voice controls on unsupported devices instead of pretending the app is broken.

What this means:

- The feature exists as a real V1.
- It is not a “perfect” voice agent, and it is not a cloud-telephony style conversational system.
- It is a practical, free, app-native speech input and voice prompt system.

### Visual customization / finish selection

The app now has a usable kitchen/bath finish customization V1 in the project creation flow.

What was added or tightened:

- A free SVG-based visual preview step for finish selection.
- Structured finish persistence in project questionnaire answers.
- Durable display of finish provenance so a finish choice can be labeled as:
  - `Homeowner selected`
  - `From questionnaire`
  - `Preview default`
- Safer mapping so default preview choices do not silently become confirmed homeowner intent.

What was intentionally not claimed:

- This is not a true fully interactive 3D kitchen configurator yet.
- It is a strong visual preview / finish selection layer, not a production 3D model editor with raycast selection, object-level materials, and fully parametric geometry.

### Room plan and measurement fixes

The room measurement and room-plan flow was corrected earlier in the audit process.

Key fixes:

- Native RoomPlan dimension serialization now uses projected wall extents rather than duplicating a first-wall length into both dimensions.
- Manual/generated measurement fallbacks were tightened so malformed values do not silently slip into estimates or previews.

Why this mattered:

- Measurement data feeds budget and preview logic.
- Bad dimensions can corrupt pricing, render selection, and downstream workflow assumptions.

### Dispatch and contractor acceptance fixes

The project dispatch flow was hardened in multiple places.

Fixes included:

- Dispatch only starts from budgeted project states that are actually ready.
- Contractor notifications are only sent when the project state is valid.
- Expired dispatch windows can no longer be accepted as if they were still live.
- Homeowner restart search now regenerates trade slots and clears stale dispatch logs before re-dispatching.

Why this mattered:

- The dispatch system had to stop pretending that stale or expired workflows were still actionable.
- A contractor acceptance path is only meaningful if the project state is actually open.

### Quote integrity and line-item persistence

The company quote builder was hardened.

Fixes included:

- Quote line-item persistence is now required, not optional.
- The app now treats line-item write failures as fatal so a homeowner cannot fund a quote that is missing its breakdown.
- Quote line items and milestone totals are compared in cents with a small rounding tolerance so totals do not drift.

Why this mattered:

- The quote screen is not just presentation; it is the basis for payment and later milestone logic.
- Silent failure here is financially dangerous.

### Milestones and release flow

The milestone release path was tightened.

Fixes included:

- Contractors cannot release payment without progress evidence.
- Homeowner milestone screens show evidence more clearly.
- Release logic requires appropriate milestone evidence before transfer.
- Project completion now waits for the correct project-wide condition across approved quotes and released milestones.

Why this mattered:

- This is the closeout chain of the app.
- If milestones can be released out of sequence, the whole project lifecycle becomes untrustworthy.

### Supplier and material flow

Supplier-related pieces were hardened so they fit the active project lifecycle.

Fixes included:

- Material order generation is guarded by real project readiness.
- Material order status synchronization was added so the app UI stays in sync with backend order states.
- Supplier payout requires delivery proof and supported payout readiness.
- Supplier active-order transitions are scoped to the signed-in supplier and expected status.

Why this mattered:

- Supplier flow depends on the rest of the project lifecycle being accurate first.
- A supplier should not see or act on orders that are not actually theirs or not actually live.

### Uploads and file handling

Several upload paths were normalized.

Fixes included:

- Photo/document picker metadata preservation.
- HEIC / HEIF compatibility for project photos and avatars.
- Safer uploads for permits, warranties, onboarding docs, delivery proof, avatars, and project evidence.

Why this mattered:

- Uploads are a common point of silent breakage on iOS.
- The app needs to preserve file type and extension data correctly so the backend and storage rules work as intended.

### Settings, profile, and account flows

Multiple account/profile settings were corrected or made more honest.

Examples:

- Profile fields persist to the backend instead of only locally.
- Address data persists correctly.
- Delete-account and export-data actions now create real backend requests or show honest state when they cannot.
- Notification settings tolerate older schema variants.

### Compatibility and schema fallback work

There was a large amount of compatibility hardening throughout the app.

This included:

- Missing optional columns.
- Older RLS/policy variants.
- Legacy quote shape variants.
- Legacy material order and review schema quirks.
- Older project rows that do not match the newest schema exactly.

This is a major reason the app became more reliable: it now has fewer “looks good locally, breaks on older data” failure modes.

## 3. What Is Still Left To Do

This is the part that matters most for production readiness.

### Live deployment validation

Not complete yet.

Still needed:

- Deploy the local Supabase migrations.
- Deploy the edge function changes.
- Confirm the deployed backend matches the local code.
- Re-run the flows against the live project, not only local source checks.

### Full three-account E2E

Not yet proven end to end in a live environment.

Still needed:

- Homeowner:
  - create project
  - analyze photos
  - capture measurements
  - answer questionnaire
  - dispatch
  - receive quote
  - pay
  - confirm schedule
  - follow milestones
  - review completion
- Company/trade:
  - receive dispatched project
  - accept trade
  - build quote
  - verify materials
  - submit progress
  - complete milestones
  - handle change orders and review closeout
- Supplier:
  - receive material orders
  - claim order
  - process, ship, deliver
  - confirm payout

### Voice assistant production hardening

The voice assistant exists, but it is not a final polished voice product.

Still needed:

- Physical device QA on iPhone.
- Better conversational recovery when recognition fails or the user changes their answer mid-prompt.
- Clearer fallback states for low-confidence speech or unsupported contexts.
- Product decision on whether the assistant remains iOS-native only or gets a more advanced cloud voice layer later.

### 3D customization product decision

This is not finished as a true 3D product.

What exists now:

- Visual finish selection.
- A structured place to store finish intent.

What still needs product decisions:

- Whether to build true 3D object editing with room geometry.
- Whether to use Three.js / native 3D / a model viewer pipeline.
- How cabinet/countertop materials should map into budget generation.
- Whether geometry comes from RoomPlan, a simplified parametric scene, or a generated room model.

### Screenshot-driven client feedback

The client screenshots were referenced in the request, but this session still needs a dedicated pixel-level comparison pass if the goal is to fully close every UI issue from those screenshots.

Still needed:

- Read the screenshots against the live UI in a browser or simulator.
- Map each screenshot complaint to a visible UI defect.
- Confirm each fix is the right one for the actual app, not just a plausible one.

### Final production signoff

Still needed:

- Real device checks for voice and iOS file handling.
- Full smoke on the live backend.
- A final cross-account pass to verify no status path is stale after the latest lifecycle fixes.

## 4. Verification Status

What has been verified locally:

- TypeScript.
- ESLint.
- Full Jest suite.
- Diff whitespace.

Latest local test result at the time of this document:

- `41` test suites passed.
- `167` tests passed.

That is strong local evidence, but it is not the same as live production verification.

## 5. Bottom Line

The app is much more coherent now than it was at the start of the audit:

- Project creation is more honest.
- Quote status is now synchronized with the homeowner UI.
- Schedule and payment activation are aligned.
- Dispatch, milestones, uploads, and supplier fulfillment are less brittle.
- Voice and visual customization exist as real V1 features instead of placeholders.

What is still missing is live deployment confirmation, true end-to-end account testing against the deployed backend, and a final product decision on whether the visual customization feature becomes a real 3D configurator or remains a refined 2D/3D-preview hybrid.
